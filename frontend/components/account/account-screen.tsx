"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  accountApi,
  AccountApiError,
  type SessionMetadata,
} from "@/services/account-api";

import { AccountNavigation } from "./account-navigation";

function message(error: unknown): string {
  return error instanceof AccountApiError
    ? error.message
    : "The request could not be completed. Try again.";
}

function AuthForm({ mode }: Readonly<{ mode: "login" | "register" }>) {
  const { login, register } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const isRegister = mode === "register";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const email = String(data.get("email"));
      const password = String(data.get("password"));
      if (isRegister) {
        await register(
          email,
          password,
          Boolean(data.get("acceptedTerms")),
        );
      } else {
        await login(email, password);
      }
    } catch (caught) {
      setError(message(caught));
      requestAnimationFrame(() => emailRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-card border border-border bg-surface p-card">
      <h2 className="font-display text-section-title font-heading text-text-primary">
        {isRegister ? "Create an account" : "Sign in"}
      </h2>
      <p className="mt-2 text-supporting text-text-muted">
        {isRegister
          ? "Use a passphrase of 12–128 characters. Email verification and password recovery are not available in this portfolio implementation."
          : "Sign in to open your private projects and account information."}
      </p>
      <label className="mt-4 block text-label font-control text-text-primary" htmlFor={`${mode}-email`}>Email</label>
      <input ref={emailRef} id={`${mode}-email`} name="email" type="email" autoComplete="email" required maxLength={254} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-control-x" />
      <label className="mt-4 block text-label font-control text-text-primary" htmlFor={`${mode}-password`}>Passphrase</label>
      <input id={`${mode}-password`} name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={12} maxLength={128} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-control-x" />
      {isRegister ? (
        <label className="mt-4 flex items-start gap-2 text-supporting">
          <input
            className="mt-1 size-5 shrink-0"
            type="checkbox"
            name="acceptedTerms"
            required
          />
          <span>
            I acknowledge account terms version 1 and understand this is a
            portfolio demonstration without commercial availability. Optional
            analytics consent remains separate.
          </span>
        </label>
      ) : null}
      {error ? <ErrorMessage className="mt-3">{error}</ErrorMessage> : null}
      <Button className="mt-4" type="submit" isLoading={pending} loadingLabel={isRegister ? "Creating account…" : "Signing in…"}>
        {isRegister ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}

function downloadExport(value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sewncovers-account-export.json";
  link.click();
  URL.revokeObjectURL(url);
}

function AuthenticatedAccount() {
  const { state, logout, logoutAll, clear } = useAuth();
  const [sessions, setSessions] = useState<readonly SessionMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const token = state.status === "authenticated" ? state.token : null;
  const account = state.status === "authenticated" ? state.account : null;

  const loadSessions = async () => {
    if (!token) return;
    setError(null);
    try {
      setSessions(await accountApi.sessions(token));
    } catch (caught) {
      setError(message(caught));
    }
  };

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void loadSessions(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token || !account) return null;

  const exportData = async () => {
    setPending(true);
    setError(null);
    try { downloadExport(await accountApi.export(token)); }
    catch (caught) { setError(message(caught)); }
    finally { setPending(false); }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = new FormData(event.currentTarget);
      await accountApi.deleteAccount(token, String(data.get("password")));
      clear();
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#login-email")?.focus());
    } catch (caught) {
      setError(message(caught));
      requestAnimationFrame(() => passwordRef.current?.focus());
    } finally { setPending(false); }
  };

  return (
    <div className="space-y-layout">
      <AccountNavigation currentHref="/account/" />
      <section className="rounded-panel border border-border bg-surface p-card shadow-card">
        <p className="text-label font-control text-accent-strong">Signed in</p>
        <h2 className="mt-2 break-all font-display text-section-title font-heading">{account.email}</h2>
        <p className="mt-3 text-supporting text-text-muted">You are signed in for this browser tab. Closing the tab ends the locally stored sign-in.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/projects/" className="inline-flex min-h-12 items-center rounded-control bg-brand px-control-x py-control-y text-button font-control text-on-brand no-underline">Open My projects</Link>
          <Button variant="secondary" onClick={() => void logout()}>Sign out</Button>
          <Button variant="secondary" onClick={() => void logoutAll()}>Sign out everywhere</Button>
        </div>
      </section>

      <section className="rounded-panel border border-border bg-surface p-card">
        <h2 className="font-display text-section-title font-heading">Active sessions</h2>
        {sessions === null ? <LoadingState className="mt-3" label="Loading sessions…" /> : (
          <ul className="mt-3 space-y-3">
            {sessions.map((session) => (
              <li key={session.id} className="rounded-card border border-border p-3">
                <p className="text-body text-text-primary">{session.current ? "Current session" : "Session"} — {session.revokedAt ? "Revoked" : new Date(session.expiresAt) <= new Date() ? "Expired" : "Active"}</p>
                <p className="text-supporting text-text-muted">Created {new Date(session.createdAt).toLocaleString()} · Expires {new Date(session.expiresAt).toLocaleString()}</p>
                {!session.revokedAt ? <Button className="mt-2" variant="secondary" onClick={async () => { try { await accountApi.revokeSession(token, session.id); if (session.current) clear(); else await loadSessions(); } catch (caught) { setError(message(caught)); } }}>Revoke this session</Button> : null}
              </li>
            ))}
          </ul>
        )}
        {error ? <ErrorMessage className="mt-3">{error}</ErrorMessage> : null}
        {sessions === null || error ? <Button className="mt-3" variant="secondary" onClick={() => void loadSessions()}>Retry sessions</Button> : null}
      </section>

      <section className="rounded-panel border border-border bg-surface p-card">
        <h2 className="font-display text-section-title font-heading">Your data</h2>
        <p className="mt-2 text-body text-text-muted">Export downloads a JSON file containing your account information, projects, and saved versions. It does not include your password or sign-in credentials.</p>
        <Button className="mt-3" variant="secondary" disabled={pending} onClick={() => void exportData()}>Export my data</Button>
      </section>

      <section className="rounded-panel border-2 border-accent-strong bg-surface p-card">
        <h2 className="font-display text-section-title font-heading">Delete account</h2>
        <p className="mt-2 text-body text-text-primary">This permanently deletes this account, every signed-in session, private project, saved project version, and project share link. Public designs created without an account are unaffected.</p>
        {!confirmDelete ? (
          <Button ref={deleteButtonRef} className="mt-3" variant="secondary" onClick={() => { setConfirmDelete(true); requestAnimationFrame(() => passwordRef.current?.focus()); }}>Review account deletion</Button>
        ) : (
          <form className="mt-4" onSubmit={(event) => void deleteAccount(event)}>
            <label htmlFor="delete-password" className="block text-label font-control">Re-enter your passphrase to confirm</label>
            <input ref={passwordRef} id="delete-password" name="password" type="password" autoComplete="current-password" required minLength={12} maxLength={128} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-control-x" />
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="submit" isLoading={pending} loadingLabel="Deleting account…">Permanently delete account</Button>
              <Button type="button" variant="secondary" onClick={() => { setConfirmDelete(false); requestAnimationFrame(() => deleteButtonRef.current?.focus()); }}>Cancel</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export function AccountScreen() {
  const { state } = useAuth();
  if (state.status === "initializing") return <LoadingState label="Restoring your session…" />;
  if (state.status === "authenticated") return <AuthenticatedAccount />;
  return (
    <div className="grid gap-layout lg:grid-cols-2">
      <AuthForm mode="login" />
      <AuthForm mode="register" />
    </div>
  );
}
