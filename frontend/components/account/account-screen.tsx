"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  accountApi,
  AccountApiError,
  type SessionMetadata,
} from "@/services/account-api";
import {
  buildAccountHref,
  parseAuthenticationMode,
  parseAuthenticationReturnTarget,
  resolveAuthenticationReturnDestination,
  type AuthenticationMode,
} from "@/services/auth-navigation";

import { AccountNavigation } from "./account-navigation";

function message(error: unknown): string {
  return error instanceof AccountApiError
    ? error.message
    : "The request could not be completed. Try again.";
}

interface AuthFieldErrors {
  readonly acceptedTerms?: string;
  readonly email?: string;
  readonly password?: string;
}

const RETURN_LABELS = {
  cart: "your demonstration cart",
  configure: "the configurator",
  orders: "your demonstration orders",
  pricing: "demonstration pricing and quotes",
  projects: "your private projects",
} as const;

function validateAuthForm(
  form: HTMLFormElement,
  isRegister: boolean,
): AuthFieldErrors {
  const data = new FormData(form);
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  const errors: {
    acceptedTerms?: string;
    email?: string;
    password?: string;
  } = {};

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Enter your passphrase.";
  } else if (password.length < 12 || password.length > 128) {
    errors.password = "Passphrase must be 12–128 characters.";
  }

  if (isRegister && !data.get("acceptedTerms")) {
    errors.acceptedTerms = "Acknowledge the account terms to create an account.";
  }

  return errors;
}

function AuthForm({
  focusHeading,
  mode,
  onSuccess,
}: Readonly<{
  focusHeading: boolean;
  mode: AuthenticationMode;
  onSuccess: () => void;
}>) {
  const { login, register } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const pendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const isRegister = mode === "register";

  useEffect(() => {
    if (!focusHeading) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusHeading]);

  const clearFieldError = (field: keyof AuthFieldErrors) => {
    setFieldErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current,
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const form = event.currentTarget;
    const validationErrors = validateAuthForm(form, isRegister);
    setFieldErrors(validationErrors);
    setError(null);
    const firstInvalid = validationErrors.email
      ? emailRef.current
      : validationErrors.password
        ? passwordRef.current
        : validationErrors.acceptedTerms
          ? termsRef.current
          : null;
    if (firstInvalid) {
      requestAnimationFrame(() => firstInvalid.focus());
      return;
    }

    const data = new FormData(form);
    pendingRef.current = true;
    setPending(true);
    try {
      const email = String(data.get("email")).trim();
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
      form.reset();
      onSuccess();
    } catch (caught) {
      setError(message(caught));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const emailErrorId = `${mode}-email-error`;
  const passwordHelpId = `${mode}-password-help`;
  const passwordErrorId = `${mode}-password-error`;
  const termsErrorId = `${mode}-terms-error`;

  return (
    <form
      ref={formRef}
      noValidate
      aria-busy={pending}
      onSubmit={(event) => void submit(event)}
      className="min-w-0 rounded-card border border-border bg-surface p-card shadow-card"
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-section-title font-heading text-text-primary"
      >
        {isRegister ? "Create account" : "Sign in"}
      </h2>
      <p className="mt-2 text-supporting text-text-muted">
        {isRegister
          ? "Create a private workspace for projects, version history, custom patterns, and demonstration commerce records."
          : "Use the email and passphrase for your existing SewnCovers account."}
      </p>
      <label
        className="mt-4 block text-label font-control text-text-primary"
        htmlFor={`${mode}-email`}
      >
        Email
      </label>
      <input
        ref={emailRef}
        id={`${mode}-email`}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        aria-invalid={fieldErrors.email ? true : undefined}
        aria-describedby={fieldErrors.email ? emailErrorId : undefined}
        onChange={() => clearFieldError("email")}
        className="mt-2 min-h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface px-control-x aria-invalid:border-error-border aria-invalid:bg-error-surface"
      />
      {fieldErrors.email ? (
        <p id={emailErrorId} className="mt-2 text-supporting text-error-text">
          {fieldErrors.email}
        </p>
      ) : null}
      <label
        className="mt-4 block text-label font-control text-text-primary"
        htmlFor={`${mode}-password`}
      >
        Passphrase
      </label>
      <input
        ref={passwordRef}
        id={`${mode}-password`}
        name="password"
        type="password"
        autoComplete={isRegister ? "new-password" : "current-password"}
        required
        minLength={12}
        maxLength={128}
        aria-invalid={fieldErrors.password ? true : undefined}
        aria-describedby={`${passwordHelpId}${fieldErrors.password ? ` ${passwordErrorId}` : ""}`}
        onChange={() => clearFieldError("password")}
        className="mt-2 min-h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface px-control-x aria-invalid:border-error-border aria-invalid:bg-error-surface"
      />
      <p id={passwordHelpId} className="mt-2 text-supporting text-text-muted">
        {isRegister
          ? "Use 12–128 characters. There is no composition rule."
          : "Password recovery is unavailable in this portfolio prototype."}
      </p>
      {fieldErrors.password ? (
        <p id={passwordErrorId} className="mt-2 text-supporting text-error-text">
          {fieldErrors.password}
        </p>
      ) : null}
      {isRegister ? (
        <div className="mt-4">
          <label className="flex items-start gap-2 text-supporting">
          <input
            ref={termsRef}
            className="mt-1 size-5 shrink-0"
            type="checkbox"
            name="acceptedTerms"
            required
            aria-invalid={fieldErrors.acceptedTerms ? true : undefined}
            aria-describedby={fieldErrors.acceptedTerms ? termsErrorId : undefined}
            onChange={() => clearFieldError("acceptedTerms")}
          />
          <span>
            I acknowledge account terms version 1 and understand this is a
            portfolio demonstration without commercial availability.
          </span>
          </label>
          {fieldErrors.acceptedTerms ? (
            <p id={termsErrorId} className="mt-2 text-supporting text-error-text">
              {fieldErrors.acceptedTerms}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div ref={errorRef} tabIndex={-1} className="mt-3 rounded-control">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      ) : null}
      <Button
        className="mt-4 w-full sm:w-auto"
        type="submit"
        isLoading={pending}
        loadingLabel={isRegister ? "Creating account…" : "Signing in…"}
      >
        {isRegister ? "Create account" : "Sign in"}
      </Button>
      {isRegister ? (
        <p className="mt-4 text-supporting text-text-muted">
          Email verification and password recovery are unavailable in this
          portfolio prototype.
        </p>
      ) : null}
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
  const searchParameters = useSearchParams() ?? new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const mode = parseAuthenticationMode(searchParameters.get("mode"));
  const returnTo = parseAuthenticationReturnTarget(
    searchParameters.get("returnTo"),
  );
  if (state.status === "initializing") return <LoadingState label="Restoring your session…" />;
  if (state.status === "authenticated") return <AuthenticatedAccount />;

  const onSuccess = () => {
    const destination = resolveAuthenticationReturnDestination(returnTo);
    if (destination) window.location.assign(destination);
  };

  return (
    <div className="min-w-0 space-y-component">
      {state.notice ? (
        <ErrorMessage role="status" aria-live="polite">
          {state.notice}
        </ErrorMessage>
      ) : null}
      {returnTo ? (
        <p className="rounded-card border border-border bg-surface-subtle p-3 text-supporting text-text-muted">
          After successful authentication, you will return to {RETURN_LABELS[returnTo]}.
        </p>
      ) : null}
      <nav aria-label="Authentication options" className="rounded-card border border-border bg-surface p-2">
        <ul className="grid grid-cols-2 gap-2">
          {(["login", "register"] as const).map((item) => {
            const active = mode === item;
            return (
              <li key={item} className="min-w-0">
                <Link
                  href={buildAccountHref(item, returnTo)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 w-full items-center justify-center rounded-control px-3 py-2 text-center text-button font-control break-words no-underline ${active ? "bg-brand text-on-brand" : "bg-surface-subtle text-text-primary hover:text-brand"}`}
                >
                  {item === "login" ? "Sign in" : "Create account"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <AuthForm
        key={mode}
        focusHeading={searchParameters.has("mode")}
        mode={mode}
        onSuccess={onSuccess}
      />
    </div>
  );
}
