type TransactionIdentity = {
  date: string;
  amount: number;
  merchant: string;
};

export function hasSameTransactionIdentity(
  candidate: TransactionIdentity,
  transactions: TransactionIdentity[],
) {
  const candidateKey = getTransactionIdentityKey(candidate);

  return transactions.some(
    (transaction) => getTransactionIdentityKey(transaction) === candidateKey,
  );
}

function getTransactionIdentityKey(transaction: TransactionIdentity) {
  return [
    transaction.date,
    transaction.amount.toFixed(2),
    normalizeText(transaction.merchant),
  ].join("|");
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
