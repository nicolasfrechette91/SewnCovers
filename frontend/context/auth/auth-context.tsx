"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  accountApi,
  AUTH_CHANGED_EVENT,
  type Account,
  readSessionToken,
  removeSessionToken,
  storeSessionToken,
} from "@/services/account-api";

export type AuthState =
  | { readonly status: "initializing" }
  | { readonly status: "guest" }
  | { readonly status: "authenticated"; readonly account: Account; readonly token: string; readonly expiresAt: string };

interface AuthContextValue {
  readonly state: AuthState;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly register: (email: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly logoutAll: () => Promise<void>;
  readonly clear: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<AuthState>({ status: "initializing" });

  const restore = useCallback(async () => {
    const token = readSessionToken();
    if (!token) {
      setState({ status: "guest" });
      return;
    }
    try {
      const [account, sessions] = await Promise.all([
        accountApi.current(token),
        accountApi.sessions(token),
      ]);
      const current = sessions.find((session) => session.current && !session.revokedAt);
      if (!current || new Date(current.expiresAt) <= new Date()) throw new Error("expired session");
      setState({ status: "authenticated", account, token, expiresAt: current.expiresAt });
    } catch {
      removeSessionToken();
      setState({ status: "guest" });
    }
  }, []);

  useEffect(() => {
    const restoreTimer = globalThis.setTimeout(() => void restore(), 0);
    const handleChange = () => {
      if (!readSessionToken()) setState({ status: "guest" });
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleChange);
    return () => {
      globalThis.clearTimeout(restoreTimer);
      window.removeEventListener(AUTH_CHANGED_EVENT, handleChange);
    };
  }, [restore]);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    const remaining = new Date(state.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      const timer = globalThis.setTimeout(clearStoredSession, 0);
      return () => globalThis.clearTimeout(timer);
    }
    const timer = globalThis.setTimeout(clearStoredSession, remaining);
    return () => globalThis.clearTimeout(timer);

    function clearStoredSession() {
      removeSessionToken();
      setState({ status: "guest" });
    }
  }, [state]);

  const startSession = useCallback(
    async (mode: "login" | "register", email: string, password: string) => {
      const response = await accountApi[mode](email, password);
      storeSessionToken(response.token);
      setState({ status: "authenticated", account: response.account, token: response.token, expiresAt: response.expiresAt });
    },
    [],
  );

  const clear = useCallback(() => {
    removeSessionToken();
    setState({ status: "guest" });
  }, []);

  const logout = useCallback(async () => {
    if (state.status === "authenticated") {
      try {
        await accountApi.logout(state.token);
      } finally {
        clear();
      }
    }
  }, [clear, state]);

  const logoutAll = useCallback(async () => {
    if (state.status === "authenticated") {
      try {
        await accountApi.logoutAll(state.token);
      } finally {
        clear();
      }
    }
  }, [clear, state]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    login: (email, password) => startSession("login", email, password),
    register: (email, password) => startSession("register", email, password),
    logout,
    logoutAll,
    clear,
  }), [clear, logout, logoutAll, startSession, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
