import type {
  CategoryRule,
  ImportBatch,
  Transaction,
  TransactionKind,
} from "../domain/types";
import { findMatchingCategoryRule } from "./categoryRules";
import { hasSameTransactionIdentity } from "./transactionIdentity";

export type TargetField =
  | "date"
  | "merchant"
  | "amount"
  | "income"
  | "expense"
  | "category"
  | "account"
  | "notes"
  | "currency"
  | "direction"
  | "transactionStatus"
  | "ignore";

export type ColumnMapping = {
  source: string;
  sample: string;
  target: TargetField;
  confidence: "high" | "medium" | "low";
};

export type ParsedImportRow = {
  row: number;
  date: string;
  merchant: string;
  parsedAmount: string;
  amountValue: number | null;
  type: "收入" | "支出" | "中性" | "需检查";
  status: string;
  category: string;
  account: string;
  notes: string;
  excludedFromAnalytics?: boolean;
};

export type ParsedWorkbook = {
  fileName: string;
  sheetName: string;
  rowCount: number;
  columns: ColumnMapping[];
  rows: ParsedImportRow[];
  warnings: string[];
};

type WorkbookRecord = Record<string, unknown>;

const fieldLabels: Record<TargetField, string> = {
  date: "日期",
  merchant: "商户",
  amount: "带正负号金额",
  income: "收入",
  expense: "支出",
  category: "分类",
  account: "账户",
  notes: "备注",
  currency: "币种",
  direction: "收支方向",
  transactionStatus: "交易状态",
  ignore: "忽略",
};

export function getTargetFieldLabel(target: TargetField) {
  return fieldLabels[target];
}

export async function parseWorkbookFile(
  file: File,
  categoryRules: CategoryRule[] = [],
): Promise<ParsedWorkbook> {
  const XLSX = await import("xlsx");
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read(await readCsvText(file), {
        type: "string",
        raw: false,
        cellDates: true,
      })
    : XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("这个工作簿里没有可读取的工作表。");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex < 0) {
    throw new Error("无法识别表头，请确认账单里包含日期、金额、商户或收/支等列。");
  }
  const headers = (matrix[headerRowIndex] ?? []).map((cell) => stringifyCell(cell));
  const records = matrix.slice(headerRowIndex + 1).map((row) =>
    headers.reduce<WorkbookRecord>((record, header, index) => {
      if (header) {
        record[header] = row[index] ?? "";
      }

      return record;
    }, {}),
  );

  if (records.length === 0) {
    throw new Error("第一个工作表是空的。");
  }

  const columns = headers.map((header) => ({
    source: header,
    sample: stringifyCell(records.find((row) => stringifyCell(row[header]))?.[header]),
    ...inferTargetField(header),
  }));

  const rows = records.map((record, index) => {
    const valueFor = (target: TargetField) =>
      stringifyCell(record[columns.find((column) => column.target === target)?.source ?? ""]);

    const date = normalizeDate(valueFor("date"));
    const merchant =
      valueFor("merchant") ||
      valueFor("notes") ||
      stringifyCell(record[headers[0] ?? ""]) ||
      "未知";
    const notes = buildNotes(record, columns);
    const direction = valueFor("direction");
    const transactionStatus = valueFor("transactionStatus");
    const amountValue = resolveAmountValue(record, columns, direction);
    const rule = matchCategoryRule(`${merchant} ${notes}`, categoryRules);
    const category = valueFor("category") || rule?.category || "其他";
    const kind = inferTransactionKind(amountValue, rule?.kind, direction);
    const account = valueFor("account") || "导入记录";
    const parsedAmount =
      amountValue === null ? "--" : formatPreviewCurrency(amountValue);
    const status = resolveStatus(date, amountValue, merchant, transactionStatus);

    return {
      row: index + 1,
      date: date || "--",
      merchant,
      parsedAmount,
      amountValue,
      type: isNeutralDirection(direction)
        ? "中性"
        : parsedTypeFromKind(kind, amountValue),
      status,
      category,
      account,
      notes,
      excludedFromAnalytics: isNeutralDirection(direction),
    };
  });

  const warnings = buildWarnings(rows, columns);

  return {
    fileName: file.name,
    sheetName,
    rowCount: records.length,
    columns,
    rows,
    warnings,
  };
}

export function markDuplicateRows(
  rows: ParsedImportRow[],
  existingTransactions: Transaction[],
) {
  return rows.map((row) => {
    if (row.date === "--" || row.amountValue === null) {
      return row;
    }

    const isDuplicate = hasSameTransactionIdentity(
      {
        date: row.date,
        amount: row.amountValue,
        merchant: row.merchant,
      },
      existingTransactions,
    );

    return isDuplicate ? { ...row, status: "可能重复" } : row;
  });
}

export function buildImportResult(parsedWorkbook: ParsedWorkbook) {
  const importedAt = new Date().toISOString().slice(0, 10);
  const validRows = parsedWorkbook.rows.filter(
    (row) => isImportableRow(row),
  );
  const transactions: Transaction[] = validRows.map((row) => {
    const kind = kindFromParsedType(row.type);

    return {
      id: `import-${crypto.randomUUID?.() ?? `${Date.now()}-${row.row}`}`,
      date: row.date,
      merchant: row.merchant,
      category: row.category,
      account: row.account,
      amount: row.amountValue ?? 0,
      kind,
      source: parsedWorkbook.fileName,
      notes: row.notes,
      importedAt,
      excludedFromAnalytics: Boolean(row.excludedFromAnalytics),
    };
  });
  const batch: ImportBatch = {
    id: `batch-${crypto.randomUUID?.() ?? Date.now()}`,
    file: parsedWorkbook.fileName,
    importedAt,
    rows: parsedWorkbook.rowCount,
    added: transactions.length,
    skipped: Math.max(0, parsedWorkbook.rowCount - transactions.length),
  };

  return { transactions, batch };
}

export function isImportableRow(row: ParsedImportRow) {
  return (
    row.date !== "--" &&
    row.amountValue !== null &&
    row.status !== "可能重复" &&
    !row.status.includes("跳过")
  );
}

function inferTargetField(header: string): Pick<ColumnMapping, "target" | "confidence"> {
  const normalized = header.toLowerCase().replace(/[\s_-]+/g, "");
  const matches = (terms: string[]) => terms.some((term) => normalized.includes(term));

  if (matches(["date", "posted", "transactiondate", "日期", "交易日期", "交易时间", "时间"])) {
    return { target: "date", confidence: "high" };
  }

  if (matches(["交易单号", "商户单号", "订单号", "单号"])) {
    return { target: "ignore", confidence: "medium" };
  }

  if (matches(["merchant", "description", "payee", "details", "摘要", "描述", "商户", "对方"])) {
    return { target: "merchant", confidence: "high" };
  }

  if (matches(["收/支", "收支", "收入支出", "方向"])) {
    return { target: "direction", confidence: "high" };
  }

  if (matches(["transactionstatus", "status", "交易状态", "订单状态", "状态"])) {
    return { target: "transactionStatus", confidence: "high" };
  }

  if (matches(["收/付款方式", "付款方式", "支付方式", "收款方式", "账户", "卡号"])) {
    return { target: "account", confidence: "high" };
  }

  if (matches(["debit", "withdrawal", "outflow", "charge", "expense", "支出", "借方", "付款"])) {
    return { target: "expense", confidence: "high" };
  }

  if (matches(["credit", "deposit", "inflow", "income", "收入", "贷方", "入账"])) {
    return { target: "income", confidence: "high" };
  }

  if (matches(["amount", "sum", "value", "金额", "交易额"])) {
    return { target: "amount", confidence: "high" };
  }

  if (matches(["category", "类别", "分类"])) {
    return { target: "category", confidence: "medium" };
  }

  if (matches(["account", "card", "source"])) {
    return { target: "account", confidence: "medium" };
  }

  if (matches(["note", "remark", "memo", "备注", "商品", "交易类型"])) {
    return { target: "notes", confidence: "medium" };
  }

  if (matches(["currency", "ccy", "币种"])) {
    return { target: "currency", confidence: "medium" };
  }

  return { target: "ignore", confidence: "low" };
}

function resolveAmountValue(
  record: WorkbookRecord,
  columns: ColumnMapping[],
  direction = "",
) {
  const signed = parseAmount(getCellByTarget(record, columns, "amount"));

  if (signed !== null) {
    if (isExpenseDirection(direction)) {
      return -Math.abs(signed);
    }

    if (isIncomeDirection(direction)) {
      return Math.abs(signed);
    }

    return signed;
  }

  const income = parseAmount(getCellByTarget(record, columns, "income"));
  const expense = parseAmount(getCellByTarget(record, columns, "expense"));

  if (income !== null && income !== 0) {
    return Math.abs(income);
  }

  if (expense !== null && expense !== 0) {
    return -Math.abs(expense);
  }

  return null;
}

function getCellByTarget(
  record: WorkbookRecord,
  columns: ColumnMapping[],
  target: TargetField,
) {
  return record[columns.find((column) => column.target === target)?.source ?? ""];
}

function parseAmount(value: unknown) {
  const text = stringifyCell(value);

  if (!text) {
    return null;
  }

  const isParenthesized = /^\(.*\)$/.test(text.trim());
  const normalized = text
    .replace(/[,$￥¥HKDUSDCNYRMB元\s]/gi, "")
    .replace(/[()]/g, "");
  const number = Number(normalized);

  if (!Number.isFinite(number)) {
    return null;
  }

  return isParenthesized ? -Math.abs(number) : number;
}

function normalizeDate(value: string) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

function findHeaderRowIndex(rows: unknown[][]) {
  const index = rows.findIndex((row) => {
    const text = row.map((cell) => stringifyCell(cell)).join("|");

    return (
      text.includes("交易时间") ||
      text.includes("Transaction Date") ||
      (text.includes("日期") && (text.includes("金额") || text.includes("收/支")))
    );
  });

  return index;
}

async function readCsvText(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8Text = stripByteOrderMark(new TextDecoder("utf-8").decode(buffer));

  if (!utf8Text.includes("�")) {
    return utf8Text;
  }

  try {
    return stripByteOrderMark(new TextDecoder("gb18030").decode(buffer));
  } catch {
    return utf8Text;
  }
}

function stripByteOrderMark(text: string) {
  return text.replace(/^\uFEFF/, "");
}

function buildNotes(record: WorkbookRecord, columns: ColumnMapping[]) {
  const noteColumns = columns.filter((column) => column.target === "notes");
  const notes = noteColumns
    .map((column) => stringifyCell(record[column.source]))
    .filter((value) => value && value !== "/");

  return Array.from(new Set(notes)).join(" | ");
}

function matchCategoryRule(text: string, categoryRules: CategoryRule[]) {
  return findMatchingCategoryRule(text, categoryRules);
}

function inferTransactionKind(
  amountValue: number | null,
  ruleKind?: TransactionKind,
  direction = "",
): TransactionKind | "review" {
  if (amountValue === null) {
    return "review";
  }

  if (ruleKind) {
    return ruleKind;
  }

  if (isIncomeDirection(direction)) {
    return "income";
  }

  return amountValue > 0 ? "income" : "expense";
}

function parsedTypeFromKind(
  kind: TransactionKind | "review",
  amountValue: number | null,
): ParsedImportRow["type"] {
  if (kind === "review" || amountValue === null) {
    return "需检查";
  }

  if (kind === "income") {
    return "收入";
  }

  return "支出";
}

function kindFromParsedType(type: ParsedImportRow["type"]): TransactionKind {
  if (type === "收入") {
    return "income";
  }

  return "expense";
}

function resolveStatus(
  date: string,
  amountValue: number | null,
  merchant: string,
  transactionStatus = "",
) {
  if (!date) {
    return "缺少日期";
  }

  if (amountValue === null) {
    return "金额需检查";
  }

  if (!merchant || merchant === "未知") {
    return "缺少商户";
  }

  if (shouldSkipTransactionStatus(transactionStatus)) {
    return `${transactionStatus}，跳过`;
  }

  return "正常";
}

function shouldSkipTransactionStatus(status: string) {
  const normalized = status.trim();

  return (
    normalized.includes("交易关闭") ||
    normalized.includes("失败") ||
    normalized.toLowerCase().includes("failed") ||
    normalized.toLowerCase().includes("closed")
  );
}

function isIncomeDirection(direction: string) {
  return direction.includes("收入") || direction.toLowerCase().includes("income");
}

function isExpenseDirection(direction: string) {
  return direction.includes("支出") || direction.toLowerCase().includes("expense");
}

function isNeutralDirection(direction: string) {
  const normalized = direction.trim();

  return (
    normalized === "/" ||
    normalized.includes("中性") ||
    normalized.includes("不计收支") ||
    normalized.includes("不计入收支")
  );
}

function buildWarnings(rows: ParsedImportRow[], columns: ColumnMapping[]) {
  const missingDates = rows.filter((row) => row.status === "缺少日期").length;
  const missingAmounts = rows.filter((row) => row.status === "金额需检查").length;
  const ignoredColumns = columns.filter((column) => column.target === "ignore").length;
  const warnings = [];

  if (missingDates > 0) {
    warnings.push(`预览中有 ${missingDates} 行缺少日期。`);
  }

  if (missingAmounts > 0) {
    warnings.push(`有 ${missingAmounts} 行无法解析金额。`);
  }

  if (ignoredColumns > 0) {
    warnings.push(`有 ${ignoredColumns} 列暂未映射。`);
  }

  if (warnings.length === 0) {
    warnings.push("没有发现会阻塞导入的问题。");
  }

  return warnings;
}

function stringifyCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function formatPreviewCurrency(amount: number) {
  const sign = amount > 0 ? "+" : "-";

  return `${sign}${new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
  }).format(Math.abs(amount))}`;
}
