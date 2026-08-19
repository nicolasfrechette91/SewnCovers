"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useConfiguration, type ConfigurationState } from "@/context/configuration";
import {
  accountApi,
  AccountApiError,
  buildSharedAssetUrl,
  resolveAssetUrl,
  type ProjectConfigurationRequest,
} from "@/services/account-api";

type LoaderState =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "restored"; label: string }
  | { status: "signin" }
  | { status: "error"; label: string };

function removeWorkspaceParameters(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("share");
  url.searchParams.delete("project");
  url.searchParams.delete("version");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

async function restoreState(
  configuration: ProjectConfigurationRequest,
  token: string | null,
  share: string | null,
): Promise<ConfigurationState> {
  let pattern: ConfigurationState["pattern"];
  if (configuration.pattern.kind === "built-in") {
    pattern = configuration.pattern;
  } else {
    let previewUrl: string | null = null;
    let unavailableReason: "deleted" | "unavailable" | undefined;
    let label = "Shared custom pattern";
    try {
      if (share) {
        previewUrl = buildSharedAssetUrl(share);
      } else if (token) {
        const upload = await accountApi.getUpload(token, configuration.pattern.assetId);
        label = upload.label;
        if (upload.state === "deleted") unavailableReason = "deleted";
        else if (upload.state !== "approved") unavailableReason = "unavailable";
        else {
          const access = await accountApi.assetAccess(token, upload.id, "tile");
          previewUrl = resolveAssetUrl(access.url);
        }
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

export function WorkspaceConfigurationLoader() {
  const { state: auth } = useAuth();
  const { dispatch, getRevision } = useConfiguration();
  const [state, setState] = useState<LoaderState>({ status: "idle" });
  const generation = useRef(0);

  const load = useCallback(async () => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("design")) { setState({ status: "idle" }); return; }
    const share = url.searchParams.get("share");
    const project = url.searchParams.get("project");
    const version = url.searchParams.get("version");
    if (!share && !project && !version) { setState({ status: "idle" }); return; }
    if (share && (project || version)) { setState({ status: "error", label: "This URL combines incompatible sharing modes." }); return; }
    if (project && version && auth.status === "guest") { setState({ status: "signin" }); return; }
    if (project && version && auth.status === "initializing") { setState({ status: "loading", label: "Restoring your session…" }); return; }
    if ((!share && (!project || !version)) || (share && !/^[A-Za-z0-9_-]{43}$/.test(share)) || (project && !/^[A-Za-z0-9_-]{22}$/.test(project)) || (version && !/^[A-Za-z0-9_-]{22}$/.test(version))) {
      setState({ status: "error", label: "The saved-configuration link is malformed." }); return;
    }
    const active = ++generation.current;
    const revision = getRevision();
    setState({ status: "loading", label: share ? "Loading the read-only shared configuration…" : "Loading the private project version…" });
    try {
      const snapshot = share
        ? (await accountApi.restoreShare(share)).configuration
        : auth.status === "authenticated"
          ? (await accountApi.getVersion(auth.token, project!, version!)).configuration
          : null;
      if (active !== generation.current || snapshot === null) return;
      const configuration = await restoreState(
        snapshot,
        auth.status === "authenticated" ? auth.token : null,
        share,
      );
      if (getRevision() !== revision) {
        setState({ status: "error", label: "Your configuration changed while the saved version was loading, so it was not overwritten." });
        return;
      }
      dispatch({ type: "restoreConfiguration", configuration });
      setState({ status: "restored", label: share ? "Read-only project share restored. Changes affect only your current configurator unless you save them separately." : "Private project version restored as an editing basis. Saving creates a new immutable version." });
    } catch (error) {
      if (active !== generation.current) return;
      setState({ status: "error", label: error instanceof AccountApiError ? error.message : "The saved configuration could not be loaded." });
    }
  }, [auth, dispatch, getRevision]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => { globalThis.clearTimeout(timer); generation.current += 1; };
  }, [load]);
  if (state.status === "idle") return null;
  return (
    <section aria-labelledby="workspace-load-heading" className="print-hidden mt-layout rounded-panel border border-border bg-surface p-card shadow-raised">
      <h2 id="workspace-load-heading" className="font-display text-section-title font-heading">{state.status === "signin" ? "Private project version" : "Saved configuration"}</h2>
      {state.status === "loading" ? <LoadingState className="mt-3" label={state.label} /> : null}
      {state.status === "restored" ? <p className="mt-3 text-supporting text-text-muted" role="status" aria-live="polite">{state.label}</p> : null}
      {state.status === "signin" ? <div className="mt-3"><p className="text-body text-text-muted">Sign in to open this private project version. Project IDs do not grant access.</p><Link href="/account/" className="mt-3 inline-flex min-h-11 items-center text-button font-control text-brand underline">Sign in</Link></div> : null}
      {state.status === "error" ? <ErrorMessage className="mt-3">{state.label}</ErrorMessage> : null}
      {state.status === "error" ? <div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void load()}>Try loading again</Button><Button variant="secondary" onClick={() => { removeWorkspaceParameters(); setState({ status: "idle" }); }}>Continue with my configuration</Button></div> : null}
    </section>
  );
}
