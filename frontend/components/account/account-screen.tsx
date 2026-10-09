"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Button,
  ErrorMessage,
  Field,
  LoadingState,
  TextInput,
  useDeferredFocus,
  Surface,
  surfaceClasses,
} from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-styles";
import { useAuth } from "@/context/auth";
import {
  AccountApiError,
  accountApi,
  type SessionMetadata,
} from "@/services/account-api";
import {
  buildAccountHref,
  parseAuthenticationMode,
  parseAuthenticationReturnTarget,
  resolveAuthenticationReturnDestination,
  resolveAuthenticationReturnPath,
} from "@/services/auth-navigation";
import { setAuthReturnHint } from "@/services/configurator-draft";

import { AccountNavigation } from "./account-navigation";
import { AuthForm, authErrorMessage as message } from "./auth-form";

const RETURN_LABELS = {
  cart: "your demonstration cart",
  configure: "the configurator, where your design is waiting",
  home: "the home page",
  legal: "the legal information",
  orders: "your demonstration orders",
  pricing: "demonstration pricing and quotes",
  projects: "your private projects",
} as const;

function downloadExport(value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sewncovers-account-export.json";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * `onSessionEnding` is called just before the session ends by any route (sign
 * out, sign out everywhere, revoking this session, deleting the account). The
 * signed-in view disappears with the button that was pressed, so the screen
 * above it asks the sign-in form to take focus on its heading.
 */
function AuthenticatedAccount({
  onSessionEnding,
}: Readonly<{ onSessionEnding: () => void }>) {
  const { state, logout, logoutAll, clear } = useAuth();
  const [sessions, setSessions] = useState<readonly SessionMetadata[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const focusLater = useDeferredFocus();
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

  // The question swaps the button that opened it: focus enters at the
  // passphrase, and Cancel or Escape returns to the opener.
  const reviewDeletion = () => {
    setConfirmDelete(true);
    focusLater(() => passwordRef.current);
  };
  const cancelDeletion = () => {
    setConfirmDelete(false);
    focusLater(() => deleteButtonRef.current);
  };

  const exportData = async () => {
    setPending(true);
    setError(null);
    try {
      downloadExport(await accountApi.export(token));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(false);
    }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = new FormData(event.currentTarget);
      await accountApi.deleteAccount(token, String(data.get("password")));
      onSessionEnding();
      clear();
    } catch (caught) {
      // The API's generic credential message mentions an email; here only the
      // passphrase was entered. Waits (429) and busy (503) messages are shown
      // as the API words them, including how long to wait.
      setError(
        caught instanceof AccountApiError &&
          caught.code === "authentication_failed"
          ? "That passphrase is incorrect. Check it and try again."
          : message(caught),
      );
      focusLater(() => passwordRef.current);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-layout">
      <AccountNavigation currentHref="/account/" />
      <Surface as="section">
        <p className="eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">
          Signed in
        </p>
        <p className="mt-3 break-all font-display text-section-title font-heading tracking-heading text-text-primary">
          <span className="sr-only">Account email: </span>
          {account.email}
        </p>
        <p className="mt-3 text-supporting text-text-muted">
          You are signed in for this browser tab. Closing the tab ends the
          locally stored sign-in.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/projects/"
            className={buttonClasses({ element: "link" })}
          >
            Open My projects
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              onSessionEnding();
              void logout();
            }}
          >
            Sign out
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onSessionEnding();
              void logoutAll();
            }}
          >
            Sign out everywhere
          </Button>
        </div>
      </Surface>

      <Surface as="section">
        <h2 className="font-display text-section-title font-heading tracking-heading text-text-primary">
          Active sessions
        </h2>
        {sessions === null ? (
          <LoadingState className="mt-3" label="Loading sessions…" />
        ) : (
          <ul className="mt-3 space-y-3">
            {sessions.map((session) => (
              <Surface
                as="li"
                elevation="flat"
                padding="tight"
                radius="card"
                key={session.id}
              >
                <p className="text-body text-text-primary">
                  {session.current ? "Current session" : "Session"} —{" "}
                  {session.revokedAt
                    ? "Revoked"
                    : new Date(session.expiresAt) <= new Date()
                      ? "Expired"
                      : "Active"}
                </p>
                <p className="text-supporting text-text-muted">
                  Created {new Date(session.createdAt).toLocaleString()} ·
                  Expires {new Date(session.expiresAt).toLocaleString()}
                </p>
                {!session.revokedAt ? (
                  <Button
                    className="mt-2"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await accountApi.revokeSession(token, session.id);
                        if (session.current) {
                          onSessionEnding();
                          clear();
                        } else await loadSessions();
                      } catch (caught) {
                        setError(message(caught));
                      }
                    }}
                  >
                    Revoke this session
                  </Button>
                ) : null}
              </Surface>
            ))}
          </ul>
        )}
        {error ? <ErrorMessage className="mt-3">{error}</ErrorMessage> : null}
        {sessions === null || error ? (
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => void loadSessions()}
          >
            Retry sessions
          </Button>
        ) : null}
      </Surface>

      <Surface as="section">
        <h2 className="font-display text-section-title font-heading tracking-heading text-text-primary">
          Your data
        </h2>
        <p className="mt-2 text-body text-text-muted">
          Export downloads a JSON file containing your account information,
          projects, and saved versions. It does not include your password or
          sign-in credentials.
        </p>
        <Button
          className="mt-3"
          variant="secondary"
          disabled={pending}
          onClick={() => void exportData()}
        >
          Export my data
        </Button>
      </Surface>

      <Surface as="section" tone="danger" elevation="flat">
        <h2 className="font-display text-section-title font-heading tracking-heading text-text-primary">
          Delete account
        </h2>
        <p className="mt-2 text-body text-text-primary">
          This permanently deletes this account, every signed-in session,
          private project, saved project version, and project share link. Public
          designs created without an account are unaffected.
        </p>
        {!confirmDelete ? (
          <Button
            ref={deleteButtonRef}
            className="mt-3"
            variant="secondary"
            onClick={reviewDeletion}
          >
            Review account deletion
          </Button>
        ) : (
          <form
            className="mt-4"
            onSubmit={(event) => void deleteAccount(event)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelDeletion();
              }
            }}
          >
            <Field
              id="delete-password"
              label="Re-enter your passphrase to confirm"
            >
              {(control) => (
                <TextInput
                  {...control}
                  ref={passwordRef}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              )}
            </Field>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                type="submit"
                isLoading={pending}
                loadingLabel="Deleting account…"
              >
                Permanently delete account
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={cancelDeletion}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Surface>
    </div>
  );
}

export function AccountScreen({
  navigate,
}: Readonly<{ navigate?: (path: string) => void }> = {}) {
  const { state } = useAuth();
  const searchParameters =
    useSearchParams() ??
    new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
  const mode = parseAuthenticationMode(searchParameters.get("mode"));
  const returnTo = parseAuthenticationReturnTarget(
    searchParameters.get("returnTo"),
  );
  // Set when a signed-in visitor ends the session here, so the sign-in form
  // that replaces the account view takes focus rather than leaving it on <body>.
  const [focusSignIn, setFocusSignIn] = useState(false);
  if (state.status === "initializing")
    return <LoadingState label="Restoring your session…" />;
  if (state.status === "authenticated")
    return (
      <AuthenticatedAccount onSessionEnding={() => setFocusSignIn(true)} />
    );

  // Return without a reload where possible, so an in-memory design survives
  // even when browser storage is unavailable.
  const onSuccess = () => {
    if (!returnTo) return;
    setAuthReturnHint(returnTo);
    const path = resolveAuthenticationReturnPath(returnTo);
    if (navigate && path) {
      navigate(path);
      return;
    }
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
        <p className="rounded-card border border-border bg-surface-subtle px-5 py-3 text-supporting text-text-muted">
          After successful authentication, you will return to{" "}
          {RETURN_LABELS[returnTo]}.
        </p>
      ) : null}
      <nav
        aria-label="Authentication options"
        className={surfaceClasses({
          elevation: "flat",
          padding: "none",
          radius: "card",
          className: "p-2",
        })}
      >
        <ul className="grid grid-cols-2 gap-1 rounded-control border border-border-strong bg-surface-subtle p-1">
          {(["login", "register"] as const).map((item) => {
            const active = mode === item;
            return (
              <li key={item} className="min-w-0">
                <Link
                  href={buildAccountHref(item, returnTo)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 w-full items-center justify-center rounded-control px-3 py-2 text-center text-button font-control break-words no-underline ${active ? "bg-brand text-on-brand shadow-card" : "text-text-primary hover:bg-surface hover:text-brand"}`}
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
        focusHeading={searchParameters.has("mode") || focusSignIn}
        mode={mode}
        onSuccess={onSuccess}
      />
      <section
        aria-labelledby="account-guest-heading"
        className="min-w-0 rounded-panel border border-dashed border-border-strong bg-surface-subtle p-card"
      >
        <h2
          id="account-guest-heading"
          className="font-display text-card-title font-heading tracking-heading text-text-primary"
        >
          You can keep designing as a guest
        </h2>
        <p className="mt-2 max-w-3xl text-body text-text-muted">
          Every configurator step, the preview, the review summary, printing,
          downloading and public design links work without an account. Your
          design in progress is kept in this browser.
        </p>
        <p className="mt-component text-label font-control text-text-primary">
          An account adds:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-text-muted marker:text-accent">
          <li>private projects with saved version history</li>
          <li>your own pattern uploads</li>
          <li>read-only project links you can revoke</li>
          <li>fictional demonstration quotes, cart and orders</li>
        </ul>
      </section>
    </div>
  );
}

/** The account page's screen, returning with client-side navigation. */
export function RoutedAccountScreen() {
  const router = useRouter();
  return <AccountScreen navigate={(path) => router.replace(path)} />;
}
