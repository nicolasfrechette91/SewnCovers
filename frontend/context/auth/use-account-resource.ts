"use client";

import type { Account } from "@/services/account-api";
import { useResource, type Resource } from "@/services/use-resource";

import { useAuth, type AuthState } from "./auth-context";

/**
 * What a screen that needs an account can show: the session is still being
 * checked, there is no session, the session lacks the role, or the request
 * may be made.
 */
export type AccountAccess = "initializing" | "guest" | "forbidden" | "granted";

export interface AccountResource<T> extends Resource<T> {
  readonly access: AccountAccess;
  readonly auth: AuthState;
  /** The session token, only when access is granted. */
  readonly token: string | null;
}

/**
 * `useResource` for data that belongs to the signed-in account. Nothing is
 * requested unless access is granted; the token is part of the key, so a
 * different session loads again. `key` adds to it (a project id, an order id)
 * and is passed to `load`; null waits without requesting. `keepPreviousData`
 * is passed to `useResource`.
 */
export function useAccountResource<T>(
  load: (token: string, signal: AbortSignal, key: string) => Promise<T>,
  options: {
    readonly key?: string | null;
    readonly role?: Account["role"];
    readonly keepPreviousData?: boolean;
  } = {},
): AccountResource<T> {
  const { state } = useAuth();
  const access: AccountAccess =
    state.status === "initializing"
      ? "initializing"
      : state.status === "guest"
        ? "guest"
        : options.role !== undefined && state.account.role !== options.role
          ? "forbidden"
          : "granted";
  const token =
    access === "granted" && state.status === "authenticated"
      ? state.token
      : null;
  const extra = options.key === undefined ? "" : options.key;
  const resource = useResource(
    token === null || extra === null ? null : `${token}\u0000${extra}`,
    (_key, signal) =>
      token === null || extra === null
        ? Promise.reject(new Error("There is no session to load with."))
        : load(token, signal, extra),
    { keepPreviousData: options.keepPreviousData },
  );
  return { ...resource, access, auth: state, token };
}
