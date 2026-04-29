import type { User } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  isSupabaseConfigured,
  requireSupabase,
  supabase,
} from "../lib/supabase";

export type AppUser = {
  id: string;
  email: string;
  createdAt?: string;
};

type RegisterResult = "signedIn" | "needsEmailConfirmation";

type AuthContextValue = {
  currentUser: AppUser | null;
  isAuthReady: boolean;
  isSupabaseConfigured: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string) => Promise<RegisterResult>;
  requestPasswordReset: (email: string) => Promise<void>;
  userStorageKey: string;
};

const GUEST_STORAGE_KEY = "personal-finance-web-state-v3";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured);
  const userStorageKey = currentUser
    ? `${GUEST_STORAGE_KEY}:supabase:${currentUser.id}`
    : GUEST_STORAGE_KEY;

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("读取 Supabase 登录状态失败：", error);
      }

      setCurrentUser(toAppUser(data.session?.user ?? null));
      setIsAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(toAppUser(session?.user ?? null));
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function register(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);

    validateCredentials(normalizedEmail, password);

    const { data, error } = await requireSupabase().auth.signUp({
      email: normalizedEmail,
      password,
    });

    if (error) {
      throw new Error(toChineseAuthError(error.message));
    }

    setCurrentUser(toAppUser(data.session?.user ?? null));

    return data.session ? "signedIn" : "needsEmailConfirmation";
  }

  async function login(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);

    validateCredentials(normalizedEmail, password);

    const { data, error } = await requireSupabase().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      throw new Error(toChineseAuthError(error.message));
    }

    setCurrentUser(toAppUser(data.user));
  }

  async function logout() {
    const { error } = await requireSupabase().auth.signOut();

    if (error) {
      throw new Error(toChineseAuthError(error.message));
    }

    setCurrentUser(null);
  }

  async function requestPasswordReset(email: string) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      throw new Error("请先填写邮箱。");
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      throw new Error("请输入有效邮箱。");
    }

    const { error } = await requireSupabase().auth.resetPasswordForEmail(
      normalizedEmail,
    );

    if (error) {
      throw new Error(toChineseAuthError(error.message));
    }
  }

  const value = useMemo(
    () => ({
      currentUser,
      isAuthReady,
      isSupabaseConfigured,
      login,
      logout,
      register,
      requestPasswordReset,
      userStorageKey,
    }),
    [currentUser, isAuthReady, userStorageKey],
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

function toAppUser(user: User | null): AppUser | null {
  if (!user?.email) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateCredentials(email: string, password: string) {
  if (!isSupabaseConfigured) {
    throw new Error(
      "还没有配置 Supabase。请先复制 .env.example 为 .env.local，然后填写项目 URL 和 anon key。",
    );
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("请输入有效邮箱。");
  }

  if (password.length < 6) {
    throw new Error("密码至少需要 6 位。");
  }
}

function toChineseAuthError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "邮箱或密码不正确。";
  }

  if (lower.includes("email not confirmed")) {
    return "这个邮箱还没有完成验证，请先打开邮件里的确认链接。";
  }

  if (lower.includes("user already registered")) {
    return "这个邮箱已经注册过，请直接登录。";
  }

  if (lower.includes("password")) {
    return "密码不符合要求，请至少使用 6 位字符。";
  }

  return message || "账号操作失败，请稍后再试。";
}
