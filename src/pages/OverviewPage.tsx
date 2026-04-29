import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "../components/PageHeader";
import { RecordTransactionDialog } from "../components/RecordTransactionDialog";
import {
  formatCurrency,
  formatCurrencyPlain,
  formatDateZh,
  transactionKindLabel,
} from "../domain/formatters";
import {
  buildCategoryBreakdown,
  buildMonthlyTrend,
  buildMonthlySummary,
  filterTransactionsByMonth,
  useFinance,
} from "../store/FinanceStore";

const chartColors = ["#24463b", "#4d7d67", "#8ba99a", "#c7a96b", "#c97b63", "#7f6a4c"];
type CalendarView = "month" | "year";

export function OverviewPage() {
  const { selectedMonth, transactions } = useFinance();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const monthTransactions = filterTransactionsByMonth(transactions, selectedMonth);
  const monthlySummary = buildMonthlySummary(monthTransactions, selectedMonth);
  const monthlyTrend = buildMonthlyTrend(transactions, selectedMonth);
  const categoryBreakdown = buildCategoryBreakdown(monthTransactions);
  const dailyHeatmap = buildDailyHeatmap(monthTransactions, selectedMonth);
  const yearlyHeatmap = buildYearHeatmap(transactions, selectedMonth);
  const visibleTransactions = selectedCategory
    ? monthTransactions.filter((item) => item.category === selectedCategory)
    : monthTransactions;
  const spendingBars = categoryBreakdown.slice(0, 6);
  const summaryCards = [
    { label: "净现金流", value: monthlySummary.net, tone: "hero" },
    { label: "收入", value: monthlySummary.income, tone: "positive" },
    { label: "支出", value: monthlySummary.spent, tone: "negative" },
  ] as const;

  function handleExportSummary() {
    const summary = {
      month: selectedMonth,
      net: monthlySummary.net,
      income: monthlySummary.income,
      spent: monthlySummary.spent,
      categories: categoryBreakdown.map((item) => ({
        name: item.name,
        amount: item.amount,
        share: `${item.share}%`,
      })),
      transactions: monthTransactions.map((item) => ({
        date: item.date,
        merchant: item.merchant,
        category: item.category,
        account: item.account,
        kind: transactionKindLabel(item.kind),
        amount: item.amount,
        source: item.source,
        notes: item.notes ?? "",
      })),
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `finance-summary-${selectedMonth}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="总览"
        description="以月份为核心的个人财务工作台，同时查看净现金流、分类花费和交易明细。"
        actions={
          <>
            <button
              className="button button-secondary"
              type="button"
              onClick={handleExportSummary}
            >
              导出摘要
            </button>
            <RecordTransactionDialog />
          </>
        }
      />

      <section className="metrics-grid">
        {summaryCards.map((card) => (
          <article
            key={card.label}
            className={`metric-card metric-card-${card.tone}`}
          >
            <div className="metric-heading">
              <span>{card.label}</span>
              {card.label === "净现金流" ? (
                <span className="metric-change">
                  {monthlySummary.transactionCount} 笔交易
                </span>
              ) : null}
            </div>
            <strong>{card.value}</strong>
            <p>
              {card.label === "净现金流"
                ? "本月盈余、收入和支出都会从统一交易数据自动计算。"
                : "当前所选月份的实时汇总。"}
            </p>
          </article>
        ))}

        <article className="metric-card metric-card-neutral spending-bar-card">
          <div className="metric-heading">
            <span>钱花在哪</span>
            <span>{spendingBars.length} 类</span>
          </div>
          <div className="mini-bar-chart">
            <ResponsiveContainer width="100%" height={112}>
              <BarChart data={spendingBars} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" hide />
                <YAxis hide />
                <Tooltip formatter={(value) => formatCurrencyPlain(Number(value))} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {spendingBars.map((item, index) => (
                    <Cell key={item.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p>按分类汇总本月支出，最高的柱子就是最大花费方向。</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <div className="panel-header">
            <div>
              <p className="eyebrow">分类重点</p>
              <h3>钱花到哪里了</h3>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setSelectedCategory(null)}
            >
              清除筛选
            </button>
          </div>

          <div className="category-layout">
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="value"
                    innerRadius={66}
                    outerRadius={98}
                    paddingAngle={3}
                    nameKey="name"
                    onClick={(entry) => {
                      if (entry.name) {
                        setSelectedCategory(String(entry.name));
                      }
                    }}
                  >
                    {categoryBreakdown.map((item, index) => (
                      <Cell
                        key={item.name}
                        fill={chartColors[index % chartColors.length]}
                        opacity={
                          selectedCategory && selectedCategory !== item.name ? 0.35 : 1
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrencyPlain(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-center">
                <strong>{monthlySummary.spent}</strong>
                <span>已支出</span>
              </div>
            </div>

            <div className="category-list">
              {categoryBreakdown.map((item, index) => (
                <button
                  key={item.name}
                  className={`category-row category-button${
                    selectedCategory === item.name ? " is-active" : ""
                  }`}
                  type="button"
                  onClick={() =>
                    setSelectedCategory((current) =>
                      current === item.name ? null : item.name,
                    )
                  }
                >
                  <div>
                    <strong>
                      <span
                        className="category-dot"
                        style={{
                          backgroundColor: chartColors[index % chartColors.length],
                        }}
                      />
                      {item.name}
                    </strong>
                    <span>{item.amount}</span>
                  </div>
                  <div className="category-meta">
                    <span>{item.share}%</span>
                    <span>{item.count} 笔</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">趋势</p>
              <h3>收入与支出</h3>
            </div>
            <span className="pill">近 6 个月</span>
          </div>

          <div className="trend-card">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={monthlyTrend}
                margin={{ top: 8, right: 6, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="incomeFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#2f7a58" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#2f7a58" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#b45445" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#b45445" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(value) => formatCurrencyPlain(Number(value))} />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#2f7a58"
                  strokeWidth={3}
                  fill="url(#incomeFill)"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="#b45445"
                  strokeWidth={3}
                  fill="url(#expenseFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="panel-footer">
            <span>趋势图会继续接入真实月份数据，用来观察收入和支出变化。</span>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">支出柱状图</p>
              <h3>分类支出排行</h3>
            </div>
            <span className="pill">本月</span>
          </div>

          <div className="spending-rank-list">
            {spendingBars.map((item, index) => (
              <div key={item.name} className="spending-rank-row">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.amount}</span>
                </div>
                <div className="rank-bar-track">
                  <span
                    className="rank-bar-fill"
                    style={{
                      width: `${Math.max(item.share, 5)}%`,
                      backgroundColor: chartColors[index % chartColors.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel calendar-panel">
        <div className="calendar-header">
          <div className="calendar-title-stack">
            <div className="calendar-view-switch" aria-label="切换日历视图">
              <button
                className={calendarView === "month" ? "is-active" : ""}
                type="button"
                onClick={() => setCalendarView("month")}
              >
                月视图
              </button>
              <button
                className={calendarView === "year" ? "is-active" : ""}
                type="button"
                onClick={() => setCalendarView("year")}
              >
                年视图
              </button>
            </div>
            <div>
              <p className="eyebrow">日历热力图</p>
              <h3>
                {calendarView === "month"
                  ? "本月每天花了多少钱"
                  : `${selectedMonth.slice(0, 4)} 年每月花了多少钱`}
              </h3>
            </div>
          </div>
          <span className="pill">颜色越深支出越高</span>
        </div>

        {calendarView === "month" ? (
          <>
            <div className="calendar-weekdays">
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-heatmap">
              {dailyHeatmap.map((day) => (
                <div
                  key={day.key}
                  className={`calendar-day${day.isEmpty ? " is-empty" : ""}`}
                  style={{
                    backgroundColor: day.isEmpty
                      ? "transparent"
                      : `rgba(180, 84, 69, ${day.intensity})`,
                  }}
                  title={
                    day.isEmpty
                      ? undefined
                      : `${day.label}：${formatCurrencyPlain(day.expense)}`
                  }
                >
                  {day.isEmpty ? null : (
                    <>
                      <span>{day.day}</span>
                      <strong>
                        {day.expense > 0 ? formatCurrencyPlain(day.expense) : ""}
                      </strong>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="year-heatmap">
            {yearlyHeatmap.map((month) => (
              <div
                key={month.key}
                className="year-month-card"
                style={{
                  backgroundColor: `rgba(180, 84, 69, ${month.intensity})`,
                }}
                title={`${month.label}：${formatCurrencyPlain(month.expense)}`}
              >
                <span>{month.label}</span>
                <strong>{formatCurrencyPlain(month.expense)}</strong>
                <small>{month.count} 笔支出</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="table-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">明细依据</p>
            <h3>
              {selectedCategory ? `${selectedCategory}交易` : "最近交易"}
            </h3>
          </div>
          <span className="pill">{visibleTransactions.length} 条</span>
        </div>

        <div className="data-table">
          <div className="table-row table-head">
            <span>日期</span>
            <span>商户</span>
            <span>分类</span>
            <span>账户</span>
            <span>类型</span>
            <span>金额</span>
          </div>

          {visibleTransactions.slice(0, 8).map((item) => (
            <div key={item.id} className="table-row">
              <span>{formatDateZh(item.date)}</span>
              <span>{item.merchant}</span>
              <span>{item.category}</span>
              <span>{item.account}</span>
              <span>{transactionKindLabel(item.kind)}</span>
              <span
                className={item.amount > 0 ? "amount-positive" : "amount-negative"}
              >
                {formatCurrency(item.amount)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildYearHeatmap(
  transactions: Array<{
    date: string;
    amount: number;
    excludedFromAnalytics?: boolean;
  }>,
  selectedMonth: string,
) {
  const year = selectedMonth.slice(0, 4);
  const monthlyExpense = transactions
    .filter(
      (transaction) =>
        transaction.date.startsWith(year) &&
        transaction.amount < 0 &&
        !transaction.excludedFromAnalytics,
    )
    .reduce<Record<string, { count: number; expense: number }>>((result, transaction) => {
      const month = transaction.date.slice(0, 7);
      const current = result[month] ?? { count: 0, expense: 0 };

      result[month] = {
        count: current.count + 1,
        expense: current.expense + Math.abs(transaction.amount),
      };

      return result;
    }, {});
  const maxExpense = Math.max(
    1,
    ...Object.values(monthlyExpense).map((item) => item.expense),
  );

  return Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;
    const key = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const summary = monthlyExpense[key] ?? { count: 0, expense: 0 };

    return {
      key,
      label: `${monthNumber} 月`,
      count: summary.count,
      expense: summary.expense,
      intensity:
        summary.expense > 0 ? 0.12 + (summary.expense / maxExpense) * 0.68 : 0.04,
    };
  });
}

function buildDailyHeatmap(transactions: Array<{ date: string; amount: number; excludedFromAnalytics?: boolean }>, selectedMonth: string) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const dailyExpense = transactions
    .filter((transaction) => transaction.amount < 0 && !transaction.excludedFromAnalytics)
    .reduce<Record<string, number>>((result, transaction) => {
      result[transaction.date] =
        (result[transaction.date] ?? 0) + Math.abs(transaction.amount);
      return result;
    }, {});
  const maxExpense = Math.max(1, ...Object.values(dailyExpense));
  const emptyDays = Array.from({ length: firstWeekday }, (_, index) => ({
    key: `empty-${index}`,
    isEmpty: true,
    day: 0,
    expense: 0,
    intensity: 0,
    label: "",
  }));
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
    const expense = dailyExpense[date] ?? 0;

    return {
      key: date,
      isEmpty: false,
      day,
      expense,
      intensity: expense > 0 ? 0.16 + (expense / maxExpense) * 0.72 : 0.06,
      label: `${month}月${day}日`,
    };
  });

  const filledDays = [...emptyDays, ...days];
  const trailingEmptyDays = Array.from(
    { length: (7 - (filledDays.length % 7)) % 7 },
    (_, index) => ({
      key: `trailing-empty-${index}`,
      isEmpty: true,
      day: 0,
      expense: 0,
      intensity: 0,
      label: "",
    }),
  );

  return [...filledDays, ...trailingEmptyDays];
}
