import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  formatMonthLabel,
  getAvailableMonths,
  useFinance,
} from "../store/FinanceStore";

const navItems = [
  { to: "/overview", label: "总览" },
  { to: "/transactions", label: "交易" },
  { to: "/imports", label: "导入" },
  { to: "/ai", label: "AI" },
  { to: "/settings", label: "设置" },
];

export function AppShell() {
  const { selectedMonth, setSelectedMonth, transactions } = useFinance();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const months = getAvailableMonths(transactions, selectedMonth);
  const topbarSearch =
    location.pathname === "/transactions" ? searchParams.get("q") ?? "" : "";

  function handleTopbarSearchChange(value: string) {
    const params = new URLSearchParams(
      location.pathname === "/transactions" ? searchParams : undefined,
    );

    if (value.trim()) {
      params.set("q", value);
    } else {
      params.delete("q");
    }

    navigate({
      pathname: "/transactions",
      search: params.toString() ? `?${params.toString()}` : "",
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">FD</div>
          <div>
            <p className="eyebrow">个人财务</p>
            <h1>财务工作台</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                `nav-item${isActive ? " is-active" : ""}`
              }
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <p className="eyebrow">导入就绪</p>
          <strong>{formatMonthLabel(selectedMonth)}账单</strong>
          <span>导入确认后，数据会自动同步到总览和交易页。</span>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">月份视角</p>
            <label className="month-select-label">
              <span className="sr-only">选择月份</span>
              <select
                className="month-switcher"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="topbar-actions">
            <label className="search-field">
              <span className="sr-only">搜索</span>
              <input
                value={topbarSearch}
                placeholder="搜索商户、备注、分类"
                onChange={(event) => handleTopbarSearchChange(event.target.value)}
              />
            </label>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
