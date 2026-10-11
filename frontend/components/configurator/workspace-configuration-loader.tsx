"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button, ErrorMessage, LoadingState, Surface } from "@/components/ui";
import { useAuth, type AuthState } from "@/context/auth";
import {
  useConfiguration,
  type ConfigurationState,
} from "@/context/configuration";
import {
  accountApi,
  AccountApiError,
  buildSharedAssetUrl,
  type ProjectConfigurationRequest,
} from "@/services/account-api";
import { fetchCustomAsset } from "@/services/custom-asset";
import { useResource, type Resource } from "@/services/use-resource";

// Loaded only when a guest opens a private project version link.
const PrivateVersionSignIn = dynamic(() =>
  import("./private-version-sign-in").then(
    (loaded) => loaded.PrivateVersionSignIn,
  ),
);

type LoaderState =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "restored"; label: string }
  | { status: "signin" }
  | { status: "error"; label: string };

// What the link asks for, decided from the URL and the session alone.
type LinkPlan =
  | { readonly kind: "idle" }
  | { readonly kind: "error"; readonly label: string }
  | { readonly kind: "signin" }
  | { readonly kind: "session" }
  | { readonly kind: "share"; readonly share: string }
  | {
      readonly kind: "version";
      readonly project: string;
      readonly version: string;
      readonly token: string;
    };

const SHARE_LABEL = "Loading the read-only shared configuration…";
const VERSION_LABEL = "Loading the private project version…";

/** A newer edit than the saved version being loaded; nothing was replaced. */
class ConfigurationChangedError extends Error {}

function planFor(search: string, auth: AuthState): LinkPlan {
  const searchParams = new URLSearchParams(search);
  if (searchParams.has("design")) return { kind: "idle" };
  const share = searchParams.get("share");
  const project = searchParams.get("project");
  const version = searchParams.get("version");
  if (!share && !project && !version) return { kind: "idle" };
  if (share && (project || version)) {
    return {
      kind: "error",
      label: "This URL combines incompatible sharing modes.",
    };
  }
  if (project && version && auth.status === "guest") return { kind: "signin" };
  if (project && version && auth.status === "initializing") {
    return { kind: "session" };
  }
  if (
    (!share && (!project || !version)) ||
    (share && !/^[A-Za-z0-9_-]{43}$/.test(share)) ||
    (project && !/^[A-Za-z0-9_-]{22}$/.test(project)) ||
    (version && !/^[A-Za-z0-9_-]{22}$/.test(version))
  ) {
    return {
      kind: "error",
      label: "The saved-configuration link is malformed.",
    };
  }
  if (share) return { kind: "share", share };
  return project && version && auth.status === "authenticated"
    ? { kind: "version", project, version, token: auth.token }
    : { kind: "idle" };
}

function failureLabel(error: unknown): string {
  if (error instanceof ConfigurationChangedError) {
    return "Your configuration changed while the saved version was loading, so it was not overwritten.";
  }
  return error instanceof AccountApiError
    ? error.message
    : "The saved configuration could not be loaded.";
}

function loaderState(
  plan: LinkPlan,
  restoring: Resource<"share" | "version">,
): LoaderState {
  switch (plan.kind) {
    case "idle":
      return { status: "idle" };
    case "error":
      return { status: "error", label: plan.label };
    case "signin":
      return { status: "signin" };
    case "session":
      return { status: "loading", label: "Restoring your session…" };
  }
  const label = plan.kind === "share" ? SHARE_LABEL : VERSION_LABEL;
  if (restoring.loading) return { status: "loading", label };
  if (restoring.error !== undefined) {
    return { status: "error", label: failureLabel(restoring.error) };
  }
  if (restoring.data === undefined) return { status: "loading", label };
  return {
    status: "restored",
    label:
      restoring.data === "share"
        ? "Read-only project share restored. Changes affect only your current configurator unless you save them separately."
        : "Private project version restored for editing. Saving adds a new version and leaves this one unchanged.",
  };
}

// The page's query, read in the browser only: the prerendered page and the
// first render after hydration see none, as before any link is acted on.
const subscribeToNothing = () => () => undefined;
const readSearch = () => window.location.search;
const noSearch = () => "";

function removeWorkspaceParameters(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("share");
  url.searchParams.delete("project");
  url.searchParams.delete("version");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

async function restoreState(
  configuration: ProjectConfigurationRequest,
  token: string | null,
  share: string | null,
  signal: AbortSignal,
): Promise<ConfigurationState> {
  let pattern: ConfigurationState["pattern"];
  if (configuration.pattern.kind === "built-in") {
    pattern = configuration.pattern;
  } else if (configuration.pattern.kind === "solid") {
    pattern = configuration.pattern;
  } else {
    let previewUrl: string | null = null;
    let unavailableReason: "deleted" | "unavailable" | undefined;
    let label = "Shared custom pattern";
    try {
      if (share) {
        previewUrl = buildSharedAssetUrl(share);
      } else if (token) {
        const found = await fetchCustomAsset(
          token,
          configuration.pattern.assetId,
          (upload) => upload.state === "approved",
          { signal },
        );
        label = found.upload.label;
        if (found.upload.state === "deleted") unavailableReason = "deleted";
        else if (found.previewUrl === null) unavailableReason = "unavailable";
        else previewUrl = found.previewUrl;
      }
    } catch {
      unavailableReason = "unavailable";
    }
    pattern = {
      ...configuration.pattern,
      label,
      previewUrl,
      unavailableReason,
    };
  }
  return { ...configuration, pattern };
}

export function WorkspaceConfigurationLoader({
  asHeading = true,
  onDismiss,
  onRestored,
}: Readonly<{
  /** False once a stage heading is the page's h1 and follows this panel. */
  asHeading?: boolean;
  onDismiss?: () => void;
  /** Records where a restored design came from, for the browser draft. */
  onRestored?: (
    ref: string,
    configuration: ConfigurationState,
    project: { readonly projectId: string; readonly versionId: string } | null,
  ) => void;
}> = {}) {
  const { state: auth } = useAuth();
  const { dispatch, getRevision } = useConfiguration();
  const search = useSyncExternalStore(subscribeToNothing, readSearch, noSearch);
  const [dismissed, setDismissed] = useState(false);
  const plan: LinkPlan = dismissed ? { kind: "idle" } : planFor(search, auth);
  const focusRestored = useRef(false);
  const restoredRef = useRef<HTMLParagraphElement>(null);
  const Title = asHeading ? "h2" : "p";

  // Restores the linked version once per link (and session, for a private
  // version). A newer edit made while it loads is never overwritten.
  const restoring = useResource(
    plan.kind === "share"
      ? `share\u0000${plan.share}`
      : plan.kind === "version"
        ? `version\u0000${plan.token}\u0000${plan.project}\u0000${plan.version}`
        : null,
    async (_key, signal) => {
      if (plan.kind !== "share" && plan.kind !== "version") {
        throw new Error("There is no saved configuration to load.");
      }
      const revision = getRevision();
      const snapshot =
        plan.kind === "share"
          ? (await accountApi.restoreShare(plan.share, { signal }))
              .configuration
          : (
              await accountApi.getVersion(
                plan.token,
                plan.project,
                plan.version,
                { signal },
              )
            ).configuration;
      const configuration = await restoreState(
        snapshot,
        plan.kind === "version" ? plan.token : null,
        plan.kind === "share" ? plan.share : null,
        signal,
      );
      signal.throwIfAborted();
      if (getRevision() !== revision) throw new ConfigurationChangedError();
      onRestored?.(
        plan.kind === "share"
          ? `share:${plan.share}`
          : `project:${plan.project}:${plan.version}`,
        configuration,
        plan.kind === "share"
          ? null
          : { projectId: plan.project, versionId: plan.version },
      );
      dispatch({ type: "restoreConfiguration", configuration });
      return plan.kind;
    },
  );

  const state = loaderState(plan, restoring);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const isPrivateContext = ["share", "project", "version"].some((key) =>
      searchParams.has(key),
    );
    if (!isPrivateContext) return;

    const previousContent = new Map<HTMLMetaElement, string>();
    const applyPrivateDirective = () => {
      document
        .querySelectorAll<HTMLMetaElement>('meta[name="robots"]')
        .forEach((robots) => {
          if (!previousContent.has(robots)) {
            previousContent.set(robots, robots.content);
          }
          robots.content = "noindex, nofollow, nocache";
        });
    };
    applyPrivateDirective();
    const observer = new MutationObserver(applyPrivateDirective);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      for (const [robots, content] of previousContent) {
        if (robots.isConnected) robots.content = content;
      }
    };
  }, []);

  const restored = state.status === "restored";
  useEffect(() => {
    if (!restored || !focusRestored.current) return;
    focusRestored.current = false;
    const frame = requestAnimationFrame(() => restoredRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [restored]);

  const continueWithMine = () => {
    removeWorkspaceParameters();
    setDismissed(true);
    onDismiss?.();
  };

  if (state.status === "idle") return null;
  return (
    <Surface
      as="section"
      aria-labelledby="workspace-load-heading"
      className="print-hidden mt-layout"
    >
      <Title
        id="workspace-load-heading"
        tabIndex={-1}
        className="font-display text-section-title font-heading"
      >
        {state.status === "signin"
          ? "Private project version"
          : "Saved configuration"}
      </Title>
      {state.status === "loading" ? (
        <LoadingState className="mt-3" label={state.label} />
      ) : null}
      {state.status === "restored" ? (
        <p
          ref={restoredRef}
          tabIndex={-1}
          className="mt-3 text-supporting text-text-muted"
          role="status"
          aria-live="polite"
        >
          {state.label}
        </p>
      ) : null}
      {state.status === "signin" ? (
        <PrivateVersionSignIn
          sessionNotice={auth.status === "guest" ? auth.notice : undefined}
          onCancel={continueWithMine}
          onSignedIn={() => {
            focusRestored.current = true;
          }}
        />
      ) : null}
      {state.status === "error" ? (
        <ErrorMessage className="mt-3">{state.label}</ErrorMessage>
      ) : null}
      {state.status === "error" ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => void restoring.reload()}>
            Try loading again
          </Button>
          <Button variant="secondary" onClick={continueWithMine}>
            Continue with my configuration
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}
