export type TransactionKind = "income" | "expense";

export type Transaction = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  account: string;
  amount: number;
  kind: TransactionKind;
  source: string;
  notes?: string;
  excludedFromAnalytics?: boolean;
  importedAt?: string;
};

export type NewTransactionInput = {
  date: string;
  merchant: string;
  category: string;
  account: string;
  amount: number;
  kind: TransactionKind;
  notes?: string;
  excludedFromAnalytics?: boolean;
};

export type TransactionUpdate = Partial<
  Pick<
    Transaction,
    | "merchant"
    | "category"
    | "kind"
    | "notes"
    | "excludedFromAnalytics"
  >
>;

export type CategoryRule = {
  id: string;
  keywords: string;
  category: string;
  kind?: TransactionKind;
};

export type ImportBatch = {
  id: string;
  file: string;
  importedAt: string;
  rows: number;
  added: number;
  skipped: number;
};

export type CategorySummary = {
  name: string;
  amount: string;
  value: number;
  share: number;
  count: number;
};

export type MonthlySummary = {
  month: string;
  net: string;
  income: string;
  spent: string;
  transactionCount: number;
};
