import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import {
  formatCurrency,
  formatDateZh,
  formatFullDateZh,
  transactionKindLabel,
} from "../domain/formatters";
import type { Transaction, TransactionKind } from "../domain/types";
import {
  filterTransactionsByMonth,
  formatMonthLabel,
  useFinance,
} from "../store/FinanceStore";

const filters: Array<{ label: string; value: "all" | TransactionKind | "other" }> = [
  { label: "全部", value: "all" },
  { label: "收入", value: "income" },
  { label: "支出", value: "expense" },
  { label: "其他", value: "other" },
];

const defaultCategories = [
  "收入",
  "餐饮",
  "交通",
  "购物",
  "娱乐",
  "住房",
  "软件工具",
  "健康",
  "其他",
];

type EditableState = {
  merchant: string;
  category: string;
  kind: TransactionKind;
  notes: string;
  excludedFromAnalytics: boolean;
};

function uniqueValues(transactions: Transaction[], key: keyof Transaction) {
  return Array.from(new Set(transactions.map((item) => String(item[key]))));
}

function getEditableState(transaction: Transaction): EditableState {
  return {
    merchant: transaction.merchant,
    category: transaction.category,
    kind: transaction.kind,
    notes: transaction.notes ?? "",
    excludedFromAnalytics: Boolean(transaction.excludedFromAnalytics),
  };
}

export function TransactionsPage() {
  const {
    deleteTransactions,
    selectedMonth,
    transactions,
    updateTransaction,
    updateTransactions,
  } = useFinance();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const querySearchTerm = searchParams.get("q") ?? "";
  const monthTransactions = useMemo(
    () => filterTransactionsByMonth(transactions, selectedMonth),
    [transactions, selectedMonth],
  );
  const [activeFilter, setActiveFilter] =
    useState<(typeof filters)[number]["value"]>("all");
  const [accountFilter, setAccountFilter] = useState("全部账户");
  const [categoryFilter, setCategoryFilter] = useState("全部分类");
  const [sourceFilter, setSourceFilter] = useState("全部来源");
  const [dateFilter, setDateFilter] = useState("全部日期");
  const [searchTerm, setSearchTerm] = useState(querySearchTerm);
  const [selectedId, setSelectedId] = useState(monthTransactions[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState("其他");
  const [draft, setDraft] = useState<EditableState | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

  const filteredTransactions = useMemo(
    () =>
      monthTransactions.filter((item) => {
        const matchesType =
          activeFilter === "all" ||
          item.kind === activeFilter ||
          (activeFilter === "other" && item.category === "其他");
        const matchesAccount =
          accountFilter === "全部账户" || item.account === accountFilter;
        const matchesCategory =
          categoryFilter === "全部分类" || item.category === categoryFilter;
        const matchesSource =
          sourceFilter === "全部来源" || item.source === sourceFilter;
        const matchesDate = dateFilter === "全部日期" || item.date === dateFilter;
        const haystack =
          `${item.merchant} ${item.category} ${item.account} ${item.source} ${item.notes ?? ""}`.toLowerCase();
        const matchesSearch = haystack.includes(searchTerm.trim().toLowerCase());

        return (
          matchesType &&
          matchesAccount &&
          matchesCategory &&
          matchesSource &&
          matchesDate &&
          matchesSearch
        );
      }),
    [
      activeFilter,
      accountFilter,
      categoryFilter,
      dateFilter,
      monthTransactions,
      searchTerm,
      sourceFilter,
    ],
  );

  const selectedTransaction =
    filteredTransactions.find((item) => item.id === selectedId) ?? null;

  const allCategories = Array.from(
    new Set([...defaultCategories, ...transactions.map((item) => item.category)]),
  );
  const expenseTotal = filteredTransactions
    .filter((item) => item.amount < 0 && !item.excludedFromAnalytics)
    .reduce((total, item) => total + Math.abs(item.amount), 0);
  const incomeTotal = filteredTransactions
    .filter((item) => item.amount > 0 && !item.excludedFromAnalytics)
    .reduce((total, item) => total + item.amount, 0);
  const selectedCount = selectedIds.length;
  const allFilteredSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every((item) => selectedIds.includes(item.id));

  useEffect(() => {
    setSearchTerm(querySearchTerm);
  }, [querySearchTerm]);

  useEffect(() => {
    const nextSelectedId = filteredTransactions[0]?.id ?? "";

    setSelectedId((current) =>
      filteredTransactions.some((item) => item.id === current)
        ? current
        : nextSelectedId,
    );
  }, [filteredTransactions]);

  useEffect(() => {
    const existingIds = new Set(transactions.map((item) => item.id));

    setSelectedIds((current) => current.filter((id) => existingIds.has(id)));
  }, [transactions]);

  useEffect(() => {
    if (selectedTransaction) {
      setDraft(getEditableState(selectedTransaction));
    } else {
      setDraft(null);
    }
  }, [selectedTransaction?.id]);

  function handleSearchTermChange(value: string) {
    const params = new URLSearchParams(searchParams);

    setSearchTerm(value);
    if (value.trim()) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    setSearchParams(params, { replace: true });
  }

  function handleSave() {
    if (!selectedTransaction || !draft) {
      return;
    }

    updateTransaction(selectedTransaction.id, draft);
    setSavedMessage("已保存交易修改。");
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds((current) =>
        current.filter(
          (id) => !filteredTransactions.some((transaction) => transaction.id === id),
        ),
      );
      return;
    }

    setSelectedIds((current) =>
      Array.from(new Set([...current, ...filteredTransactions.map((item) => item.id)])),
    );
  }

  function handleBulkCategory() {
    if (selectedCount === 0) {
      return;
    }

    updateTransactions(selectedIds, { category: bulkCategory });
    setSavedMessage(`已批量改为「${bulkCategory}」。`);
  }

  function handleBulkExcluded(excludedFromAnalytics: boolean) {
    if (selectedCount === 0) {
      return;
    }

    updateTransactions(selectedIds, { excludedFromAnalytics });
    setSavedMessage(excludedFromAnalytics ? "已批量排除分析。" : "已批量计入分析。");
  }

  function handleBulkDelete() {
    if (selectedCount === 0) {
      return;
    }

    deleteTransactions(selectedIds);
    setSelectedIds([]);
    setSavedMessage("已删除选中的交易。");
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="交易"
        description={`${formatMonthLabel(selectedMonth)}的交易明细，可搜索、筛选、归类和保存编辑结果。`}
        actions={
          <>
            <button
              className="button button-secondary"
              type="button"
              onClick={toggleAllFiltered}
            >
              {allFilteredSelected ? "取消全选" : "批量选择"}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => navigate("/imports")}
            >
              导入账单
            </button>
          </>
        }
      />

      <section className="table-panel transaction-workbench">
        <div className="panel-header">
          <div>
            <p className="eyebrow">交易流水</p>
            <h3>导入与手动记录</h3>
          </div>
          <span className="pill">{filteredTransactions.length} 条</span>
        </div>

        <div className="summary-strip compact-summary-strip">
          <div>
            <span>当前行数</span>
            <strong>{filteredTransactions.length}</strong>
          </div>
          <div>
            <span>收入</span>
            <strong className="amount-positive">{formatCurrency(incomeTotal)}</strong>
          </div>
          <div>
            <span>支出</span>
            <strong className="amount-negative">{formatCurrency(-expenseTotal)}</strong>
          </div>
        </div>

        <div className="transaction-toolbar-top">
          <label className="inline-search-field">
            <Search size={18} />
            <span className="sr-only">搜索交易</span>
            <input
              value={searchTerm}
              placeholder="搜索商户、分类、账户、来源"
              onChange={(event) => handleSearchTermChange(event.target.value)}
            />
          </label>

          <div className="filter-row">
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={`filter-chip${activeFilter === filter.value ? " is-active" : ""}`}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-grid compact-filter-grid">
          <label className="select-field">
            <span>日期</span>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            >
              <option>全部日期</option>
              {uniqueValues(monthTransactions, "date")
                .sort((left, right) => right.localeCompare(left))
                .map((date) => (
                  <option key={date} value={date}>
                    {formatFullDateZh(date)}
                  </option>
                ))}
            </select>
          </label>
          <label className="select-field">
            <span>账户</span>
            <select
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
            >
              <option>全部账户</option>
              {uniqueValues(monthTransactions, "account").map((account) => (
                <option key={account}>{account}</option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>分类</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option>全部分类</option>
              {uniqueValues(monthTransactions, "category").map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>来源</span>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option>全部来源</option>
              {uniqueValues(monthTransactions, "source").map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="transaction-card-layout">
          <div className="transaction-list-area">
          <div className="bulk-action-bar">
            <div>
              <strong>{selectedCount} 笔已选</strong>
              <span>可批量改分类、排除分析或删除。</span>
            </div>
            <label className="select-field compact-select-field">
              <span>批量分类</span>
              <select
                value={bulkCategory}
                onChange={(event) => setBulkCategory(event.target.value)}
              >
                {allCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <button
              className="button button-secondary"
              type="button"
              disabled={selectedCount === 0}
              onClick={handleBulkCategory}
            >
              应用分类
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={selectedCount === 0}
              onClick={() => handleBulkExcluded(true)}
            >
              排除分析
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={selectedCount === 0}
              onClick={() => handleBulkExcluded(false)}
            >
              计入分析
            </button>
            <button
              className="button button-danger"
              type="button"
              disabled={selectedCount === 0}
              onClick={handleBulkDelete}
            >
              删除
            </button>
          </div>
          <div className="data-table">
            <div className="table-row table-head transactions-table">
              <label className="checkbox-cell">
                <input
                  checked={allFilteredSelected}
                  type="checkbox"
                  onChange={toggleAllFiltered}
                />
                <span className="sr-only">全选当前筛选结果</span>
              </label>
              <span>日期</span>
              <span>商户</span>
              <span>分类</span>
              <span>账户</span>
              <span>类型</span>
              <span>来源</span>
              <span>金额</span>
            </div>

            {filteredTransactions.map((item) => (
              <div
                key={item.id}
                className={`table-row transactions-table table-row-button${
                  item.id === selectedTransaction?.id ? " is-selected" : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedId(item.id);
                  setSavedMessage("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setSelectedId(item.id);
                    setSavedMessage("");
                  }
                }}
              >
                <label className="checkbox-cell" onClick={(event) => event.stopPropagation()}>
                  <input
                    checked={selectedIds.includes(item.id)}
                    type="checkbox"
                    onChange={() => toggleSelection(item.id)}
                  />
                  <span className="sr-only">选择这笔交易</span>
                </label>
                <span>{formatDateZh(item.date)}</span>
                <span>{item.merchant}</span>
                <span>{item.category}</span>
                <span>{item.account}</span>
                <span>{transactionKindLabel(item.kind)}</span>
                <span>{item.source}</span>
                <span
                  className={item.amount > 0 ? "amount-positive" : "amount-negative"}
                >
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}

            {filteredTransactions.length === 0 ? (
              <div className="empty-table-state">
                当前筛选条件下没有交易。
              </div>
            ) : null}
          </div>
          </div>

        {selectedTransaction && draft ? (
          <aside className="detail-panel transaction-inline-detail">
            <div className="panel-header">
              <div>
                <p className="eyebrow">交易详情</p>
                <h3>{selectedTransaction.merchant}</h3>
              </div>
              <span className="pill">{transactionKindLabel(selectedTransaction.kind)}</span>
            </div>

            <div className="detail-stack">
              <div className="detail-card">
                <span>金额</span>
                <strong
                  className={
                    selectedTransaction.amount > 0
                      ? "amount-positive"
                      : "amount-negative"
                  }
                >
                  {formatCurrency(selectedTransaction.amount)}
                </strong>
              </div>
              <div className="detail-grid">
                <div>
                  <span>日期</span>
                  <strong>{formatFullDateZh(selectedTransaction.date)}</strong>
                </div>
                <div>
                  <span>付款账户</span>
                  <strong>{selectedTransaction.account}</strong>
                </div>
                <div>
                  <span>导入来源</span>
                  <strong>{selectedTransaction.source}</strong>
                </div>
                <div>
                  <span>分析状态</span>
                  <strong>{draft.excludedFromAnalytics ? "已排除" : "计入分析"}</strong>
                </div>
              </div>

              <label className="select-field">
                <span>商户名称</span>
                <input
                  value={draft.merchant}
                  onChange={(event) =>
                    setDraft({ ...draft, merchant: event.target.value })
                  }
                />
              </label>

              <label className="select-field">
                <span>分类</span>
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                >
                  {allCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>

              <label className="select-field">
                <span>类型</span>
                <select
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      kind: event.target.value as TransactionKind,
                    })
                  }
                >
                  <option value="income">收入</option>
                  <option value="expense">支出</option>
                </select>
              </label>

              <div className="toggle-list">
                <label className="toggle-row">
                  <span>不计入分析</span>
                  <input
                    checked={draft.excludedFromAnalytics}
                    type="checkbox"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        excludedFromAnalytics: event.target.checked,
                      })
                    }
                  />
                </label>
              </div>

              <label className="select-field">
                <span>备注</span>
                <textarea
                  className="notes-textarea"
                  value={draft.notes}
                  placeholder="给这笔交易补充备注"
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                />
              </label>

              {savedMessage ? <p className="form-success">{savedMessage}</p> : null}

              <div className="panel-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setDraft(getEditableState(selectedTransaction))}
                >
                  还原
                </button>
                <button className="button button-primary" type="button" onClick={handleSave}>
                  保存修改
                </button>
              </div>
            </div>
          </aside>
        ) : null}
        </div>
      </section>
    </div>
  );
}
