import {
  Bot,
  CheckCircle2,
  Settings,
  LockKeyhole,
  MessageSquareText,
  PencilLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import {
  formatCurrency,
  formatCurrencyPlain,
  formatFullDateZh,
} from "../domain/formatters";
import type {
  NewTransactionInput,
  Transaction,
  TransactionKind,
} from "../domain/types";
import {
  filterTransactionsByMonth,
  formatMonthLabel,
  useFinance,
} from "../store/FinanceStore";

type AssistantMode = "readonly" | "draft";
type DraftTransaction = NewTransactionInput & {
  confidence: string;
};
type AiHistoryItem = {
  id: string;
  detail: string;
  title: string;
  type: "查账" | "草稿" | "写入" | "建议" | "总结" | "对话";
};
type AiConfig = {
  apiKey: string;
  baseUrl: string;
  defaultPermission: "readonly" | "suggest" | "execute";
  hasApiKey: boolean;
  model: string;
  provider: "zhipu" | "qwen" | "openai" | "custom";
};
type CategorySuggestion = {
  id: string;
  currentCategory: string;
  merchant: string;
  nextCategory: string;
  reason: string;
  transactionId: string;
};
type MonthlyReport = {
  alerts: string[];
  biggestExpense?: Transaction;
  categoryHighlights: Array<{
    name: string;
    amount: number;
    count: number;
    share: number;
  }>;
  highestDay?: {
    amount: number;
    date: string;
  };
  income: number;
  month: string;
  net: number;
  suggestions: string[];
  totalExpense: number;
  transactionCount: number;
};

const AI_CONFIG_STORAGE_KEY = "personal-finance-ai-config-v1";
const AI_HISTORY_STORAGE_KEY = "personal-finance-ai-history-v1";
const defaultAiConfig: AiConfig = {
  apiKey: "",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
  defaultPermission: "readonly",
  hasApiKey: false,
  model: "glm-5.1",
  provider: "zhipu",
};

const permissionModes = [
  {
    icon: LockKeyhole,
    title: "只读模式",
    body: "只能查看账本并回答花费、占比、最高支出等问题。",
    tone: "active",
  },
  {
    icon: MessageSquareText,
    title: "建议模式",
    body: "可以生成分类、整理和总结建议，执行前需要你确认。",
    tone: "normal",
  },
  {
    icon: PencilLine,
    title: "授权执行",
    body: "你明确下达记账指令后，才允许新增单笔交易。",
    tone: "normal",
  },
  {
    icon: ShieldCheck,
    title: "高风险确认",
    body: "批量修改、删除、清空数据永远需要二次确认。",
    tone: "locked",
  },
];

const assistantFeatures = [
  {
    title: "自然语言记一笔",
    body: "例如：昨天打车 36.8，支付宝付的，分类交通。",
  },
  {
    title: "只读查账",
    body: "例如：4 月餐饮花了多少、本月最大支出是哪一笔、哪天花最多。",
  },
  {
    title: "AI 分类建议",
    body: "扫描当前月份交易，先生成分类建议，确认后才会修改。",
  },
  {
    title: "确认后执行",
    body: "AI 只生成草稿，新增交易必须经过你点击确认。",
  },
];

export function AiPage() {
  const {
    addTransaction,
    categoryRules,
    selectedMonth,
    transactions,
    updateTransaction,
  } = useFinance();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<AssistantMode>("readonly");
  const [answer, setAnswer] = useState("");
  const [draft, setDraft] = useState<DraftTransaction | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>(loadAiConfig);
  const [history, setHistory] = useState<AiHistoryItem[]>(loadAiHistory);
  const [categorySuggestions, setCategorySuggestions] = useState<
    CategorySuggestion[]
  >([]);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [aiMonthlySummary, setAiMonthlySummary] = useState("");
  const [configMessage, setConfigMessage] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [message, setMessage] = useState("");
  const monthTransactions = filterTransactionsByMonth(transactions, selectedMonth);
  const monthTransactionCount = monthTransactions.length;
  const isApiConfigured = Boolean(aiConfig.apiKey.trim());

  useEffect(() => {
    localStorage.setItem(AI_HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  async function handleAssistantSend() {
    const command = prompt.trim();

    if (!command) {
      return;
    }

    if (isHighRiskCommand(command)) {
      setMode("readonly");
      setDraft(null);
      setAnswer("这个操作风险比较高，我不会直接执行。批量删除、批量修改、清空数据、覆盖导入这类操作需要单独做确认流程。");
      setMessage("");
      addHistory("查账", "拦截高风险操作", command);
      return;
    }

    if (isMonthlySummaryCommand(command)) {
      await handleGenerateMonthlyReport();
      setMode("readonly");
      setDraft(null);
      setAnswer("我已经开始生成本月总结，结果会出现在下面的「AI 本月消费分析」里。");
      setPrompt("");
      return;
    }

    const nextDraft = parseTransactionDraft(
      command,
      selectedMonth,
      transactions,
      categoryRules.map((rule) => rule.category),
    );

    if (nextDraft && shouldAutoWriteTransaction(command, nextDraft)) {
      addTransaction({
        date: nextDraft.date,
        merchant: nextDraft.merchant,
        category: nextDraft.category,
        account: nextDraft.account,
        amount: nextDraft.amount,
        kind: nextDraft.kind,
        notes: nextDraft.notes,
        excludedFromAnalytics: nextDraft.excludedFromAnalytics,
      });
      setMode("readonly");
      setDraft(null);
      setPrompt("");
      setAnswer(
        `已帮你记好了：${formatFullDateZh(nextDraft.date)}，${nextDraft.merchant}，${nextDraft.category}，${formatCurrency(nextDraft.kind === "income" ? nextDraft.amount : -nextDraft.amount)}，账户 ${nextDraft.account}。`,
      );
      setMessage("已自动写入账本。");
      addHistory(
        "写入",
        "对话直接记账",
        `${nextDraft.merchant} ${formatCurrency(nextDraft.kind === "income" ? nextDraft.amount : -nextDraft.amount)}`,
      );
      return;
    }

    if (nextDraft) {
      setMode("draft");
      setDraft(nextDraft);
      setAnswer("我识别到这像一笔交易，但信息不够明确，先放到待确认卡片里。你确认后我再写入账本。");
      setMessage("为了避免记错账，这笔需要你确认。");
      addHistory(
        "草稿",
        "低置信度记账待确认",
        `${nextDraft.merchant} ${formatCurrency(nextDraft.kind === "income" ? nextDraft.amount : -nextDraft.amount)}`,
      );
      return;
    }

    if (isLocalFinanceQuestion(command) || !aiConfig.apiKey.trim()) {
      const result = answerReadonlyQuestion(command, transactions, selectedMonth);

      setMode("readonly");
      setDraft(null);
      setAnswer(result);
      setMessage(aiConfig.apiKey.trim() ? "" : "当前没有配置 API Key，所以这次使用本地规则回答。");
      addHistory("查账", "对话查账", command);
      return;
    }

    setIsSendingPrompt(true);
    setMode("readonly");
    setDraft(null);
    setAnswer("正在问智谱 AI...");
    setMessage("");

    try {
      const result = await answerGeneralAiQuestion({
        config: aiConfig,
        prompt: command,
        selectedMonth,
        transactions: monthTransactions,
      });

      setAnswer(result);
      setPrompt("");
      addHistory("对话", "智谱 AI 回复", command);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "AI 调用失败。";

      setAnswer(`智谱 AI 暂时没有成功回复：${errorMessage}`);
      setMessage("你可以先点 AI 配置里的“测试连接”，确认 Key、Base URL 和模型是否可用。");
    } finally {
      setIsSendingPrompt(false);
    }
  }

  function handleConfirmDraft() {
    if (!draft) {
      return;
    }

    addTransaction({
      date: draft.date,
      merchant: draft.merchant,
      category: draft.category,
      account: draft.account,
      amount: draft.amount,
      kind: draft.kind,
      notes: draft.notes,
      excludedFromAnalytics: draft.excludedFromAnalytics,
    });
    setDraft(null);
    setPrompt("");
    setMessage("已确认并写入账本。");
    addHistory(
      "写入",
      "确认写入账本",
      `${draft.merchant} ${formatCurrency(draft.kind === "income" ? draft.amount : -draft.amount)}`,
    );
  }

  function addHistory(type: AiHistoryItem["type"], title: string, detail: string) {
    setHistory((current) => {
      const nextItem = {
        id: `ai-history-${Date.now()}-${current.length}`,
        detail,
        title,
        type,
      };
      const withoutDuplicate = current.filter(
        (item) =>
          !(
            item.type === nextItem.type &&
            item.title === nextItem.title &&
            item.detail === nextItem.detail
          ),
      );

      return [nextItem, ...withoutDuplicate].slice(0, 5);
    });
  }

  function handleSaveConfig() {
    localStorage.setItem(
      AI_CONFIG_STORAGE_KEY,
      JSON.stringify({
        ...aiConfig,
        hasApiKey: Boolean(aiConfig.apiKey.trim() || aiConfig.hasApiKey),
      }),
    );
    setAiConfig({
      ...aiConfig,
      hasApiKey: Boolean(aiConfig.apiKey.trim() || aiConfig.hasApiKey),
    });
    setConfigMessage("AI 配置已保存到浏览器本地。自用没问题，但不要把这个页面部署给别人使用。");
  }

  async function handleTestConnection() {
    setIsTestingConnection(true);
    setConnectionStatus("");

    try {
      const content = await requestAiCompletion({
        config: aiConfig,
        messages: [
          {
            role: "system",
            content: "你是一个连接测试助手，只需要用中文简短回答。",
          },
          {
            role: "user",
            content: "请回复：连接成功。",
          },
        ],
        maxTokens: 40,
      });

      setConnectionStatus(`连接成功：${content}`);
      setConfigMessage("智谱 AI 连接测试成功。");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "连接失败，请检查 API Key、Base URL 和模型名称。";

      setConnectionStatus(`连接失败：${errorMessage}`);
      setConfigMessage("");
    } finally {
      setIsTestingConnection(false);
    }
  }

  function handleGenerateCategorySuggestions() {
    const suggestions = buildCategorySuggestions(
      monthTransactions,
      categoryRules.map((rule) => rule.category),
    );

    setCategorySuggestions(suggestions);
    setMessage(
      suggestions.length > 0
        ? `已生成 ${suggestions.length} 条分类建议，应用前不会修改账本。`
        : "当前月份暂时没有明显需要调整的分类建议。",
    );
    addHistory(
      "建议",
      "生成分类建议",
      `${formatMonthLabel(selectedMonth)}：${suggestions.length} 条`,
    );
  }

  function handleApplyCategorySuggestion(suggestion: CategorySuggestion) {
    updateTransaction(suggestion.transactionId, {
      category: suggestion.nextCategory,
    });
    setCategorySuggestions((current) =>
      current.filter((item) => item.id !== suggestion.id),
    );
    addHistory(
      "建议",
      "应用分类建议",
      `${suggestion.merchant}：${suggestion.currentCategory} -> ${suggestion.nextCategory}`,
    );
  }

  async function handleGenerateMonthlyReport() {
    const report = buildMonthlyReport(monthTransactions, selectedMonth);

    setMonthlyReport(report);
    setAiMonthlySummary("");
    setIsGeneratingReport(true);
    setMessage(
      aiConfig.apiKey.trim()
        ? "正在调用智谱 AI 生成本月总结..."
        : "已根据当前月份真实交易生成本地总结。配置 API Key 后可生成 AI 文字总结。",
    );

    if (aiConfig.apiKey.trim()) {
      try {
        const summary = await generateAiMonthlySummary({
          config: aiConfig,
          report,
          transactions: monthTransactions,
        });

        setAiMonthlySummary(summary);
        setMessage("已调用智谱 AI 生成本月总结。");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "AI 总结生成失败。";

        setMessage(`本地总结已生成，但 AI 调用失败：${errorMessage}`);
      }
    }

    setIsGeneratingReport(false);
    addHistory(
      "总结",
      "生成月度总结",
      `${formatMonthLabel(selectedMonth)}：支出 ${formatCurrencyPlain(report.totalExpense)}`,
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="AI 助手"
        description="支持本地查账、自然语言记账草稿，也可以直连智谱 AI 生成月度总结。"
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={() => setIsConfigOpen((current) => !current)}
          >
            <Settings size={16} />
            AI 配置
          </button>
        }
      />

      <section className="ai-hero-panel">
        <div className="ai-hero-copy">
          <p className="eyebrow">AI 记账入口</p>
          <h3>直接说你想查什么，或者让它帮你记一笔</h3>
          <p>
            当前选择 {formatMonthLabel(selectedMonth)}，本月已有{" "}
            <strong>{monthTransactionCount}</strong> 笔交易可供 AI 分析和操作。
          </p>
        </div>
        <div className="ai-status-card">
          <Bot size={28} />
          <div>
            <strong>{isApiConfigured ? "API 已配置" : "本地规则模式"}</strong>
            <span>
              {isApiConfigured
                ? `当前模型：${aiConfig.model}。普通对话和月度总结会调用真实 AI。`
                : "暂未调用外部 API，所有回答都只基于浏览器里的账本数据。"}
            </span>
          </div>
        </div>
      </section>

      {isConfigOpen ? (
        <section className="panel ai-config-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">配置</p>
              <h3>API 与模型</h3>
            </div>
            <span className="pill">预留</span>
          </div>

          <div className="ai-form-stack">
            <label className="select-field">
              <span>API Key</span>
              <input
                placeholder={
                  aiConfig.hasApiKey
                    ? "已保存 API Key；如需替换，请重新输入"
                    : "填入你的智谱 API Key"
                }
                type="password"
                value={aiConfig.apiKey}
                onChange={(event) =>
                  setAiConfig({ ...aiConfig, apiKey: event.target.value })
                }
              />
            </label>
            <label className="select-field">
              <span>Base URL</span>
              <input
                placeholder="例如 https://open.bigmodel.cn/api/paas/v4/"
                value={aiConfig.baseUrl}
                onChange={(event) =>
                  setAiConfig({ ...aiConfig, baseUrl: event.target.value })
                }
              />
            </label>
            <div className="form-grid-two">
              <label className="select-field">
                <span>服务商</span>
                <select
                  value={aiConfig.provider}
                  onChange={(event) => {
                    const provider = event.target.value as AiConfig["provider"];
                    const nextModel =
                      provider === "zhipu"
                        ? "glm-5.1"
                        : provider === "qwen"
                        ? "qwen-plus"
                        : provider === "openai"
                          ? "gpt-5.5"
                          : aiConfig.model;
                    const nextBaseUrl =
                      provider === "zhipu"
                        ? "https://open.bigmodel.cn/api/paas/v4/"
                        : provider === "qwen"
                        ? "https://dashscope.aliyuncs.com/compatible-mode/v1"
                        : provider === "openai"
                          ? "https://api.openai.com/v1"
                          : aiConfig.baseUrl;

                    setAiConfig({
                      ...aiConfig,
                      baseUrl: nextBaseUrl,
                      model: nextModel,
                      provider,
                    });
                  }}
                >
                  <option value="zhipu">智谱 AI</option>
                  <option value="qwen">千问</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label className="select-field">
                <span>模型</span>
                <input
                  placeholder="例如 glm-5.1"
                  value={aiConfig.model}
                  onChange={(event) =>
                    setAiConfig({ ...aiConfig, model: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-grid-two">
              <label className="select-field">
                <span>默认权限</span>
                <select
                  value={aiConfig.defaultPermission}
                  onChange={(event) =>
                    setAiConfig({
                      ...aiConfig,
                      defaultPermission: event.target
                        .value as AiConfig["defaultPermission"],
                    })
                  }
                >
                  <option value="readonly">只读模式</option>
                  <option value="suggest">建议模式</option>
                  <option value="execute">授权执行</option>
                </select>
              </label>
              <label className="select-field">
                <span>连接状态</span>
                <input
                  readOnly
                  value={isApiConfigured ? "已配置 API Key" : "未配置 API Key"}
                />
              </label>
            </div>
            <div className="panel-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setAiConfig(defaultAiConfig);
                  setConfigMessage("已还原默认配置，保存后生效。");
                }}
              >
                还原默认
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection || !aiConfig.apiKey.trim()}
              >
                {isTestingConnection ? "测试中..." : "测试连接"}
              </button>
              <button className="button button-primary" type="button" onClick={handleSaveConfig}>
                保存配置
              </button>
            </div>
            <p className="ai-security-note">
              现在按你的自用需求，API Key 会保存在浏览器 localStorage。不要把这个版本部署到公网或装第三方脚本。
            </p>
            {configMessage ? <p className="form-success">{configMessage}</p> : null}
            {connectionStatus ? (
              <p
                className={
                  connectionStatus.startsWith("连接成功") ? "form-success" : "form-error"
                }
              >
                {connectionStatus}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="ai-grid ai-workspace-grid">
        <article className="panel ai-command-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">对话</p>
              <h3>像聊天一样下指令</h3>
            </div>
            <span className="pill">自动判断</span>
          </div>

          <div className="ai-command-box">
            <textarea
              value={prompt}
              placeholder="例如：帮我记一笔，昨天午饭 28 元，支付宝，分类餐饮。也可以问：4 月餐饮花了多少钱？或者：总结本月消费。"
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  handleAssistantSend();
                }
              }}
            />
            <div className="panel-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={handleAssistantSend}
                disabled={!prompt.trim() || isSendingPrompt}
              >
                {isSendingPrompt ? "发送中..." : "发送给 AI"}
              </button>
            </div>
            <div className="ai-command-hints">
              <button type="button" onClick={() => setPrompt("帮我记一笔，昨天午饭 28 元，支付宝，分类餐饮")}>
                记一笔
              </button>
              <button type="button" onClick={() => setPrompt("4 月餐饮花了多少钱？")}>
                查账
              </button>
              <button type="button" onClick={() => setPrompt("总结本月消费")}>
                总结
              </button>
            </div>
          </div>
        </article>
        <article className="table-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">结果</p>
              <h3>{mode === "readonly" ? "AI 回复" : "需要你确认"}</h3>
            </div>
          </div>

          {answer ? <div className="ai-answer-card">{answer}</div> : null}

          {draft ? (
            <div className="ai-draft-card">
              <div className="ai-draft-main">
                <span>{draft.kind === "income" ? "收入" : "支出"}</span>
                <strong>{formatCurrency(draft.kind === "income" ? draft.amount : -draft.amount)}</strong>
              </div>
              <div className="ai-draft-grid">
                <div>
                  <span>日期</span>
                  <strong>{formatFullDateZh(draft.date)}</strong>
                </div>
                <div>
                  <span>商户 / 来源</span>
                  <strong>{draft.merchant}</strong>
                </div>
                <div>
                  <span>分类</span>
                  <strong>{draft.category}</strong>
                </div>
                <div>
                  <span>账户</span>
                  <strong>{draft.account}</strong>
                </div>
                <div>
                  <span>置信度</span>
                  <strong>{draft.confidence}</strong>
                </div>
                <div>
                  <span>分析</span>
                  <strong>{draft.excludedFromAnalytics ? "不计入" : "计入"}</strong>
                </div>
              </div>
              {draft.notes ? <p>{draft.notes}</p> : null}
              <div className="panel-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setDraft(null)}
                >
                  放弃草稿
                </button>
                <button className="button button-primary" type="button" onClick={handleConfirmDraft}>
                  确认写入账本
                </button>
              </div>
            </div>
          ) : null}

          {!answer && !draft ? (
            <div className="ai-empty-suggestions">
              <Sparkles size={24} />
              <p>你直接说想做什么就行：查账、记一笔、总结本月。我会自动判断，能安全执行的就直接做。</p>
            </div>
          ) : null}

          {message ? <p className="form-success">{message}</p> : null}
        </article>

        <aside className="detail-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">历史</p>
              <h3>AI 操作历史</h3>
            </div>
            {history.length > 0 ? (
              <button
                className="text-button"
                type="button"
                onClick={() => setHistory([])}
              >
                清空历史
              </button>
            ) : (
              <span className="pill">0 条</span>
            )}
          </div>
          {history.length > 0 ? (
            <div className="ai-history-list">
              {history.map((item) => (
                <div key={item.id} className="ai-history-row">
                  <span>{item.type}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ai-empty-suggestions">
              <Sparkles size={24} />
              <p>这里会记录只读查账、生成草稿和确认写入等 AI 操作。</p>
            </div>
          )}
        </aside>
      </section>

      <section className="ai-permission-grid">
        {permissionModes.map((permission) => {
          const Icon = permission.icon;

          return (
            <article
              key={permission.title}
              className={`ai-permission-card ai-permission-${permission.tone}`}
            >
              <Icon size={22} />
              <strong>{permission.title}</strong>
              <p>{permission.body}</p>
            </article>
          );
        })}
      </section>

      <section className="table-panel ai-monthly-report-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">月度总结</p>
            <h3>AI 本月消费分析</h3>
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={handleGenerateMonthlyReport}
            disabled={monthTransactions.length === 0 || isGeneratingReport}
          >
            {isGeneratingReport ? "生成中..." : "生成本月总结"}
          </button>
        </div>

        {monthlyReport ? (
          <div className="ai-report-card">
            <div className="ai-report-hero">
              <div>
                <span>{formatMonthLabel(monthlyReport.month)}</span>
                <strong>{formatCurrencyPlain(monthlyReport.totalExpense)}</strong>
                <p>
                  本月收入 {formatCurrencyPlain(monthlyReport.income)}，净现金流{" "}
                  {formatCurrencyPlain(monthlyReport.net)}，共记录{" "}
                  {monthlyReport.transactionCount} 笔计入分析的交易。
                </p>
              </div>
              <div>
                <span>最高消费日</span>
                <strong>
                  {monthlyReport.highestDay
                    ? formatFullDateZh(monthlyReport.highestDay.date)
                    : "暂无"}
                </strong>
                <p>
                  {monthlyReport.highestDay
                    ? `当天支出 ${formatCurrencyPlain(monthlyReport.highestDay.amount)}`
                    : "本月还没有支出记录。"}
                </p>
              </div>
            </div>

            <div className="ai-report-grid">
              {aiMonthlySummary ? (
                <div className="ai-report-ai-summary">
                  <h4>智谱 AI 总结</h4>
                  <p>{aiMonthlySummary}</p>
                </div>
              ) : null}
              <div>
                <h4>主要花费</h4>
                {monthlyReport.categoryHighlights.length > 0 ? (
                  <div className="ai-report-list">
                    {monthlyReport.categoryHighlights.map((category) => (
                      <p key={category.name}>
                        <strong>{category.name}</strong>
                        <span>
                          {formatCurrencyPlain(category.amount)}，{category.count} 笔，
                          占支出 {category.share}%
                        </span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">本月暂无支出分类。</p>
                )}
              </div>

              <div>
                <h4>需要留意</h4>
                <div className="ai-report-list">
                  {monthlyReport.alerts.map((alert) => (
                    <p key={alert}>{alert}</p>
                  ))}
                </div>
              </div>

              <div>
                <h4>可以怎么省</h4>
                <div className="ai-report-list">
                  {monthlyReport.suggestions.map((suggestion) => (
                    <p key={suggestion}>{suggestion}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="ai-empty-suggestions">
            <Sparkles size={24} />
            <p>点击按钮后，会基于当前月份真实交易生成消费习惯、异常日期和省钱建议。</p>
          </div>
        )}
      </section>

      <section className="table-panel ai-suggestion-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">建议模式</p>
            <h3>AI 分类建议</h3>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={handleGenerateCategorySuggestions}
          >
            生成建议
          </button>
        </div>

        {categorySuggestions.length > 0 ? (
          <div className="ai-suggestion-list">
            {categorySuggestions.map((suggestion) => (
              <div key={suggestion.id} className="ai-suggestion-row">
                <div>
                  <strong>{suggestion.merchant}</strong>
                  <span>{suggestion.reason}</span>
                </div>
                <div className="ai-suggestion-change">
                  <span>{suggestion.currentCategory}</span>
                  <strong>{suggestion.nextCategory}</strong>
                </div>
                <div className="panel-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      setCategorySuggestions((current) =>
                        current.filter((item) => item.id !== suggestion.id),
                      )
                    }
                  >
                    忽略
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => handleApplyCategorySuggestion(suggestion)}
                  >
                    应用
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ai-empty-suggestions">
            <Sparkles size={24} />
            <p>点击生成建议后，AI 会优先检查“其他”和疑似分类不准确的交易。</p>
          </div>
        )}
      </section>

      <section className="table-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">能力</p>
            <h3>当前已接入的 AI 流程</h3>
          </div>
        </div>

        <div className="ai-feature-list">
          {assistantFeatures.map((feature) => (
            <div key={feature.title} className="ai-feature-row">
              <CheckCircle2 size={18} />
              <div>
                <strong>{feature.title}</strong>
                <span>{feature.body}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function answerReadonlyQuestion(
  prompt: string,
  transactions: Transaction[],
  selectedMonth: string,
) {
  const month = resolveQuestionMonth(prompt, selectedMonth);
  const date = resolveQuestionDate(prompt, selectedMonth);
  const scopedTransactions = (
    date
      ? transactions.filter((transaction) => transaction.date === date)
      : filterTransactionsByMonth(transactions, month)
  ).filter(
    (transaction) => !transaction.excludedFromAnalytics,
  );
  const expenses = scopedTransactions.filter((transaction) => transaction.amount < 0);
  const income = scopedTransactions.filter((transaction) => transaction.amount > 0);
  const keyword = findCategoryOrKeyword(prompt);

  if (scopedTransactions.length === 0) {
    if (date) {
      return `${formatFullDateZh(date)} 没有可分析的交易。`;
    }

    return `${formatMonthLabel(month)} 还没有可分析的交易。`;
  }

  if (date || prompt.includes("昨天") || prompt.includes("前天") || prompt.includes("今天")) {
    return answerDailyQuestion(date ?? scopedTransactions[0].date, scopedTransactions);
  }

  if (prompt.includes("最大") || prompt.includes("最高") || prompt.includes("最贵")) {
    const biggest = [...expenses].sort((left, right) => left.amount - right.amount)[0];

    if (!biggest) {
      return `${formatMonthLabel(month)} 没有支出记录。`;
    }

    return `${formatMonthLabel(month)} 最大的一笔支出是 ${formatFullDateZh(biggest.date)} 的 ${biggest.merchant}，金额 ${formatCurrency(biggest.amount)}，分类是 ${biggest.category}。`;
  }

  if (prompt.includes("哪天") || prompt.includes("每天") || prompt.includes("花最多")) {
    const daily = expenses.reduce<Record<string, number>>((result, transaction) => {
      result[transaction.date] = (result[transaction.date] ?? 0) + Math.abs(transaction.amount);
      return result;
    }, {});
    const [date, amount] =
      Object.entries(daily).sort((left, right) => right[1] - left[1])[0] ?? [];

    if (!date) {
      return `${formatMonthLabel(month)} 没有支出记录。`;
    }

    return `${formatMonthLabel(month)} 花得最多的一天是 ${formatFullDateZh(date)}，当天支出 ${formatCurrencyPlain(amount)}。`;
  }

  if (keyword) {
    const matched = expenses.filter((transaction) =>
      `${transaction.category} ${transaction.merchant} ${transaction.notes ?? ""}`
        .toLowerCase()
        .includes(keyword.toLowerCase()),
    );
    const total = matched.reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount),
      0,
    );
    const monthExpense = expenses.reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount),
      0,
    );
    const share = monthExpense > 0 ? Math.round((total / monthExpense) * 100) : 0;

    return `${formatMonthLabel(month)} 和「${keyword}」相关的支出共 ${matched.length} 笔，合计 ${formatCurrencyPlain(total)}，约占本月支出的 ${share}%。`;
  }

  const incomeTotal = income.reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenseTotal = expenses.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );

  return `${formatMonthLabel(month)} 收入 ${formatCurrencyPlain(incomeTotal)}，支出 ${formatCurrencyPlain(expenseTotal)}，净现金流 ${formatCurrencyPlain(incomeTotal - expenseTotal)}。`;
}

function answerDailyQuestion(date: string, transactions: Transaction[]) {
  const expenses = transactions.filter((transaction) => transaction.amount < 0);
  const income = transactions.filter((transaction) => transaction.amount > 0);
  const expenseTotal = expenses.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );
  const incomeTotal = income.reduce((sum, transaction) => sum + transaction.amount, 0);
  const topTransactions = [...expenses]
    .sort((left, right) => left.amount - right.amount)
    .slice(0, 3);
  const topText =
    topTransactions.length > 0
      ? topTransactions
          .map(
            (transaction) =>
              `${transaction.merchant} ${formatCurrencyPlain(Math.abs(transaction.amount))}`,
          )
          .join("、")
      : "没有支出明细";

  return `${formatFullDateZh(date)}：支出 ${formatCurrencyPlain(expenseTotal)}，收入 ${formatCurrencyPlain(incomeTotal)}，共 ${transactions.length} 笔交易。主要支出：${topText}。`;
}

function buildMonthlyReport(
  transactions: Transaction[],
  selectedMonth: string,
): MonthlyReport {
  const included = transactions.filter(
    (transaction) => !transaction.excludedFromAnalytics,
  );
  const expenses = included.filter((transaction) => transaction.amount < 0);
  const income = included
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpense = expenses.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );
  const biggestExpense = [...expenses].sort(
    (left, right) => left.amount - right.amount,
  )[0];
  const dailyExpense = expenses.reduce<Record<string, number>>((result, transaction) => {
    result[transaction.date] =
      (result[transaction.date] ?? 0) + Math.abs(transaction.amount);
    return result;
  }, {});
  const highestDayEntry = Object.entries(dailyExpense).sort(
    (left, right) => right[1] - left[1],
  )[0];
  const categoryHighlights = Object.values(
    expenses.reduce<
      Record<string, { name: string; amount: number; count: number; share: number }>
    >((result, transaction) => {
      const name = transaction.category || "其他";
      const current = result[name] ?? { name, amount: 0, count: 0, share: 0 };

      result[name] = {
        ...current,
        amount: current.amount + Math.abs(transaction.amount),
        count: current.count + 1,
      };
      return result;
    }, {}),
  )
    .map((category) => ({
      ...category,
      share:
        totalExpense > 0 ? Math.round((category.amount / totalExpense) * 100) : 0,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 3);
  const averageDailyExpense =
    Object.keys(dailyExpense).length > 0
      ? totalExpense / Object.keys(dailyExpense).length
      : 0;
  const alerts = buildMonthlyReportAlerts(
    biggestExpense,
    highestDayEntry,
    averageDailyExpense,
    totalExpense,
  );
  const suggestions = buildMonthlyReportSuggestions(
    categoryHighlights,
    totalExpense,
    income,
  );

  return {
    alerts,
    biggestExpense,
    categoryHighlights,
    highestDay: highestDayEntry
      ? { date: highestDayEntry[0], amount: highestDayEntry[1] }
      : undefined,
    income,
    month: selectedMonth,
    net: income - totalExpense,
    suggestions,
    totalExpense,
    transactionCount: included.length,
  };
}

function buildMonthlyReportAlerts(
  biggestExpense: Transaction | undefined,
  highestDayEntry: [string, number] | undefined,
  averageDailyExpense: number,
  totalExpense: number,
) {
  const alerts: string[] = [];

  if (!biggestExpense || totalExpense <= 0) {
    return ["本月暂时没有可分析的支出，先导入或记录几笔交易后再生成会更有价值。"];
  }

  const biggestShare = Math.round((Math.abs(biggestExpense.amount) / totalExpense) * 100);
  alerts.push(
    `最大单笔是 ${formatFullDateZh(biggestExpense.date)} 的 ${biggestExpense.merchant}，金额 ${formatCurrencyPlain(Math.abs(biggestExpense.amount))}，占本月支出 ${biggestShare}%。`,
  );

  if (highestDayEntry && highestDayEntry[1] > averageDailyExpense * 1.8) {
    alerts.push(
      `${formatFullDateZh(highestDayEntry[0])} 明显高于本月日均支出，适合回看当天是否有大额或异常消费。`,
    );
  }

  if (biggestShare >= 30) {
    alerts.push("本月支出比较集中在少数大额交易上，建议优先确认这些交易是否必要。");
  }

  return alerts;
}

function buildMonthlyReportSuggestions(
  categoryHighlights: MonthlyReport["categoryHighlights"],
  totalExpense: number,
  income: number,
) {
  const suggestions: string[] = [];
  const topCategory = categoryHighlights[0];

  if (!topCategory) {
    return ["先保持记录习惯，等本月有更多交易后再做分类优化。"];
  }

  suggestions.push(
    `优先关注「${topCategory.name}」，它占本月支出的 ${topCategory.share}%，这里通常最容易找到可调整空间。`,
  );

  if (topCategory.count >= 8) {
    suggestions.push(
      `「${topCategory.name}」出现 ${topCategory.count} 笔，建议看看是否有高频小额消费可以合并或减少。`,
    );
  }

  if (income > 0 && totalExpense / income >= 0.8) {
    suggestions.push("本月支出已经接近收入，建议给下个月设置一个更明确的支出上限。");
  } else {
    suggestions.push("目前收支压力不算高，可以继续把分类规则调准，让后续总结更准确。");
  }

  return suggestions;
}

function isHighRiskCommand(prompt: string) {
  return /(批量|全部|清空|删除|覆盖|恢复|重置|导入覆盖|删掉所有|全部改成)/.test(prompt);
}

function isMonthlySummaryCommand(prompt: string) {
  return /(总结|月报|分析本月|本月消费分析|消费习惯|省钱建议)/.test(prompt);
}

function isLocalFinanceQuestion(prompt: string) {
  return /(消费|花了多少|花了|多少钱|收入|支出|净现金流|最大|最高|最贵|哪天|每天|花最多|今天|昨天|前天|\d{1,2}\s*(月|号|日)|餐饮|交通|购物|娱乐|住房|健康|软件工具|外卖|打车|奶茶|咖啡)/.test(
    prompt,
  );
}

function shouldAutoWriteTransaction(prompt: string, draft: DraftTransaction) {
  const hasWriteIntent = /(记一笔|记账|帮我记|新增|记录|存一笔)/.test(prompt);
  const hasPaymentContext = /(支付宝|微信|现金|银行卡|花呗|付款|支付)/.test(prompt);
  const hasMerchantContext =
    draft.merchant !== "其他消费" &&
    draft.merchant !== "支出消费" &&
    draft.merchant !== "收入入账";

  return (
    hasWriteIntent &&
    draft.confidence === "较高" &&
    Boolean(draft.date) &&
    Boolean(draft.category) &&
    (hasPaymentContext || hasMerchantContext)
  );
}

async function answerGeneralAiQuestion({
  config,
  prompt,
  selectedMonth,
  transactions,
}: {
  config: AiConfig;
  prompt: string;
  selectedMonth: string;
  transactions: Transaction[];
}) {
  const compactContext = transactions
    .filter((transaction) => !transaction.excludedFromAnalytics)
    .slice(0, 80)
    .map((transaction) => ({
      date: transaction.date,
      merchant: transaction.merchant,
      category: transaction.category,
      amount: transaction.amount,
    }));

  return requestAiCompletion({
    config,
    messages: [
      {
        role: "system",
        content:
          "你是这个私人记账 App 里的 AI 助手。你可以介绍自己，也可以基于用户账本上下文回答。不要声称你已经执行了没有被应用代码执行的操作。涉及删除、覆盖、批量修改等高风险操作时，必须提示需要确认。",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            userQuestion: prompt,
            selectedMonth,
            availableContext: compactContext,
          },
          null,
          2,
        ),
      },
    ],
    maxTokens: 500,
  });
}

async function generateAiMonthlySummary({
  config,
  report,
  transactions,
}: {
  config: AiConfig;
  report: MonthlyReport;
  transactions: Transaction[];
}) {
  const compactTransactions = transactions
    .filter((transaction) => !transaction.excludedFromAnalytics)
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
    .slice(0, 20)
    .map((transaction) => ({
      date: transaction.date,
      merchant: transaction.merchant,
      category: transaction.category,
      amount: transaction.amount,
      notes: transaction.notes,
    }));

  return requestAiCompletion({
    config,
    messages: [
      {
        role: "system",
        content:
          "你是一个私人记账 App 的中文财务分析助手。你只能基于用户提供的交易数据分析，不要编造数据。输出要简洁、具体、可执行。",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "请用中文给出本月消费总结。最多 5 句话，不要展开推理过程，不要复述 JSON。",
            month: report.month,
            summary: {
              income: report.income,
              totalExpense: report.totalExpense,
              net: report.net,
              transactionCount: report.transactionCount,
              highestDay: report.highestDay,
              topCategories: report.categoryHighlights,
            },
            topTransactionsByAbsoluteAmount: compactTransactions,
          },
          null,
          2,
        ),
      },
    ],
    maxTokens: 900,
  });
}

async function requestAiCompletion({
  config,
  maxTokens = 300,
  messages,
}: {
  config: AiConfig;
  maxTokens?: number;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}) {
  const apiKey = config.apiKey.trim();
  const baseUrl = normalizeAiBaseUrl(config.baseUrl);
  const model = config.model.trim();

  if (!apiKey) {
    throw new Error("请先填写 API Key。");
  }

  if (!baseUrl) {
    throw new Error("请填写 Base URL。");
  }

  if (!model) {
    throw new Error("请填写模型名称。");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.msg ||
      payload?.message ||
      `HTTP ${response.status}`;

    throw new Error(message);
  }

  const { content, finishReason } = extractAiContent(payload);

  if (!content) {
    throw new Error(getAiResponseErrorMessage(payload));
  }

  return finishReason === "length"
    ? `${content}\n\n（AI 输出被截断，我已经展示能读取到的部分。可以把模型 max_tokens 调高，或让它“更简短总结”。）`
    : content;
}

function normalizeAiBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function extractAiContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { content: "", finishReason: "" };
  }

  const response = payload as {
    choices?: Array<{
      delta?: { content?: unknown; reasoning_content?: unknown };
      finish_reason?: unknown;
      message?: { content?: unknown; reasoning_content?: unknown };
      reasoning_content?: unknown;
      text?: unknown;
    }>;
    data?: {
      choices?: Array<{
        delta?: { content?: unknown; reasoning_content?: unknown };
        finish_reason?: unknown;
        message?: { content?: unknown; reasoning_content?: unknown };
        reasoning_content?: unknown;
        text?: unknown;
      }>;
      output_text?: unknown;
    };
    output_text?: unknown;
    result?: unknown;
  };
  const firstChoice = response.choices?.[0] ?? response.data?.choices?.[0];
  const finishReason =
    typeof firstChoice?.finish_reason === "string" ? firstChoice.finish_reason : "";
  const content =
    firstChoice?.message?.content ??
    firstChoice?.message?.reasoning_content ??
    firstChoice?.delta?.content ??
    firstChoice?.delta?.reasoning_content ??
    firstChoice?.reasoning_content ??
    firstChoice?.text ??
    response.output_text ??
    response.data?.output_text ??
    response.result;

  if (typeof content === "string") {
    return { content: cleanAiText(content), finishReason };
  }

  if (Array.isArray(content)) {
    return {
      content: cleanAiText(
        content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }

        return "";
      })
      .join("")
      ),
      finishReason,
    };
  }

  return { content: "", finishReason };
}

function cleanAiText(text: string) {
  return text
    .replace(/^```(?:json|text|markdown)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function getAiResponseErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "AI 接口没有返回可读取内容。";
  }

  const response = payload as {
    choices?: Array<{ finish_reason?: unknown }>;
    error?: { message?: unknown };
    message?: unknown;
    msg?: unknown;
  };
  const finishReason = response.choices?.[0]?.finish_reason;
  const errorMessage =
    response.error?.message ?? response.message ?? response.msg ?? "";

  if (typeof errorMessage === "string" && errorMessage) {
    return errorMessage;
  }

  if (finishReason === "length") {
    return "AI 输出被截断，而且没有返回正文。请换用更大的 max_tokens 或让它更简短。";
  }

  return "AI 接口返回了结果，但没有可展示的正文。";
}

function parseTransactionDraft(
  prompt: string,
  selectedMonth: string,
  transactions: Transaction[],
  ruleCategories: string[],
): DraftTransaction | null {
  const amount = parseAmount(prompt);

  if (!amount) {
    return null;
  }

  const kind = inferKind(prompt);
  const category = inferCategory(prompt, kind, ruleCategories);
  const account = inferAccount(prompt, transactions);
  const date = inferDate(prompt, selectedMonth);
  const merchant = inferMerchant(prompt, category);
  const confidence = [date, merchant, category, account].filter(Boolean).length >= 4
    ? "较高"
    : "中等";

  return {
    date,
    merchant,
    category,
    account,
    amount,
    kind,
    notes: `AI 草稿：${prompt.trim()}`,
    excludedFromAnalytics: prompt.includes("不计入") || prompt.includes("排除"),
    confidence,
  };
}

function parseAmount(prompt: string) {
  const explicitAmount =
    prompt.match(/(?:¥|￥)\s*(\d+(?:\.\d+)?)/) ??
    prompt.match(/(\d+(?:\.\d+)?)\s*(?:元|块|块钱|人民币|rmb|RMB)/);
  const candidates = [...prompt.matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => ({
      index: match.index ?? 0,
      value: Number(match[0]),
    }))
    .filter((match) => Number.isFinite(match.value) && match.value > 0)
    .filter((match) => !isLikelyDateOrQuantity(prompt, match.index));
  const amount = explicitAmount
    ? Number(explicitAmount[1])
    : candidates.at(-1)?.value ?? 0;

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isLikelyDateOrQuantity(prompt: string, index: number) {
  const context = prompt.slice(index, index + 8);

  return /^(?:\d+(?:\.\d+)?)(?:月|号|日|杯|个|份|张|次|件)/.test(context);
}

function inferKind(prompt: string): TransactionKind {
  if (/(工资|收入|收款|奖金|报销到账|退款到账)/.test(prompt)) {
    return "income";
  }

  return "expense";
}

function inferCategory(
  prompt: string,
  kind: TransactionKind,
  ruleCategories: string[],
) {
  const categoryRules: Array<[RegExp, string]> = [
    [/(工资|收入|奖金|收款)/, "收入"],
    [/(打车|滴滴|地铁|公交|高铁|机票|交通)/, "交通"],
    [/(饭|餐|外卖|美团|饿了么|咖啡|奶茶|午饭|晚饭|早餐)/, "餐饮"],
    [/(电影|游戏|会员|娱乐|演出)/, "娱乐"],
    [/(房租|物业|水电|住房)/, "住房"],
    [/(药|医院|体检|健康)/, "健康"],
    [/(软件|订阅|服务器|API|DCloud|工具)/i, "软件工具"],
    [/(买|购物|淘宝|京东|拼多多)/, "购物"],
  ];
  const matched = categoryRules.find(([rule]) => rule.test(prompt))?.[1];

  if (matched) {
    return matched;
  }

  return kind === "income"
    ? "收入"
    : ruleCategories.find((category) => category !== "收入") ?? "其他";
}

function buildCategorySuggestions(
  transactions: Transaction[],
  ruleCategories: string[],
): CategorySuggestion[] {
  return transactions
    .map((transaction) => {
      const text = `${transaction.merchant} ${transaction.notes ?? ""} ${transaction.category}`;
      const nextCategory = inferCategory(text, transaction.kind, ruleCategories);
      const shouldSuggest =
        nextCategory &&
        nextCategory !== transaction.category &&
        (transaction.category === "其他" || isHighConfidenceCategory(text));

      if (!shouldSuggest) {
        return null;
      }

      return {
        id: `suggestion-${transaction.id}`,
        currentCategory: transaction.category,
        merchant: transaction.merchant,
        nextCategory,
        reason:
          transaction.category === "其他"
            ? "当前是其他，AI 根据商户和备注给出更具体分类。"
            : "AI 发现商户关键词和当前分类不一致。",
        transactionId: transaction.id,
      };
    })
    .filter((item): item is CategorySuggestion => Boolean(item))
    .slice(0, 8);
}

function isHighConfidenceCategory(text: string) {
  return /(打车|滴滴|地铁|公交|饭|餐|外卖|美团|饿了么|咖啡|奶茶|电影|游戏|会员|房租|物业|医院|软件|服务器|DCloud|淘宝|京东|拼多多)/i.test(
    text,
  );
}

function inferAccount(prompt: string, transactions: Transaction[]) {
  if (prompt.includes("支付宝") || prompt.includes("花呗")) {
    return prompt.includes("花呗") ? "花呗" : "支付宝";
  }

  if (prompt.includes("微信")) {
    return "微信支付";
  }

  if (prompt.includes("现金")) {
    return "现金";
  }

  if (prompt.includes("银行卡") || prompt.includes("银行")) {
    return "银行卡";
  }

  return transactions[0]?.account ?? "现金";
}

function inferDate(prompt: string, selectedMonth: string) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const selectedMonthAnchor = new Date(year, month, 0);

  if (prompt.includes("昨天")) {
    selectedMonthAnchor.setDate(selectedMonthAnchor.getDate() - 1);
    return formatDateInput(selectedMonthAnchor);
  }

  if (prompt.includes("前天")) {
    selectedMonthAnchor.setDate(selectedMonthAnchor.getDate() - 2);
    return formatDateInput(selectedMonthAnchor);
  }

  const dayMatch = prompt.match(/(\d{1,2})\s*(?:号|日)/);

  if (dayMatch) {
    return `${selectedMonth}-${dayMatch[1].padStart(2, "0")}`;
  }

  const today = new Date();
  const todayText = formatDateInput(today);

  return todayText.startsWith(selectedMonth)
    ? todayText
    : `${selectedMonth}-01`;
}

function inferMerchant(prompt: string, category: string) {
  const merchantRules: Array<[RegExp, string]> = [
    [/(美团|饿了么|蜜雪冰城|星巴克|瑞幸)/, "$1"],
    [/(滴滴|Uber|高德打车)/i, "$1"],
    [/(支付宝|微信|花呗)/, "$1"],
    [/(DCloud|阿里云|腾讯云|OpenAI|千问)/i, "$1"],
  ];

  for (const [rule, replacement] of merchantRules) {
    const matched = prompt.match(rule);

    if (matched) {
      return replacement.replace("$1", matched[1]);
    }
  }

  return category === "收入" ? "收入入账" : `${category}消费`;
}

function resolveQuestionMonth(prompt: string, selectedMonth: string) {
  const matched = prompt.match(/(\d{1,2})\s*月/);

  if (!matched) {
    return selectedMonth;
  }

  const year = selectedMonth.slice(0, 4);

  return `${year}-${matched[1].padStart(2, "0")}`;
}

function resolveQuestionDate(prompt: string, selectedMonth: string) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const selectedMonthAnchor = new Date(year, month, 0);

  if (prompt.includes("昨天")) {
    selectedMonthAnchor.setDate(selectedMonthAnchor.getDate() - 1);
    return formatDateInput(selectedMonthAnchor);
  }

  if (prompt.includes("前天")) {
    selectedMonthAnchor.setDate(selectedMonthAnchor.getDate() - 2);
    return formatDateInput(selectedMonthAnchor);
  }

  if (prompt.includes("今天")) {
    return formatDateInput(selectedMonthAnchor);
  }

  const monthDayMatch = prompt.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:号|日)?/);

  if (monthDayMatch) {
    return `${year}-${monthDayMatch[1].padStart(2, "0")}-${monthDayMatch[2].padStart(2, "0")}`;
  }

  const dayMatch = prompt.match(/(\d{1,2})\s*(?:号|日)/);

  if (dayMatch) {
    return `${selectedMonth}-${dayMatch[1].padStart(2, "0")}`;
  }

  return "";
}

function findCategoryOrKeyword(prompt: string) {
  const candidates = [
    "餐饮",
    "交通",
    "购物",
    "娱乐",
    "住房",
    "健康",
    "软件工具",
    "外卖",
    "打车",
    "奶茶",
    "咖啡",
  ];

  return candidates.find((candidate) => prompt.includes(candidate)) ?? "";
}

function formatDateInput(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function loadAiConfig(): AiConfig {
  try {
    const saved = localStorage.getItem(AI_CONFIG_STORAGE_KEY);

    if (!saved) {
      return defaultAiConfig;
    }

    const parsed = JSON.parse(saved);

    return { ...defaultAiConfig, ...parsed };
  } catch {
    return defaultAiConfig;
  }
}

function loadAiHistory(): AiHistoryItem[] {
  try {
    const saved = localStorage.getItem(AI_HISTORY_STORAGE_KEY);

    return saved ? JSON.parse(saved).slice(0, 5) : [];
  } catch {
    return [];
  }
}
