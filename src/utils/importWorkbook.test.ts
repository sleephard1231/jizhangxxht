import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Transaction } from "../domain/types";
import {
  buildImportResult,
  markDuplicateRows,
  parseWorkbookFile,
} from "./importWorkbook";

const docsDir = join(process.cwd(), "design", "docs");

async function loadFixtureFile(fileName: string, type: string) {
  const buffer = await readFile(join(docsDir, fileName));

  return new File([new Uint8Array(buffer)], basename(fileName), { type });
}

describe("parseWorkbookFile", () => {
  it("可以解析支付宝 CSV 的收入、支出和中性交易", async () => {
    const file = await loadFixtureFile(
      "支付宝交易明细(20260101-20260429).csv",
      "text/csv",
    );
    const parsed = await parseWorkbookFile(file);
    const expenseRows = parsed.rows.filter((row) => row.type === "支出");
    const incomeRows = parsed.rows.filter((row) => row.type === "收入");
    const neutralRows = parsed.rows.filter((row) => row.type === "中性");

    expect(parsed.rowCount).toBeGreaterThan(100);
    expect(expenseRows.length).toBeGreaterThan(0);
    expect(incomeRows.length).toBeGreaterThan(0);
    expect(neutralRows.length).toBeGreaterThan(0);
    expect(expenseRows.every((row) => (row.amountValue ?? 0) <= 0)).toBe(true);
    expect(incomeRows.every((row) => (row.amountValue ?? 0) >= 0)).toBe(true);
    expect(neutralRows.every((row) => row.excludedFromAnalytics)).toBe(true);
  });

  it("可以解析微信 XLSX 的日期、金额和商户字段", async () => {
    const file = await loadFixtureFile(
      "微信支付账单流水文件(20260101-20260428)——【解压密码可在微信支付公众号查看】.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const parsed = await parseWorkbookFile(file);
    const importableRows = parsed.rows.filter(
      (row) => row.date !== "--" && row.amountValue !== null,
    );

    expect(parsed.rowCount).toBeGreaterThan(0);
    expect(importableRows.length).toBeGreaterThan(0);
    expect(importableRows[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(importableRows[0].merchant).not.toBe("");
    expect(Number.isFinite(importableRows[0].amountValue)).toBe(true);
  });

  it("重复导入时会把同日期、同金额、同商户标记为可能重复", async () => {
    const file = await loadFixtureFile(
      "支付宝交易明细(20260101-20260429).csv",
      "text/csv",
    );
    const parsed = await parseWorkbookFile(file);
    const { transactions } = buildImportResult(parsed);
    const existingTransactions: Transaction[] = transactions.slice(0, 12);
    const checkedRows = markDuplicateRows(parsed.rows, existingTransactions);
    const duplicateRows = checkedRows.filter((row) => row.status === "可能重复");

    expect(existingTransactions.length).toBeGreaterThan(0);
    expect(duplicateRows.length).toBeGreaterThan(0);
  });
});
