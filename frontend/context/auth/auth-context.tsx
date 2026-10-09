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
  ACKNOWLEDGEMENT_FAILED_CODE,
  AccountApiError,
  accountApi,
  AUTH_CHANGED_EVENT,
  type Account,
  readSessionToken,
  removeSessionToken,
  storeSessionToken,
} from "@/services/account-api";
import { assuranceApi } from "@/services/assurance-api";
import { clearAccountLinkedBrowserData } from "@/services/configurator-draft";

export type AuthState =
  | { readonly status: "initializing" }
  | { readonly status: "guest"; readonly notice?: string }
  | {
      readonly status: "authenticated";
      readonly account: Account;
      readonly token: string;
      readonly expiresAt: string;
    };

const SESSION_ENDED_NOTICE =
  "Your previous sign-in expired or is no longer valid. Sign in again to continue.";
const MAX_BROWSER_TIMEOUT_MS = 2_147_483_647;

interface AuthContextValue {
  readonly state: AuthState;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly register: (
    email: string,
    password: string,
    acceptedTerms: boolean,
  ) => Promise<void>;
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
      const current = sessions.find(
        (session) => session.current && !session.revokedAt,
      );
      if (!current || new Date(current.expiresAt) <= new Date())
        throw new Error("expired session");
      setState({
        status: "authenticated",
        account,
        token,
        expiresAt: current.expiresAt,
      });
    } catch {
      removeSessionToken();
      setState({ status: "guest", notice: SESSION_ENDED_NOTICE });
    }
  }, []);

  useEffect(() => {
    const restoreTimer = globalThis.setTimeout(() => void restore(), 0);
    const handleChange = () => {
      if (!readSessionToken()) {
        setState({ status: "guest", notice: SESSION_ENDED_NOTICE });
      }
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleChange);
    return () => {
      globalThis.clearTimeout(restoreTimer);
      window.removeEventListener(AUTH_CHANGED_EVENT, handleChange);
    };
  }, [restore]);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    const expiresAt = state.expiresAt;
    let timer: ReturnType<typeof globalThis.setTimeout>;
    scheduleExpiryCheck();
    return () => globalThis.clearTimeout(timer);

    function scheduleExpiryCheck() {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        timer = globalThis.setTimeout(clearStoredSession, 0);
        return;
      }
      timer = globalThis.setTimeout(
        scheduleExpiryCheck,
        Math.min(remaining, MAX_BROWSER_TIMEOUT_MS),
      );
    }

    function clearStoredSession() {
      removeSessionToken();
      setState({ status: "guest", notice: SESSION_ENDED_NOTICE });
    }
  }, [state]);

  const startSession = useCallback(
    async (
      mode: "login" | "register",
      email: string,
      password: string,
      acceptedTerms = false,
    ) => {
      if (mode === "register" && !acceptedTerms) {
        throw new Error("Account terms version 1 must be acknowledged.");
      }
      const response = await accountApi[mode](email, password);
      if (mode === "register") {
        try {
          await assuranceApi.acknowledge(
            response.token,
            "terms",
            "account_terms",
          );
        } catch (caught) {
          // The account now exists, so say so instead of a bare failure.
          throw new AccountApiError(
            "The terms acknowledgement could not be saved.",
            caught instanceof AccountApiError ? caught.status : 0,
            ACKNOWLEDGEMENT_FAILED_CODE,
          );
        }
      }
      storeSessionToken(response.token);
      setState({
        status: "authenticated",
        account: response.account,
        token: response.token,
        expiresAt: response.expiresAt,
      });
    },
    [],
  );

  // Explicit sign-out (and account deletion or revoking this session): also
  // remove account-linked drafts and pending actions from this browser.
  const clear = useCallback(() => {
    removeSessionToken();
    clearAccountLinkedBrowserData();
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

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: (email, password) => startSession("login", email, password),
      register: (email, password, acceptedTerms) =>
        startSession("register", email, password, acceptedTerms),
      logout,
      logoutAll,
      clear,
    }),
    [clear, logout, logoutAll, startSession, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
