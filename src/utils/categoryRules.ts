import type { CategoryRule, Transaction, TransactionKind } from "../domain/types";

export function splitRuleKeywords(rule: Pick<CategoryRule, "keywords">) {
  return rule.keywords
    .split(/[,，、\n]/)
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

export function findMatchingCategoryRule(
  text: string,
  rules: CategoryRule[],
) {
  const normalized = text.toLowerCase();

  return rules.find((rule) =>
    splitRuleKeywords(rule).some((keyword) => normalized.includes(keyword)),
  );
}

export function applyCategoryRulesToTransaction(
  transaction: Transaction,
  rules: CategoryRule[],
): Transaction {
  const rule = findMatchingCategoryRule(
    `${transaction.merchant} ${transaction.notes ?? ""}`,
    rules,
  );

  if (!rule) {
    return transaction;
  }

  return {
    ...transaction,
    category: rule.category,
    kind: inferKindFromRule(transaction.amount, rule.kind),
  };
}

export function inferKindFromRule(
  amount: number,
  ruleKind?: TransactionKind,
): TransactionKind {
  if (ruleKind === "income" && amount > 0) {
    return "income";
  }

  if (ruleKind === "expense" && amount < 0) {
    return "expense";
  }

  if (amount === 0 && ruleKind) {
    return ruleKind;
  }

  return amount > 0 ? "income" : "expense";
}
