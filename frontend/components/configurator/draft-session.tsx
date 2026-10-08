"use client";

// Everything the configurator needs to bring a browser draft back, and to
// protect it from being overwritten. Requested as the configurator loads,
// outside the initial chunk.

import { useEffect, useRef, useState } from "react";

import { Button, sectionTitleClasses, useDeferredFocus } from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  isInitialConfiguration,
  useConfiguration,
  type ConfigurationState,
  type PatternChoice,
} from "@/context/configuration";
import { sanitizeDraftConfiguration } from "@/context/configuration/draft-configuration";
import { accountApi, resolveAssetUrl } from "@/services/account-api";
import {
  draftHasDesign,
  type ConfiguratorDraft,
  type ConfiguratorStepId,
} from "@/services/configurator-draft";
import {
  designFingerprint,
  draftNeedsProtection,
  linkRefFromSearch,
} from "@/services/draft-links";

export { recordLinkRestore } from "@/services/draft-links";

export type ReplaceReason = "design" | "project" | "share" | "started";

export interface StoredDesign {
  readonly configuration: ConfigurationState;
  readonly step: ConfiguratorStepId;
  readonly highestStep: number;
}

export type ArrivalPlan =
  | { readonly kind: "confirm"; readonly reason: ReplaceReason }
  | { readonly kind: "link" }
  | { readonly kind: "none" }
  | { readonly kind: "restore"; readonly stored: StoredDesign };

const LINK_PARAMETERS = ["design", "share", "project", "version"] as const;

/** Keeping the stored design: take the link out of the address. */
export function removeLinkParameters(): void {
  const url = new URL(window.location.href);
  LINK_PARAMETERS.forEach((key) => url.searchParams.delete(key));
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function readStoredDesign(draft: ConfiguratorDraft | null): StoredDesign | null {
  if (!draft || !draftHasDesign(draft)) return null;
  const configuration = sanitizeDraftConfiguration(draft.configuration);
  return isInitialConfiguration(configuration)
    ? null
    : { configuration, step: draft.step, highestStep: draft.highestStep };
}

/**
 * Decides what the configurator shows on arrival: a shared or project link
 * wins unless it would overwrite unsaved work, and so does a design the
 * visitor already started; otherwise the stored draft comes back.
 */
export function planArrival(
  search: string,
  draft: ConfiguratorDraft | null,
  current: ConfigurationState,
): ArrivalPlan {
  const stored = readStoredDesign(draft);
  const fingerprint = stored ? designFingerprint(stored.configuration) : null;
  const linkRef = linkRefFromSearch(search);
  if (linkRef !== null) {
    return draftNeedsProtection(draft, fingerprint, linkRef)
      ? {
          kind: "confirm",
          reason: linkRef.startsWith("design:")
            ? "design"
            : linkRef.startsWith("share:")
              ? "share"
              : "project",
        }
      : { kind: "link" };
  }
  if (!stored) return { kind: "none" };
  if (isInitialConfiguration(current) || designFingerprint(current) === fingerprint) {
    return { kind: "restore", stored };
  }
  return draftNeedsProtection(draft, fingerprint, "")
    ? { kind: "confirm", reason: "started" }
    : { kind: "none" };
}

type CustomPattern = Extract<PatternChoice, { readonly kind: "custom" }>;

/** A restored custom pattern needs a fresh, short-lived preview grant. */
export async function resolveCustomPatternPreview(
  pattern: CustomPattern,
  token: string | null,
): Promise<CustomPattern> {
  if (!token) return { ...pattern, unavailableReason: "unavailable" };
  try {
    const upload = await accountApi.getUpload(token, pattern.assetId);
    if (upload.state === "deleted") {
      return { ...pattern, label: upload.label, unavailableReason: "deleted" };
    }
    if (upload.state === "approved") {
      const access = await accountApi.assetAccess(token, upload.id, "tile");
      return { ...pattern, label: upload.label, previewUrl: resolveAssetUrl(access.url) };
    }
  } catch {
    // Stays marked unavailable; the pattern can be chosen again.
  }
  return { ...pattern, unavailableReason: "unavailable" };
}

const REPLACE_COPY: Readonly<Record<ReplaceReason, {
  readonly description: string;
  readonly keep: string;
  readonly replace: string;
}>> = {
  design: {
    description: "This link opens a shared design. Opening it replaces the unsaved design kept in this browser, and that design can’t be brought back.",
    keep: "Keep my design",
    replace: "Open the link instead",
  },
  project: {
    description: "This link opens a private project version. Opening it replaces the unsaved design kept in this browser, and that design can’t be brought back.",
    keep: "Keep my design",
    replace: "Open the link instead",
  },
  share: {
    description: "This link opens a shared project version. Opening it replaces the unsaved design kept in this browser, and that design can’t be brought back.",
    keep: "Keep my design",
    replace: "Open the link instead",
  },
  started: {
    description: "You started a new design before your earlier one loaded. The earlier, unsaved design is still kept in this browser; keeping the new one replaces it.",
    keep: "Restore my earlier design",
    replace: "Keep the new design",
  },
};

export function DraftReplaceConfirmation({
  asHeading = true,
  onKeep,
  onReplace,
  reason,
}: Readonly<{
  /** False once a stage heading is the page's h1 and follows this panel. */
  asHeading?: boolean;
  onKeep: () => void;
  onReplace: () => void;
  reason: ReplaceReason;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = REPLACE_COPY[reason];
  const Title = asHeading ? "h2" : "p";

  useEffect(() => {
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section
      aria-labelledby="draft-replace-heading"
      className="print-hidden mt-layout min-w-0 rounded-panel border border-border-strong bg-surface p-card shadow-card"
    >
      <Title
        id="draft-replace-heading"
        ref={headingRef}
        tabIndex={-1}
        aria-describedby="draft-replace-description"
        className={`${sectionTitleClasses} scroll-mt-layout`}
      >
        Keep your unsaved design?
      </Title>
      <p
        id="draft-replace-description"
        className="mt-3 max-w-3xl break-words text-body text-text-muted"
      >
        {copy.description}
      </p>
      <div className="mt-component flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button onClick={onKeep}>{copy.keep}</Button>
        <Button variant="secondary" onClick={onReplace}>
          {copy.replace}
        </Button>
      </div>
    </section>
  );
}

export function DraftRestoredNotice({
  onStartOver,
}: Readonly<{ onStartOver: () => void }>) {
  const [confirming, setConfirming] = useState(false);
  const { dispatch, state } = useConfiguration();
  const { state: auth } = useAuth();
  const startNewRef = useRef<HTMLButtonElement>(null);
  const keepDesigningRef = useRef<HTMLButtonElement>(null);
  const focusLater = useDeferredFocus();

  // Opening the question swaps the button that was pressed, so focus moves to
  // the safe answer; closing it without starting over returns to the opener.
  const askToStartOver = () => {
    setConfirming(true);
    focusLater(() => keepDesigningRef.current);
  };
  const keepDesigning = () => {
    setConfirming(false);
    focusLater(() => startNewRef.current);
  };

  // Only a restored draft can hold a custom pattern without its preview.
  useEffect(() => {
    const pattern = state.pattern;
    if (
      pattern?.kind !== "custom" ||
      pattern.previewUrl !== null ||
      pattern.unavailableReason ||
      auth.status === "initializing"
    ) {
      return;
    }
    let cancelled = false;
    void resolveCustomPatternPreview(
      pattern,
      auth.status === "authenticated" ? auth.token : null,
    ).then((next) => {
      if (!cancelled) dispatch({ type: "setCustomPattern", pattern: next });
    });
    return () => {
      cancelled = true;
    };
  }, [auth, dispatch, state.pattern]);

  return (
    <div
      className="print-hidden mt-component flex min-w-0 flex-col gap-2 rounded-card border border-dashed border-border-strong bg-surface-subtle px-card py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      onKeyDown={(event) => {
        if (confirming && event.key === "Escape") {
          event.preventDefault();
          keepDesigning();
        }
      }}
    >
      <p className="min-w-0 break-words text-supporting text-text-muted">
        {confirming
          ? "Clear this design from this browser and start again? Anything saved to My projects stays there."
          : "Picked up where you left off. This design is kept in this browser."}
      </p>
      <div className="flex min-w-0 flex-wrap gap-2">
        {confirming ? (
          <>
            <Button size="compact" variant="secondary" onClick={onStartOver}>
              Clear and start again
            </Button>
            <Button
              ref={keepDesigningRef}
              size="compact"
              variant="ghost"
              onClick={keepDesigning}
            >
              Keep designing
            </Button>
          </>
        ) : (
          <Button
            ref={startNewRef}
            size="compact"
            variant="ghost"
            onClick={askToStartOver}
          >
            Start a new design
          </Button>
        )}
      </div>
    </div>
  );
}
