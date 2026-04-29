import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useReducer,
  useState,
} from "react";
import {
  initialCategoryRules,
  initialImportHistory,
  initialTransactions,
} from "../data";
import { formatCurrencyPlain } from "../domain/formatters";
import {
  loadCloudFinanceState,
  saveCloudFinanceState,
  type FinanceSnapshot,
} from "../lib/financeCloud";
import { supabase } from "../lib/supabase";
import type {
  CategoryRule,
  CategorySummary,
  ImportBatch,
  MonthlySummary,
  NewTransactionInput,
  Transaction,
  TransactionUpdate,
} from "../domain/types";
import { applyCategoryRulesToTransaction } from "../utils/categoryRules";
import { hasSameTransactionIdentity } from "../utils/transactionIdentity";

type FinanceState = FinanceSnapshot;

type CloudSyncStatus =
  | "local"
  | "signedOut"
  | "loading"
  | "syncing"
  | "synced"
  | "error";

type FinanceAction =
  | { type: "addTransaction"; transaction: Transaction }
  | { type: "commitImport"; transactions: Transaction[]; batch: ImportBatch }
  | { type: "replaceState"; state: FinanceState }
  | { type: "restoreBackup"; state: FinanceState }
  | { type: "updateTransaction"; id: string; update: TransactionUpdate }
  | { type: "updateTransactions"; ids: string[]; update: TransactionUpdate }
  | { type: "deleteTransactions"; ids: string[] }
  | { type: "addCategoryRule"; rule: CategoryRule }
  | { type: "updateCategoryRule"; id: string; update: Omit<CategoryRule, "id"> }
  | { type: "deleteCategoryRule"; id: string }
  | { type: "applyCategoryRules" }
  | { type: "setSelectedMonth"; month: string }
  | { type: "resetDemoData" };

type ImportCommitResult = {
  batch: ImportBatch;
  duplicatesSkipped: number;
};

type FinanceContextValue = FinanceState & {
  addTransaction: (input: NewTransactionInput) => void;
  addImportedTransactions: (
    transactions: Transaction[],
    batch: ImportBatch,
  ) => ImportCommitResult;
  updateTransaction: (id: string, update: TransactionUpdate) => void;
  updateTransactions: (ids: string[], update: TransactionUpdate) => void;
  deleteTransactions: (ids: string[]) => void;
  addCategoryRule: (rule: Omit<CategoryRule, "id">) => void;
  updateCategoryRule: (id: string, update: Omit<CategoryRule, "id">) => void;
  deleteCategoryRule: (id: string) => void;
  applyCategoryRules: () => void;
  restoreBackup: (state: unknown) => void;
  setSelectedMonth: (month: string) => void;
  resetDemoData: () => void;
  cloudSyncStatus: CloudSyncStatus;
  cloudSyncError: string;
};

const STORAGE_KEY = "personal-finance-web-state-v3";

const initialState: FinanceState = {
  selectedMonth: getCurrentMonth(),
  transactions: initialTransactions,
  importHistory: initialImportHistory,
  categoryRules: initialCategoryRules,
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({
  children,
  storageKey = STORAGE_KEY,
  cloudUserId,
}: {
  children: ReactNode;
  storageKey?: string;
  cloudUserId?: string;
}) {
  const [state, dispatch] = useReducer(
    financeReducer,
    storageKey,
    loadInitialState,
  );
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(
    cloudUserId ? "loading" : supabase ? "signedOut" : "local",
  );
  const [cloudSyncError, setCloudSyncError] = useState("");
  const hasLoadedCloudRef = useRef(false);
  const lastSyncedStateRef = useRef("");

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

  useEffect(() => {
    hasLoadedCloudRef.current = false;
    lastSyncedStateRef.current = "";
    setCloudSyncError("");

    if (!cloudUserId || !supabase) {
      setCloudSyncStatus(supabase ? "signedOut" : "local");
      return;
    }

    let isCancelled = false;

    setCloudSyncStatus("loading");

    loadCloudFinanceState(supabase, cloudUserId)
      .then((cloudState) => {
        if (isCancelled) {
          return;
        }

        const localState = loadInitialState(storageKey);
        const shouldMigrateLocalData =
          cloudState.transactions.length === 0 &&
          cloudState.importHistory.length === 0 &&
          cloudState.categoryRules.length === 0 &&
          hasMeaningfulLocalData(localState);
        const nextState = shouldMigrateLocalData
          ? localState
          : normalizeLoadedState({
              ...localState,
              transactions: cloudState.transactions,
              importHistory: cloudState.importHistory,
              categoryRules: cloudState.categoryRules.length
                ? cloudState.categoryRules
                : initialCategoryRules,
            });

        lastSyncedStateRef.current = shouldMigrateLocalData
          ? ""
          : JSON.stringify(nextState);
        hasLoadedCloudRef.current = true;
        dispatch({ type: "replaceState", state: nextState });
        setCloudSyncStatus(shouldMigrateLocalData ? "syncing" : "synced");
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        hasLoadedCloudRef.current = true;
        setCloudSyncStatus("error");
        setCloudSyncError(
          error instanceof Error ? error.message : "云端账本读取失败。",
        );
      });

    return () => {
      isCancelled = true;
    };
  }, [cloudUserId, storageKey]);

  useEffect(() => {
    if (!cloudUserId || !supabase || !hasLoadedCloudRef.current) {
      return;
    }

    const client = supabase;
    const serializedState = JSON.stringify(state);

    if (serializedState === lastSyncedStateRef.current) {
      setCloudSyncStatus((status) => (status === "synced" ? status : "synced"));

      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCloudSyncStatus("syncing");
      setCloudSyncError("");

      saveCloudFinanceState(client, cloudUserId, state)
        .then(() => {
          lastSyncedStateRef.current = serializedState;
          setCloudSyncStatus("synced");
        })
        .catch((error) => {
          setCloudSyncStatus("error");
          setCloudSyncError(
            error instanceof Error ? error.message : "云端账本保存失败。",
          );
        });
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [cloudUserId, state]);

  function addImportedTransactions(
    transactions: Transaction[],
    batch: ImportBatch,
  ): ImportCommitResult {
    const ruledTransactions = transactions.map((transaction) =>
      applyCategoryRulesToTransaction(transaction, state.categoryRules),
    );
    const unique = ruledTransactions.filter(
      (transaction) => !hasDuplicateTransaction(transaction, state.transactions),
    );
    const duplicatesSkipped = ruledTransactions.length - unique.length;
    const committedBatch = {
      ...batch,
      added: unique.length,
      skipped: batch.skipped + duplicatesSkipped,
    };

    dispatch({
      type: "commitImport",
      transactions: unique,
      batch: committedBatch,
    });

    return { batch: committedBatch, duplicatesSkipped };
  }

  return (
    <FinanceContext.Provider
      value={{
        ...state,
        addTransaction: (input) =>
          dispatch({
            type: "addTransaction",
            transaction: buildManualTransaction(input, state.categoryRules),
          }),
        addImportedTransactions,
        updateTransaction: (id, update) =>
          dispatch({ type: "updateTransaction", id, update }),
        updateTransactions: (ids, update) =>
          dispatch({ type: "updateTransactions", ids, update }),
        deleteTransactions: (ids) =>
          dispatch({ type: "deleteTransactions", ids }),
        addCategoryRule: (rule) =>
          dispatch({
            type: "addCategoryRule",
            rule: {
              ...rule,
              id: `rule-${crypto.randomUUID?.() ?? Date.now()}`,
            },
          }),
        updateCategoryRule: (id, update) =>
          dispatch({ type: "updateCategoryRule", id, update }),
        deleteCategoryRule: (id) =>
          dispatch({ type: "deleteCategoryRule", id }),
        applyCategoryRules: () => dispatch({ type: "applyCategoryRules" }),
        restoreBackup: (restoredState) =>
          dispatch({
            type: "restoreBackup",
            state: normalizeLoadedState(validateBackupState(restoredState)),
          }),
        setSelectedMonth: (month) =>
          dispatch({ type: "setSelectedMonth", month }),
        resetDemoData: () => dispatch({ type: "resetDemoData" }),
        cloudSyncStatus,
        cloudSyncError,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);

  if (!context) {
    throw new Error("useFinance must be used inside FinanceProvider.");
  }

  return context;
}

export function filterTransactionsByMonth(
  transactions: Transaction[],
  month: string,
) {
  return transactions.filter((transaction) => transaction.date.startsWith(month));
}

export function getAvailableMonths(transactions: Transaction[], fallbackMonth = getCurrentMonth()) {
  const months = Array.from(
    new Set([
      fallbackMonth,
      ...transactions.map((transaction) => transaction.date.slice(0, 7)),
    ]),
  );

  return months.sort((left, right) => right.localeCompare(left));
}

export function buildMonthlySummary(
  transactions: Transaction[],
  month: string,
): MonthlySummary {
  const included = transactions.filter(
    (transaction) => !transaction.excludedFromAnalytics,
  );
  const income = included
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);
  const spent = included
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);

  return {
    month: formatMonthLabel(month),
    net: formatCurrencyPlain(income - spent),
    income: formatCurrencyPlain(income),
    spent: formatCurrencyPlain(spent),
    transactionCount: included.length,
  };
}

export function buildMonthlyTrend(transactions: Transaction[], selectedMonth: string) {
  const months = getRecentMonths(selectedMonth, 6);

  return months.map((month) => {
    const included = filterTransactionsByMonth(transactions, month).filter(
      (transaction) => !transaction.excludedFromAnalytics,
    );
    const income = included
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);
    const expense = included
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);

    return {
      month: formatShortMonthLabel(month),
      income,
      expense,
    };
  });
}

export function buildCategoryBreakdown(transactions: Transaction[]): CategorySummary[] {
  const expenseTransactions = transactions.filter(
    (transaction) => transaction.amount < 0 && !transaction.excludedFromAnalytics,
  );
  const total = expenseTransactions.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );
  const grouped = expenseTransactions.reduce<
    Record<string, { count: number; value: number }>
  >((result, transaction) => {
    const current = result[transaction.category] ?? { count: 0, value: 0 };

    result[transaction.category] = {
      count: current.count + 1,
      value: current.value + Math.abs(transaction.amount),
    };

    return result;
  }, {});

  return Object.entries(grouped)
    .map(([name, summary]) => ({
      name,
      value: summary.value,
      amount: formatCurrencyPlain(summary.value),
      share: total > 0 ? Math.round((summary.value / total) * 100) : 0,
      count: summary.count,
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);
}

export function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");

  return `${year} 年 ${Number(monthNumber)} 月`;
}

function financeReducer(state: FinanceState, action: FinanceAction): FinanceState {
  switch (action.type) {
    case "addTransaction":
      return {
        ...state,
        transactions: [action.transaction, ...state.transactions],
      };
    case "commitImport":
      return {
        ...state,
        transactions: [...action.transactions, ...state.transactions],
        importHistory: [action.batch, ...state.importHistory],
      };
    case "replaceState":
      return action.state;
    case "restoreBackup":
      return action.state;
    case "updateTransaction":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.id === action.id
            ? { ...transaction, ...action.update }
            : transaction,
        ),
      };
    case "updateTransactions":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          action.ids.includes(transaction.id)
            ? { ...transaction, ...action.update }
            : transaction,
        ),
      };
    case "deleteTransactions":
      return {
        ...state,
        transactions: state.transactions.filter(
          (transaction) => !action.ids.includes(transaction.id),
        ),
      };
    case "addCategoryRule":
      return {
        ...state,
        categoryRules: [action.rule, ...state.categoryRules],
      };
    case "updateCategoryRule":
      return {
        ...state,
        categoryRules: state.categoryRules.map((rule) =>
          rule.id === action.id ? { ...rule, ...action.update } : rule,
        ),
      };
    case "deleteCategoryRule":
      return {
        ...state,
        categoryRules: state.categoryRules.filter((rule) => rule.id !== action.id),
      };
    case "applyCategoryRules":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          applyCategoryRulesToTransaction(transaction, state.categoryRules),
        ),
      };
    case "setSelectedMonth":
      return {
        ...state,
        selectedMonth: action.month,
      };
    case "resetDemoData":
      localStorage.removeItem("personal-finance-web-state-v2");
      localStorage.removeItem("personal-finance-web-state-v1");
      return initialState;
    default:
      return state;
  }
}

function hasDuplicateTransaction(
  candidate: Transaction,
  transactions: Transaction[],
) {
  return hasSameTransactionIdentity(candidate, transactions);
}

function buildManualTransaction(
  input: NewTransactionInput,
  categoryRules: CategoryRule[],
): Transaction {
  const absoluteAmount = Math.abs(input.amount);
  const signedAmount = input.kind === "income" ? absoluteAmount : -absoluteAmount;
  const transaction = {
    id: `manual-${crypto.randomUUID?.() ?? Date.now()}`,
    date: input.date,
    merchant: input.merchant,
    category: input.category,
    account: input.account,
    amount: signedAmount,
    kind: input.kind,
    source: "手动记录",
    notes: input.notes,
    excludedFromAnalytics: Boolean(input.excludedFromAnalytics),
    importedAt: new Date().toISOString().slice(0, 10),
  };

  return applyCategoryRulesToTransaction(transaction, categoryRules);
}

function getRecentMonths(selectedMonth: string, count: number) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const cursor = new Date(year, month - 1, 1);
  const months = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(cursor);
    date.setMonth(cursor.getMonth() - index);
    months.push(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  return months;
}

function formatShortMonthLabel(month: string) {
  return `${Number(month.slice(5, 7))}月`;
}

function getCurrentMonth() {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function loadInitialState(storageKey = STORAGE_KEY): FinanceState {
  try {
    const saved = localStorage.getItem(storageKey);

    if (!saved) {
      return initialState;
    }

    return normalizeLoadedState({ ...initialState, ...JSON.parse(saved) } as FinanceState);
  } catch {
    return initialState;
  }
}

function hasMeaningfulLocalData(state: FinanceState) {
  return (
    state.transactions.length > 0 ||
    state.importHistory.length > 0 ||
    state.categoryRules.some(
      (rule) =>
        !initialCategoryRules.some(
          (initialRule) =>
            initialRule.id === rule.id &&
            initialRule.keywords === rule.keywords &&
            initialRule.category === rule.category &&
            initialRule.kind === rule.kind,
        ),
    )
  );
}

function normalizeLoadedState(state: FinanceState): FinanceState {
  return {
    ...state,
    categoryRules: state.categoryRules?.length
      ? state.categoryRules
      : initialCategoryRules,
    transactions: state.transactions.map((transaction) => ({
      ...transaction,
      kind: transaction.amount > 0 ? "income" : "expense",
    })),
  };
}

function validateBackupState(value: unknown): FinanceState {
  if (!value || typeof value !== "object") {
    throw new Error("备份文件格式不正确。");
  }

  const backup = value as Partial<FinanceState>;

  if (
    typeof backup.selectedMonth !== "string" ||
    !Array.isArray(backup.transactions) ||
    !Array.isArray(backup.importHistory) ||
    !Array.isArray(backup.categoryRules)
  ) {
    throw new Error("备份文件缺少账本必要数据。");
  }

  return {
    selectedMonth: backup.selectedMonth,
    transactions: backup.transactions as Transaction[],
    importHistory: backup.importHistory as ImportBatch[],
    categoryRules: backup.categoryRules as CategoryRule[],
  };
}
