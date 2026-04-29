import type { TransactionKind } from "./types";

const cnyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
});

const cnyCompactFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number) {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";

  return `${sign}${cnyFormatter.format(Math.abs(amount))}`;
}

export function formatCurrencyPlain(amount: number) {
  return cnyCompactFormatter.format(amount);
}

export function formatDateZh(date: string) {
  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(parsed);
}

export function formatFullDateZh(date: string) {
  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(parsed);
}

export function transactionKindLabel(kind: TransactionKind | string) {
  const labels: Record<TransactionKind, string> = {
    income: "收入",
    expense: "支出",
  };

  return kind === "income" || kind === "expense" ? labels[kind] : labels.expense;
}

export function transactionKindFromLabel(label: string): TransactionKind | null {
  const normalized = label.trim();

  if (normalized === "收入" || normalized.toLowerCase() === "income") {
    return "income";
  }

  if (normalized === "支出" || normalized.toLowerCase() === "expense") {
    return "expense";
  }

  return null;
}
