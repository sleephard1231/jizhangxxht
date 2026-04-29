import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

type LocalUser = {
  email: string;
  password: string;
  createdAt: string;
};

type AuthContextValue = {
  currentUser: LocalUser | null;
  login: (email: string, password: string) => void;
  logout: () => void;
  register: (email: string, password: string) => void;
  requestPasswordReset: (email: string) => void;
  userStorageKey: string;
};

const AUTH_USERS_KEY = "personal-finance-auth-users-v1";
const AUTH_SESSION_KEY = "personal-finance-auth-session-v1";
const GUEST_STORAGE_KEY = "personal-finance-web-state-v3";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<LocalUser[]>(loadUsers);
  const [currentEmail, setCurrentEmail] = useState(loadSessionEmail);
  const currentUser = users.find((user) => user.email === currentEmail) ?? null;
  const userStorageKey = currentUser
    ? `${GUEST_STORAGE_KEY}:user:${encodeURIComponent(currentUser.email)}`
    : GUEST_STORAGE_KEY;

  function persistUsers(nextUsers: LocalUser[]) {
    setUsers(nextUsers);
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(nextUsers));
  }

  function persistSession(email: string) {
    setCurrentEmail(email);
    localStorage.setItem(AUTH_SESSION_KEY, email);
  }

  function register(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);

    validateCredentials(normalizedEmail, password);

    if (users.some((user) => user.email === normalizedEmail)) {
      throw new Error("这个邮箱已经注册过，请直接登录。");
    }

    const nextUser = {
      email: normalizedEmail,
      password,
      createdAt: new Date().toISOString(),
    };

    persistUsers([...users, nextUser]);
    persistSession(normalizedEmail);
  }

  function login(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);

    validateCredentials(normalizedEmail, password);

    const matchedUser = users.find((user) => user.email === normalizedEmail);

    if (!matchedUser || matchedUser.password !== password) {
      throw new Error("邮箱或密码不正确。");
    }

    persistSession(normalizedEmail);
  }

  function logout() {
    setCurrentEmail("");
    localStorage.removeItem(AUTH_SESSION_KEY);
  }

  function requestPasswordReset(email: string) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      throw new Error("请先填写邮箱。");
    }

    if (!users.some((user) => user.email === normalizedEmail)) {
      throw new Error("本地没有找到这个邮箱。");
    }
  }

  const value = useMemo(
    () => ({
      currentUser,
      login,
      logout,
      register,
      requestPasswordReset,
      userStorageKey,
    }),
    [currentUser, userStorageKey, users],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}

function loadUsers(): LocalUser[] {
  try {
    const saved = localStorage.getItem(AUTH_USERS_KEY);

    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function loadSessionEmail() {
  return localStorage.getItem(AUTH_SESSION_KEY) ?? "";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateCredentials(email: string, password: string) {
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("请输入有效邮箱。");
  }

  if (password.length < 6) {
    throw new Error("密码至少需要 6 位。");
  }
}
