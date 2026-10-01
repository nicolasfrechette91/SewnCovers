"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button, ErrorMessage } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { AccountApiError } from "@/services/account-api";
import type { AuthenticationMode } from "@/services/auth-navigation";

export function authErrorMessage(error: unknown): string {
  return error instanceof AccountApiError
    ? error.message
    : "The request could not be completed. Try again.";
}

interface AuthFieldErrors {
  readonly acceptedTerms?: string;
  readonly email?: string;
  readonly password?: string;
}

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

export interface AuthFormProps {
  readonly focusHeading: boolean;
  readonly mode: AuthenticationMode;
  readonly onSuccess: () => void;
  /** Prefixes field ids so an inline form never collides with another. */
  readonly idPrefix?: string;
  /** Inline forms sit inside a panel and supply their own heading. */
  readonly variant?: "inline" | "page";
  readonly submitLabel?: string;
}

/**
 * Email and passphrase sign-in or registration, shared by the account page and
 * the inline sign-in step shown at account-only actions.
 */
export function AuthForm({
  focusHeading,
  idPrefix,
  mode,
  onSuccess,
  submitLabel,
  variant = "page",
}: AuthFormProps) {
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
  const isInline = variant === "inline";
  const id = (field: string) =>
    idPrefix ? `${idPrefix}-${mode}-${field}` : `${mode}-${field}`;

  useEffect(() => {
    if (!focusHeading || isInline) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusHeading, isInline]);

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
      setError(authErrorMessage(caught));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const emailErrorId = id("email-error");
  const passwordHelpId = id("password-help");
  const passwordErrorId = id("password-error");
  const termsErrorId = id("terms-error");

  return (
    <form
      ref={formRef}
      noValidate
      aria-busy={pending}
      onSubmit={(event) => void submit(event)}
      className={
        isInline
          ? "min-w-0"
          : "min-w-0 rounded-panel border border-border bg-surface p-card shadow-hairline"
      }
    >
      {isInline ? null : (
        <>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-section-title font-heading tracking-heading text-text-primary"
          >
            {isRegister ? "Create account" : "Sign in"}
          </h2>
          <p className="mt-2 text-supporting text-text-muted">
            {isRegister
              ? "Create a private workspace for projects, version history, custom patterns, and demonstration commerce records."
              : "Use the email and passphrase for your existing SewnCovers account."}
          </p>
        </>
      )}
      <label
        className={
          isInline
            ? "block text-label font-control text-text-primary"
            : "mt-4 block text-label font-control text-text-primary"
        }
        htmlFor={id("email")}
      >
        Email
      </label>
      <input
        ref={emailRef}
        id={id("email")}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        aria-invalid={fieldErrors.email ? true : undefined}
        aria-describedby={fieldErrors.email ? emailErrorId : undefined}
        onChange={() => clearFieldError("email")}
        className="mt-2 min-h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface px-control-x py-control-y text-body text-text-primary transition-colors hover:border-brand motion-reduce:transition-none aria-invalid:border-error-border aria-invalid:bg-error-surface"
      />
      {fieldErrors.email ? (
        <p id={emailErrorId} className="mt-2 text-supporting text-error-text">
          {fieldErrors.email}
        </p>
      ) : null}
      <label
        className="mt-4 block text-label font-control text-text-primary"
        htmlFor={id("password")}
      >
        Passphrase
      </label>
      <input
        ref={passwordRef}
        id={id("password")}
        name="password"
        type="password"
        autoComplete={isRegister ? "new-password" : "current-password"}
        required
        minLength={12}
        maxLength={128}
        aria-invalid={fieldErrors.password ? true : undefined}
        aria-describedby={`${passwordHelpId}${fieldErrors.password ? ` ${passwordErrorId}` : ""}`}
        onChange={() => clearFieldError("password")}
        className="mt-2 min-h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface px-control-x py-control-y text-body text-text-primary transition-colors hover:border-brand motion-reduce:transition-none aria-invalid:border-error-border aria-invalid:bg-error-surface"
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
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand"
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
        {submitLabel ?? (isRegister ? "Create account" : "Sign in")}
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
