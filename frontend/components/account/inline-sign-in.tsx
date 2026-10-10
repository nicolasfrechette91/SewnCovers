"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  Button,
  cardTitleClasses,
  Notice,
  StitchDivider,
  classNames,
} from "@/components/ui";
import type { AuthenticationMode } from "@/services/auth-navigation";

import { AuthForm } from "./auth-form";

export interface InlineSignInProps {
  /** Unique per page, so field ids never collide. */
  readonly idPrefix: string;
  readonly headingLevel?: "h3" | "h4";
  readonly titles: Readonly<Record<AuthenticationMode, string>>;
  /** Why this action needs an account. */
  readonly reason: ReactNode;
  readonly submitLabels?: Readonly<Record<AuthenticationMode, string>>;
  readonly sessionNotice?: string;
  readonly cancelLabel?: string;
  /** What still works without an account. */
  readonly guestNote?: ReactNode;
  readonly onCancel: () => void;
  readonly onSignedIn?: () => void;
}

/**
 * The optional account step shown in place, at an action that needs an
 * account. Nothing navigates, so the design on screen is never at risk, and
 * new visitors can create an account without leaving.
 */
export function InlineSignIn({
  cancelLabel = "Continue as guest",
  guestNote,
  headingLevel = "h4",
  idPrefix,
  onCancel,
  onSignedIn,
  reason,
  sessionNotice,
  submitLabels,
  titles,
}: InlineSignInProps) {
  const [mode, setMode] = useState<AuthenticationMode>("login");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const Heading = headingLevel;
  const headingId = `${idPrefix}-sign-in-heading`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  return (
    <section
      aria-labelledby={headingId}
      className="mt-component min-w-0 rounded-card border border-dashed border-border-strong bg-surface-subtle p-card"
    >
      <Heading
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className={classNames(cardTitleClasses, "scroll-mt-layout")}
      >
        {titles[mode]}
      </Heading>
      <div className="mt-2 max-w-reading text-body text-text-muted">
        {reason}
      </div>
      {sessionNotice ? (
        <Notice className="mt-3" role="status" aria-live="polite">
          {sessionNotice}
        </Notice>
      ) : null}
      <div className="mt-component">
        <AuthForm
          key={mode}
          focusHeading={false}
          idPrefix={idPrefix}
          mode={mode}
          onSuccess={() => onSignedIn?.()}
          submitLabel={submitLabels?.[mode]}
          variant="inline"
        />
      </div>
      <p className="mt-component flex flex-wrap items-center gap-x-1 text-supporting text-text-muted">
        <span>
          {mode === "login" ? "New to SewnCovers?" : "Already have an account?"}
        </span>
        <Button
          size="compact"
          variant="ghost"
          className="px-2"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Create an account instead" : "Sign in instead"}
        </Button>
      </p>
      <StitchDivider className="mt-component" />
      <div className="mt-component flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        {guestNote ? (
          <p className="min-w-0 max-w-prose break-words text-supporting text-text-muted">
            {guestNote}
          </p>
        ) : null}
      </div>
    </section>
  );
}
