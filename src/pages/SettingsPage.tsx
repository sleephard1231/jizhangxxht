import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import type { CategoryRule, TransactionKind } from "../domain/types";
import { useFinance } from "../store/FinanceStore";

type RuleDraft = Omit<CategoryRule, "id">;
type MessageState = {
  text: string;
  type: "error" | "success";
};
type RestorePreview = {
  state: unknown;
  fileName: string;
  selectedMonth: string;
  transactions: number;
  importHistory: number;
  categoryRules: number;
};

export function SettingsPage() {
  const {
    addCategoryRule,
    applyCategoryRules,
    categoryRules,
    deleteCategoryRule,
    importHistory,
    restoreBackup,
    selectedMonth,
    transactions,
    updateCategoryRule,
  } = useFinance();
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [keywords, setKeywords] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [editingRuleId, setEditingRuleId] = useState("");
  const [editingDraft, setEditingDraft] = useState<RuleDraft | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!keywords.trim() || !category.trim()) {
      setMessage({ text: "请填写关键词和分类。", type: "error" });
      return;
    }

    addCategoryRule({
      keywords: keywords.trim(),
      category: category.trim(),
      kind,
    });
    setKeywords("");
    setCategory("");
    setKind("expense");
    setMessage({
      text: "规则已保存，下次导入会自动使用。",
      type: "success",
    });
  }

  function startEditing(rule: CategoryRule) {
    setEditingRuleId(rule.id);
    setEditingDraft({
      keywords: rule.keywords,
      category: rule.category,
      kind: rule.kind ?? "expense",
    });
    setMessage(null);
  }

  function cancelEditing() {
    setEditingRuleId("");
    setEditingDraft(null);
  }

  function saveEditing(ruleId: string) {
    if (!editingDraft?.keywords.trim() || !editingDraft.category.trim()) {
      setMessage({ text: "请填写关键词和分类。", type: "error" });
      return;
    }

    updateCategoryRule(ruleId, {
      keywords: editingDraft.keywords.trim(),
      category: editingDraft.category.trim(),
      kind: editingDraft.kind,
    });
    cancelEditing();
    setMessage({ text: "规则已更新。", type: "success" });
  }

  function handleApplyRules() {
    applyCategoryRules();
    setMessage({ text: "已把当前规则应用到现有交易。", type: "success" });
  }

  function handleExportBackup() {
    const backup = {
      app: "personal-finance-web",
      exportedAt: new Date().toISOString(),
      version: 1,
      state: {
        selectedMonth,
        transactions,
        importHistory,
        categoryRules,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `personal-finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ text: "已导出完整 JSON 备份。", type: "success" });
  }

  function handleExportTransactionsCsv() {
    const headers = [
      "日期",
      "商户",
      "分类",
      "账户",
      "金额",
      "类型",
      "来源",
      "备注",
      "是否排除分析",
      "导入日期",
    ];
    const rows = transactions.map((transaction) => [
      transaction.date,
      transaction.merchant,
      transaction.category,
      transaction.account,
      transaction.amount.toFixed(2),
      transaction.kind === "income" ? "收入" : "支出",
      transaction.source,
      transaction.notes ?? "",
      transaction.excludedFromAnalytics ? "是" : "否",
      transaction.importedAt ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `personal-finance-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ text: "已导出交易 CSV，可以直接用 Excel 打开。", type: "success" });
  }

  async function handleRestoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      const state = parsed.state ?? parsed;
      const preview = buildRestorePreview(state, file.name);

      setRestorePreview(preview);
      setMessage({
        text: "已读取备份，请确认预览信息后再恢复，避免覆盖当前账本。",
        type: "success",
      });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "无法恢复这个备份文件。",
        type: "error",
      });
    }
  }

  function handleConfirmRestore() {
    if (!restorePreview) {
      return;
    }

    try {
      restoreBackup(restorePreview.state);
      setRestorePreview(null);
      setMessage({ text: "已从备份恢复账本数据。", type: "success" });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "无法恢复这个备份文件。",
        type: "error",
      });
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="设置"
        description="维护你的分类规则，让导入后的账单自动整理成更接近真实习惯的分类。"
        actions={
          <button className="button button-primary" type="button" onClick={handleApplyRules}>
            应用到现有交易
          </button>
        }
      />

      <section className="panel backup-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">备份 / 恢复</p>
            <h3>保护你的本地账本</h3>
          </div>
          <span className="pill">JSON</span>
        </div>

        <p className="backup-description">
          JSON 会保存完整 App 状态，包括交易、导入历史、分类规则和当前月份。CSV 更适合只导出交易表格，不适合作为完整恢复备份。
        </p>
        <input
          ref={restoreInputRef}
          className="sr-only"
          type="file"
          accept=".json,application/json"
          onChange={handleRestoreBackup}
        />
        <div className="summary-strip backup-summary-strip">
          <div>
            <span>交易</span>
            <strong>{transactions.length}</strong>
          </div>
          <div>
            <span>导入记录</span>
            <strong>{importHistory.length}</strong>
          </div>
          <div>
            <span>分类规则</span>
            <strong>{categoryRules.length}</strong>
          </div>
        </div>
        <div className="panel-actions">
          <button className="button button-primary" type="button" onClick={handleExportBackup}>
            导出 JSON 备份
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={handleExportTransactionsCsv}
            disabled={transactions.length === 0}
          >
            导出交易 CSV
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => restoreInputRef.current?.click()}
          >
            从 JSON 恢复
          </button>
        </div>
        {restorePreview ? (
          <div className="restore-preview-card">
            <div>
              <p className="eyebrow">恢复前预览</p>
              <h4>{restorePreview.fileName}</h4>
              <span>
                这会用备份数据覆盖当前本地账本。当前有 {transactions.length} 笔交易，
                备份中有 {restorePreview.transactions} 笔交易。
              </span>
            </div>
            <div className="summary-strip backup-summary-strip">
              <div>
                <span>备份月份</span>
                <strong>{restorePreview.selectedMonth}</strong>
              </div>
              <div>
                <span>导入记录</span>
                <strong>{restorePreview.importHistory}</strong>
              </div>
              <div>
                <span>分类规则</span>
                <strong>{restorePreview.categoryRules}</strong>
              </div>
            </div>
            <div className="panel-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={handleConfirmRestore}
              >
                确认恢复并覆盖
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setRestorePreview(null)}
              >
                取消恢复
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="split-layout">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">新增规则</p>
              <h3>关键词自动归类</h3>
            </div>
          </div>

          <form className="record-form" onSubmit={handleSubmit}>
            <label className="select-field">
              <span>关键词</span>
              <textarea
                className="notes-textarea"
                placeholder="例如：美团, 饿了么, 饭, 咖啡"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
              />
            </label>

            <div className="form-grid-two">
              <label className="select-field">
                <span>归入分类</span>
                <input
                  placeholder="例如 餐饮"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </label>
              <label className="select-field">
                <span>类型</span>
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as TransactionKind)}
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
              </label>
            </div>

            {message ? (
              <p className={message.type === "error" ? "form-error" : "form-success"}>
                {message.text}
              </p>
            ) : null}

            <div className="panel-actions">
              <button className="button button-primary" type="submit">
                保存规则
              </button>
            </div>
          </form>
        </article>

        <article className="table-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">当前规则</p>
              <h3>自动分类清单</h3>
            </div>
            <span className="pill">{categoryRules.length} 条</span>
          </div>

          <div className="rule-list">
            {categoryRules.map((rule) => (
              <div key={rule.id} className="rule-card">
                {editingRuleId === rule.id && editingDraft ? (
                  <div className="rule-edit-form">
                    <label className="select-field">
                      <span>关键词</span>
                      <textarea
                        className="notes-textarea"
                        value={editingDraft.keywords}
                        onChange={(event) =>
                          setEditingDraft({
                            ...editingDraft,
                            keywords: event.target.value,
                          })
                        }
                      />
                    </label>

                    <div className="form-grid-two">
                      <label className="select-field">
                        <span>归入分类</span>
                        <input
                          value={editingDraft.category}
                          onChange={(event) =>
                            setEditingDraft({
                              ...editingDraft,
                              category: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="select-field">
                        <span>类型</span>
                        <select
                          value={editingDraft.kind}
                          onChange={(event) =>
                            setEditingDraft({
                              ...editingDraft,
                              kind: event.target.value as TransactionKind,
                            })
                          }
                        >
                          <option value="expense">支出</option>
                          <option value="income">收入</option>
                        </select>
                      </label>
                    </div>

                    <div className="panel-actions">
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => saveEditing(rule.id)}
                      >
                        保存修改
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={cancelEditing}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>{rule.category}</strong>
                      <span>{rule.kind === "income" ? "收入" : "支出"}</span>
                    </div>
                    <p>{rule.keywords}</p>
                    <div className="rule-card-actions">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => startEditing(rule)}
                      >
                        编辑
                      </button>
                      <button
                        className="text-button danger-text-button"
                        type="button"
                        onClick={() => deleteCategoryRule(rule.id)}
                      >
                        删除
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildRestorePreview(state: unknown, fileName: string): RestorePreview {
  if (!state || typeof state !== "object") {
    throw new Error("备份文件格式不正确。");
  }

  const candidate = state as {
    selectedMonth?: unknown;
    transactions?: unknown;
    importHistory?: unknown;
    categoryRules?: unknown;
  };

  if (
    typeof candidate.selectedMonth !== "string" ||
    !Array.isArray(candidate.transactions) ||
    !Array.isArray(candidate.importHistory) ||
    !Array.isArray(candidate.categoryRules)
  ) {
    throw new Error("备份文件缺少账本必要数据。");
  }

  return {
    state,
    fileName,
    selectedMonth: candidate.selectedMonth,
    transactions: candidate.transactions.length,
    importHistory: candidate.importHistory.length,
    categoryRules: candidate.categoryRules.length,
  };
}
