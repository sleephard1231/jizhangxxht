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
  const {
    cloudSyncError,
    cloudSyncStatus,
    selectedMonth,
    setSelectedMonth,
    transactions,
  } = useFinance();
  const { currentUser, logout } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
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
                    <span>{getCloudStatusLabel(cloudSyncStatus, cloudSyncError)}</span>
                    <strong>{currentUser.email}</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLogoutError("");
                      logout().catch((error) =>
                        setLogoutError(
                          error instanceof Error ? error.message : "退出失败。",
                        ),
                      );
                    }}
                  >
                    退出
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setIsAuthOpen(true)}>
                  <span>{cloudSyncStatus === "local" ? "未配置云端" : "访客模式"}</span>
                  <strong>登录 / 注册</strong>
                </button>
              )}
            </div>
          </div>
        </header>
        {logoutError ? <p className="topbar-error">{logoutError}</p> : null}

        <main className="page-content">
          <Outlet />
        </main>
      </div>
      {isAuthOpen ? <AuthDialog onClose={() => setIsAuthOpen(false)} /> : null}
    </div>
  );
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const { isSupabaseConfigured, login, register, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setError(text: string) {
    setMessage(text);
    setMessageType("error");
  }

  function setSuccess(text: string) {
    setMessage(text);
    setMessageType("success");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
        onClose();
        return;
      }

      if (mode === "register") {
        if (password !== confirmPassword) {
          setError("两次输入的密码不一致。");
          return;
        }

        const result = await register(email, password);

        if (result === "needsEmailConfirmation") {
          setSuccess("注册成功，请打开邮箱里的确认链接，确认后再回来登录。");
          return;
        }

        onClose();
        return;
      }

      await requestPasswordReset(email);
      setSuccess("重置密码邮件已发送，请去邮箱里打开链接继续操作。");
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
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
                ? "登录云端账本"
                : mode === "register"
                  ? "注册云端账号"
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
            {isSupabaseConfigured
              ? "现在使用 Supabase Auth 登录。登录后，交易、分类规则和导入历史会按账号同步到云端。"
              : "还没有配置 Supabase。请先复制 .env.example 为 .env.local，并填写项目 URL 和 anon key。"}
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
            <button
              className="button button-primary"
              disabled={isSubmitting}
              type="submit"
            >
              {mode === "login"
                ? isSubmitting
                  ? "登录中..."
                  : "登录"
                : mode === "register"
                  ? isSubmitting
                    ? "创建中..."
                    : "创建账号"
                  : isSubmitting
                    ? "发送中..."
                    : "发送重置邮件"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getCloudStatusLabel(status: string, error: string) {
  if (status === "loading") {
    return "云端读取中";
  }

  if (status === "syncing") {
    return "云端同步中";
  }

  if (status === "synced") {
    return "云端已同步";
  }

  if (status === "error") {
    return error ? "同步异常" : "云端异常";
  }

  return "云端账号";
}
