import { type FormEvent, useState } from "react";
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
import { useAuth } from "../store/AuthStore";

const navItems = [
  { to: "/overview", label: "总览" },
  { to: "/transactions", label: "交易" },
  { to: "/imports", label: "导入" },
  { to: "/ai", label: "AI" },
  { to: "/settings", label: "设置" },
];

export function AppShell() {
  const { selectedMonth, setSelectedMonth, transactions } = useFinance();
  const { currentUser, logout } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
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
            <div className="topbar-account-pill">
              {currentUser ? (
                <>
                  <button type="button" onClick={() => setIsAuthOpen(true)}>
                    <span>本地账号</span>
                    <strong>{currentUser.email}</strong>
                  </button>
                  <button type="button" onClick={logout}>
                    退出
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setIsAuthOpen(true)}>
                  <span>访客模式</span>
                  <strong>登录 / 注册</strong>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
      {isAuthOpen ? <AuthDialog onClose={() => setIsAuthOpen(false)} /> : null}
    </div>
  );
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const { login, register, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("success");

  function setError(text: string) {
    setMessage(text);
    setMessageType("error");
  }

  function setSuccess(text: string) {
    setMessage(text);
    setMessageType("success");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    try {
      if (mode === "login") {
        login(email, password);
        onClose();
        return;
      }

      if (mode === "register") {
        if (password !== confirmPassword) {
          setError("两次输入的密码不一致。");
          return;
        }

        register(email, password);
        onClose();
        return;
      }

      requestPasswordReset(email);
      setSuccess("后续接邮箱服务后，会向这个邮箱发送重置密码链接。");
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败，请稍后再试。");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        aria-labelledby="auth-dialog-title"
        aria-modal="true"
        className="record-dialog auth-dialog"
        role="dialog"
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">账号</p>
            <h3 id="auth-dialog-title">
              {mode === "login"
                ? "登录本地账本"
                : mode === "register"
                  ? "注册本地账号"
                  : "找回密码"}
            </h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="auth-mode-tabs" aria-label="切换账号操作">
          <button
            className={mode === "login" ? "is-active" : ""}
            type="button"
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            className={mode === "register" ? "is-active" : ""}
            type="button"
            onClick={() => setMode("register")}
          >
            注册
          </button>
          <button
            className={mode === "reset" ? "is-active" : ""}
            type="button"
            onClick={() => setMode("reset")}
          >
            忘记密码
          </button>
        </div>

        <form className="record-form" onSubmit={handleSubmit}>
          <label className="select-field">
            <span>邮箱</span>
            <input
              autoComplete="email"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          {mode !== "reset" ? (
            <label className="select-field">
              <span>密码</span>
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="至少 6 位"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          ) : null}

          {mode === "register" ? (
            <label className="select-field">
              <span>确认密码</span>
              <input
                autoComplete="new-password"
                placeholder="再输入一次密码"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          ) : null}

          <p className="auth-hint">
            这是本地模拟登录：账号和账本都保存在当前浏览器。后续接 Supabase 后，可以升级为真实邮箱验证和云端同步。
          </p>

          {message ? (
            <p className={messageType === "error" ? "form-error" : "form-success"}>
              {message}
            </p>
          ) : null}

          <div className="panel-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>
              取消
            </button>
            <button className="button button-primary" type="submit">
              {mode === "login"
                ? "登录"
                : mode === "register"
                  ? "创建账号"
                  : "发送重置邮件"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
