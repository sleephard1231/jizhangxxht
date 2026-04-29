import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CategoryRule,
  ImportBatch,
  Transaction,
  TransactionKind,
} from "../domain/types";

export type FinanceSnapshot = {
  selectedMonth: string;
  transactions: Transaction[];
  importHistory: ImportBatch[];
  categoryRules: CategoryRule[];
};

type TransactionRow = {
  user_id: string;
  id: string;
  date: string;
  merchant: string;
  category: string;
  account: string;
  amount: number;
  kind: TransactionKind;
  source: string;
  notes: string | null;
  excluded_from_analytics: boolean;
  imported_at: string | null;
};

type CategoryRuleRow = {
  user_id: string;
  id: string;
  keywords: string;
  category: string;
  kind: TransactionKind | null;
};

type ImportBatchRow = {
  user_id: string;
  id: string;
  file: string;
  imported_at: string;
  rows: number;
  added: number;
  skipped: number;
};

export async function loadCloudFinanceState(
  client: SupabaseClient,
  userId: string,
) {
  const [transactionsResult, rulesResult, importsResult] = await Promise.all([
    client
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false }),
    client
      .from("category_rules")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    client
      .from("import_batches")
      .select("*")
      .eq("user_id", userId)
      .order("imported_at", { ascending: false }),
  ]);

  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  if (rulesResult.error) {
    throw rulesResult.error;
  }

  if (importsResult.error) {
    throw importsResult.error;
  }

  return {
    transactions: ((transactionsResult.data ?? []) as TransactionRow[]).map(
      fromTransactionRow,
    ),
    categoryRules: ((rulesResult.data ?? []) as CategoryRuleRow[]).map(
      fromCategoryRuleRow,
    ),
    importHistory: ((importsResult.data ?? []) as ImportBatchRow[]).map(
      fromImportBatchRow,
    ),
  };
}

export async function saveCloudFinanceState(
  client: SupabaseClient,
  userId: string,
  state: FinanceSnapshot,
) {
  await Promise.all([
    syncTable(
      client,
      "transactions",
      userId,
      state.transactions.map((transaction) => toTransactionRow(userId, transaction)),
    ),
    syncTable(
      client,
      "category_rules",
      userId,
      state.categoryRules.map((rule) => toCategoryRuleRow(userId, rule)),
    ),
    syncTable(
      client,
      "import_batches",
      userId,
      state.importHistory.map((batch) => toImportBatchRow(userId, batch)),
    ),
  ]);
}

async function syncTable<Row extends { user_id: string; id: string }>(
  client: SupabaseClient,
  table: "transactions" | "category_rules" | "import_batches",
  userId: string,
  rows: Row[],
) {
  const existingResult = await client.from(table).select("id").eq("user_id", userId);

  if (existingResult.error) {
    throw existingResult.error;
  }

  const nextIds = new Set(rows.map((row) => row.id));
  const deletedIds = ((existingResult.data ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => !nextIds.has(id));

  if (deletedIds.length > 0) {
    const deleteResult = await client
      .from(table)
      .delete()
      .eq("user_id", userId)
      .in("id", deletedIds);

    if (deleteResult.error) {
      throw deleteResult.error;
    }
  }

  if (rows.length === 0) {
    return;
  }

  const upsertResult = await client
    .from(table)
    .upsert(rows, { onConflict: "user_id,id" });

  if (upsertResult.error) {
    throw upsertResult.error;
  }
}

function fromTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    merchant: row.merchant,
    category: row.category,
    account: row.account,
    amount: Number(row.amount),
    kind: row.kind,
    source: row.source,
    notes: row.notes ?? undefined,
    excludedFromAnalytics: row.excluded_from_analytics,
    importedAt: row.imported_at ?? undefined,
  };
}

function toTransactionRow(userId: string, transaction: Transaction): TransactionRow {
  return {
    user_id: userId,
    id: transaction.id,
    date: transaction.date,
    merchant: transaction.merchant,
    category: transaction.category,
    account: transaction.account,
    amount: transaction.amount,
    kind: transaction.kind,
    source: transaction.source,
    notes: transaction.notes ?? null,
    excluded_from_analytics: Boolean(transaction.excludedFromAnalytics),
    imported_at: transaction.importedAt ?? null,
  };
}

function fromCategoryRuleRow(row: CategoryRuleRow): CategoryRule {
  return {
    id: row.id,
    keywords: row.keywords,
    category: row.category,
    kind: row.kind ?? undefined,
  };
}

function toCategoryRuleRow(userId: string, rule: CategoryRule): CategoryRuleRow {
  return {
    user_id: userId,
    id: rule.id,
    keywords: rule.keywords,
    category: rule.category,
    kind: rule.kind ?? null,
  };
}

function fromImportBatchRow(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    file: row.file,
    importedAt: row.imported_at,
    rows: row.rows,
    added: row.added,
    skipped: row.skipped,
  };
}

function toImportBatchRow(userId: string, batch: ImportBatch): ImportBatchRow {
  return {
    user_id: userId,
    id: batch.id,
    file: batch.file,
    imported_at: batch.importedAt,
    rows: batch.rows,
    added: batch.added,
    skipped: batch.skipped,
  };
}
