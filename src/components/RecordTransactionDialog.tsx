import { type FormEvent, useState } from "react";
import type { TransactionKind } from "../domain/types";
import { useFinance } from "../store/FinanceStore";

type RecordTransactionDialogProps = {
  buttonLabel?: string;
  buttonClassName?: string;
};

const fallbackCategories = [
  "餐饮",
  "交通",
  "购物",
  "娱乐",
  "住房",
  "健康",
  "人情往来",
  "软件工具",
  "收入",
  "其他",
];

export function RecordTransactionDialog({
  buttonLabel = "记一笔",
  buttonClassName = "button button-primary",
}: RecordTransactionDialogProps) {
  const {
    addTransaction,
    categoryRules,
    selectedMonth,
    transactions,
  } = useFinance();
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [date, setDate] = useState(getDefaultDate(selectedMonth));
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("餐饮");
  const [account, setAccount] = useState("现金");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [excludedFromAnalytics, setExcludedFromAnalytics] = useState(false);
  const [error, setError] = useState("");
  const categories = Array.from(
    new Set([
      ...fallbackCategories,
      ...categoryRules.map((rule) => rule.category),
      ...transactions.map((transaction) => transaction.category),
    ]),
  );
  const accounts = Array.from(
    new Set(["现金", "微信支付", "支付宝", ...transactions.map((item) => item.account)]),
  );

  function openDialog() {
    setDate(getDefaultDate(selectedMonth));
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    setError("");
  }

  function resetForm() {
    setKind("expense");
    setMerchant("");
    setCategory("餐饮");
    setAccount("现金");
    setAmount("");
    setNotes("");
    setExcludedFromAnalytics(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAmount = Number(amount);

    if (!date || !merchant.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("请填写日期、商户和大于 0 的金额。");
      return;
    }

    addTransaction({
      date,
      merchant: merchant.trim(),
      category,
      account,
      amount: parsedAmount,
      kind,
      notes: notes.trim() || undefined,
      excludedFromAnalytics,
    });
    resetForm();
    closeDialog();
  }

  return (
    <>
      <button className={buttonClassName} type="button" onClick={openDialog}>
        {buttonLabel}
      </button>

      {isOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            aria-modal="true"
            className="record-dialog"
            role="dialog"
            aria-labelledby="record-dialog-title"
          >
            <div className="panel-header">
              <div>
                <p className="eyebrow">手动记录</p>
                <h3 id="record-dialog-title">记一笔交易</h3>
              </div>
              <button className="text-button" type="button" onClick={closeDialog}>
                关闭
              </button>
            </div>

            <form className="record-form" onSubmit={handleSubmit}>
              <div className="filter-row">
                <button
                  className={`filter-chip${kind === "expense" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => {
                    setKind("expense");
                    if (category === "收入") {
                      setCategory("餐饮");
                    }
                  }}
                >
                  支出
                </button>
                <button
                  className={`filter-chip${kind === "income" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => {
                    setKind("income");
                    setCategory("收入");
                  }}
                >
                  收入
                </button>
              </div>

              <div className="form-grid-two">
                <label className="select-field">
                  <span>日期</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label className="select-field">
                  <span>金额</span>
                  <input
                    inputMode="decimal"
                    min="0"
                    placeholder="例如 36.8"
                    type="number"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
              </div>

              <label className="select-field">
                <span>商户 / 来源</span>
                <input
                  placeholder="例如 美团外卖、工资入账"
                  value={merchant}
                  onChange={(event) => setMerchant(event.target.value)}
                />
              </label>

              <div className="form-grid-two">
                <label className="select-field">
                  <span>分类</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    {categories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="select-field">
                  <span>账户</span>
                  <select
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                  >
                    {accounts.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="select-field">
                <span>备注</span>
                <textarea
                  className="notes-textarea"
                  placeholder="可选，比如和朋友聚餐"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>

              <label className="toggle-row">
                <span>不计入分析</span>
                <input
                  checked={excludedFromAnalytics}
                  type="checkbox"
                  onChange={(event) =>
                    setExcludedFromAnalytics(event.target.checked)
                  }
                />
              </label>

              {error ? <p className="form-error">{error}</p> : null}

              <div className="panel-actions">
                <button className="button button-secondary" type="button" onClick={resetForm}>
                  清空
                </button>
                <button className="button button-primary" type="submit">
                  保存交易
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function getDefaultDate(selectedMonth: string) {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayText = `${year}-${month}-${day}`;

  if (todayText.startsWith(selectedMonth)) {
    return todayText;
  }

  return `${selectedMonth}-01`;
}
