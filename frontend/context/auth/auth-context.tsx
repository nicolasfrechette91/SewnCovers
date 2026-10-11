"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  ACKNOWLEDGEMENT_FAILED_CODE,
  AccountApiError,
  accountApi,
  type Account,
  readSessionToken,
  removeSessionToken,
  storeSessionToken,
  subscribeToSessionToken,
} from "@/services/account-api";
import { assuranceApi } from "@/services/assurance-api";
import { clearAccountLinkedBrowserData } from "@/services/configurator-draft";
import { useResource } from "@/services/use-resource";

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

interface Session {
  readonly account: Account;
  readonly token: string;
  readonly expiresAt: string;
}

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

// The prerendered page and the first render after hydration cannot see this
// tab's storage, so the session is "initializing" until the browser answers.
const unknownToken = (): undefined => undefined;

// A token stored by an earlier page is checked with the API before it counts.
// Anything but a current, unexpired session (an expired or revoked session,
// a 401, an API that is asleep or unreachable) ends it: the token is removed,
// and that removal shows the session-ended notice. A check that was only
// cancelled (unmount, or React's development double mount) removes nothing.
async function verifyStoredSession(
  token: string,
  signal: AbortSignal,
): Promise<Session> {
  try {
    const [account, sessions] = await Promise.all([
      accountApi.current(token, { signal }),
      accountApi.sessions(token, { signal }),
    ]);
    const current = sessions.find(
      (session) => session.current && !session.revokedAt,
    );
    if (!current || new Date(current.expiresAt) <= new Date())
      throw new Error("expired session");
    return { account, token, expiresAt: current.expiresAt };
  } catch (error) {
    if (!signal.aborted) removeSessionToken();
    throw error;
  }
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  // This tab's stored token (session storage is per tab, so each tab keeps
  // its own session); undefined until the browser can answer.
  const storedToken = useSyncExternalStore(
    subscribeToSessionToken,
    readSessionToken,
    unknownToken,
  );
  // The session a sign-in in this tab started; it needs no check.
  const [signedIn, setSignedIn] = useState<Session | null>(null);
  // The stored token went away without an explicit sign-out: a 401 from any
  // client, a failed check, or expiry. Signing in or out clears it.
  const [ended, setEnded] = useState(false);
  const restored = useResource(
    typeof storedToken === "string" && signedIn?.token !== storedToken
      ? storedToken
      : null,
    verifyStoredSession,
  );

  useEffect(
    () =>
      subscribeToSessionToken(() => {
        if (!readSessionToken()) setEnded(true);
      }),
    [],
  );

  const state = useMemo<AuthState>(() => {
    if (storedToken === undefined) return { status: "initializing" };
    if (storedToken === null)
      return ended
        ? { status: "guest", notice: SESSION_ENDED_NOTICE }
        : { status: "guest" };
    const session =
      signedIn?.token === storedToken
        ? signedIn
        : restored.data?.token === storedToken
          ? restored.data
          : null;
    return session
      ? { status: "authenticated", ...session }
      : { status: "initializing" };
  }, [ended, restored.data, signedIn, storedToken]);

  // Ends the session when it expires. Delays are capped at the browser's
  // maximum, so a long session is checked again rather than ended early.
  const expiresAt = state.status === "authenticated" ? state.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) return;
    let timer: ReturnType<typeof globalThis.setTimeout>;
    const schedule = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      timer = globalThis.setTimeout(
        remaining <= 0 ? removeSessionToken : schedule,
        Math.min(Math.max(remaining, 0), MAX_BROWSER_TIMEOUT_MS),
      );
    };
    schedule();
    return () => globalThis.clearTimeout(timer);
  }, [expiresAt]);

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
      setSignedIn({
        account: response.account,
        token: response.token,
        expiresAt: response.expiresAt,
      });
      setEnded(false);
    },
    [],
  );

  // Explicit sign-out (and account deletion or revoking this session): also
  // remove account-linked drafts and pending actions from this browser.
  const clear = useCallback(() => {
    removeSessionToken();
    clearAccountLinkedBrowserData();
    setSignedIn(null);
    setEnded(false);
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
