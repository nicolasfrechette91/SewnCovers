"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { ButtonLink, EmptyState, TextLink } from "@/components/ui";
import {
  buildAccountHref,
  type AuthenticationReturnTarget,
} from "@/services/auth-navigation";
import {
  draftHasDesign,
  getDraftSnapshot,
  getServerDraftSnapshot,
  subscribeToDraft,
} from "@/services/configurator-draft";

export interface GuestEmptyStateProps {
  readonly title: string;
  /** What this page holds once there is an account. */
  readonly description: ReactNode;
  readonly returnTo: AuthenticationReturnTarget;
  /** A specific label such as "Sign in to see your projects". */
  readonly signInLabel: string;
  readonly titleAs?: "h2" | "h3";
}

/**
 * What a guest sees on an account-only page: what the page is for, what an
 * account adds, a way back to their design, and a quiet, optional sign-in.
 */
export function GuestEmptyState({
  description,
  returnTo,
  signInLabel,
  title,
  titleAs = "h2",
}: GuestEmptyStateProps) {
  const draft = useSyncExternalStore(
    subscribeToDraft,
    getDraftSnapshot,
    getServerDraftSnapshot,
  );

  return (
    <EmptyState
      title={title}
      titleAs={titleAs}
      description={
        <>
          {description}
          <p className="mt-3">
            Designing, previewing, printing and public design links never need
            an account.
          </p>
        </>
      }
      action={
        <div className="flex min-w-0 flex-col items-center gap-2">
          <ButtonLink href="/configure/">
            {draftHasDesign(draft) ? "Continue your design" : "Start configuring"}
          </ButtonLink>
          <p className="flex min-w-0 flex-wrap items-center justify-center gap-x-4 text-supporting">
            <TextLink href={buildAccountHref("login", returnTo)}>
              {signInLabel}
            </TextLink>
            <TextLink href={buildAccountHref("register", returnTo)}>
              Create an account
            </TextLink>
          </p>
        </div>
      }
    />
  );
}
