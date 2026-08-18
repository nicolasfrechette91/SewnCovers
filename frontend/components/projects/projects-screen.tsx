"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  accountApi,
  AccountApiError,
  buildProjectShareUrl,
  type ProjectDetail,
  type ProjectSummary,
  type ProjectVersion,
} from "@/services/account-api";

import { ConfigurationReadonly } from "./configuration-readonly";

type LoadState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; value: T };

function errorMessage(error: unknown): string {
  return error instanceof AccountApiError ? error.message : "The request could not be completed. Try again.";
}

function ProjectList({ token }: Readonly<{ token: string }>) {
  const [state, setState] = useState<LoadState<readonly ProjectSummary[]>>({ status: "loading" });
  const load = async () => {
    setState({ status: "loading" });
    try { setState({ status: "ready", value: await accountApi.listProjects(token) }); }
    catch (error) { setState({ status: "error", message: errorMessage(error) }); }
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === "loading") return <LoadingState label="Loading your private projects…" />;
  if (state.status === "error") return <div><ErrorMessage>{state.message}</ErrorMessage><Button className="mt-3" variant="secondary" onClick={() => void load()}>Retry projects</Button></div>;
  if (state.value.length === 0) return (
    <section className="rounded-panel border border-border bg-surface p-card text-center">
      <h2 className="font-display text-section-title font-heading">No private projects yet</h2>
      <p className="mt-2 text-body text-text-muted">Complete a configuration, open its review, and choose Save to a private project.</p>
      <Link href="/configure/" className="mt-4 inline-flex min-h-12 items-center rounded-control bg-brand px-control-x py-control-y text-button font-control text-on-brand no-underline">Start configuring</Link>
    </section>
  );
  return (
    <ul className="grid gap-component sm:grid-cols-2 lg:grid-cols-3">
      {state.value.map((project) => (
        <li key={project.id} className="rounded-card border border-border bg-surface p-card shadow-card">
          <p className="text-label font-control text-accent-strong">{project.privacy === "shared" ? "Shared by revocable link" : "Private"}</p>
          <h2 className="mt-2 break-words font-display text-section-title font-heading">{project.name}</h2>
          <p className="mt-2 text-supporting text-text-muted">{project.versionCount} {project.versionCount === 1 ? "version" : "versions"} · Updated {new Date(project.updatedAt).toLocaleString()}</p>
          <Link href={{ pathname: "/projects/", query: { project: project.id } }} className="mt-4 inline-flex min-h-11 items-center rounded-control text-button font-control text-brand underline">Open project</Link>
        </li>
      ))}
    </ul>
  );
}

function ProjectView({ token, projectId }: Readonly<{ token: string; projectId: string }>) {
  const [state, setState] = useState<LoadState<{ detail: ProjectDetail; versions: readonly ProjectVersion[] }>>({ status: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const shareRef = useRef<HTMLInputElement>(null);
  const actionStatusRef = useRef<HTMLParagraphElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const load = async () => {
    setState({ status: "loading" });
    try {
      const [detail, versions] = await Promise.all([
        accountApi.getProject(token, projectId),
        accountApi.listVersions(token, projectId),
      ]);
      setState({ status: "ready", value: { detail, versions } });
    } catch (error) { setState({ status: "error", message: errorMessage(error) }); }
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [projectId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === "loading") return <LoadingState label="Loading project and version history…" />;
  if (state.status === "error") return <div><ErrorMessage>{state.message}</ErrorMessage><Button className="mt-3" variant="secondary" onClick={() => void load()}>Retry project</Button></div>;
  const { detail, versions } = state.value;

  const rename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setActionError(null); setActionStatus(null);
    try { await accountApi.renameProject(token, projectId, String(new FormData(event.currentTarget).get("name"))); await load(); setActionStatus("Project renamed."); requestAnimationFrame(() => renameRef.current?.focus()); }
    catch (error) { setActionError(errorMessage(error)); requestAnimationFrame(() => renameRef.current?.focus()); }
  };
  const createShare = async (version: ProjectVersion) => {
    setActionError(null); setActionStatus(null);
    try {
      const created = await accountApi.createShare(token, projectId, version.id);
      setShareUrl(buildProjectShareUrl(created.shareToken));
      setActionStatus(`Read-only share created for version ${version.versionNumber}.`);
      await load();
      requestAnimationFrame(() => { shareRef.current?.focus(); shareRef.current?.select(); });
    } catch (error) { setActionError(errorMessage(error)); }
  };
  const removeProject = async () => {
    setActionError(null); setActionStatus(null);
    try { await accountApi.deleteProject(token, projectId); window.location.assign("./"); }
    catch (error) { setActionError(errorMessage(error)); setConfirmDelete(false); requestAnimationFrame(() => deleteButtonRef.current?.focus()); }
  };

  return (
    <div className="space-y-layout">
      <Link href="/projects/" className="inline-flex min-h-11 items-center text-button font-control text-brand underline">← All projects</Link>
      <section className="rounded-panel border border-border bg-surface p-card shadow-raised">
        <p className="text-label font-control text-accent-strong">{detail.privacy === "shared" ? "Shared — one or more revocable links are active" : "Private — no active project share links"}</p>
        <h2 className="mt-2 font-display text-page-title font-heading">{detail.name}</h2>
        <p className="mt-2 text-supporting text-text-muted">{detail.versionCount} immutable {detail.versionCount === 1 ? "version" : "versions"} · Updated {new Date(detail.updatedAt).toLocaleString()}</p>
        <form className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row" onSubmit={(event) => void rename(event)}>
          <label htmlFor="project-name" className="sr-only">New project name</label>
          <input ref={renameRef} id="project-name" name="name" required maxLength={120} defaultValue={detail.name} className="min-h-12 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-control-x" />
          <Button type="submit" variant="secondary">Rename project</Button>
        </form>
      </section>

      {shareUrl ? (
        <section className="rounded-card border border-brand bg-surface p-card" aria-live="polite">
          <h2 className="font-display text-section-title font-heading">Read-only share created</h2>
          <p className="mt-2 text-body text-text-muted">Anyone with this bearer-style URL can read this version until you revoke its grant. The token is shown only now.</p>
          <label htmlFor="project-share-url" className="mt-3 block text-label font-control">Share URL</label>
          <input ref={shareRef} id="project-share-url" type="url" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface-subtle px-control-x" />
          <Button className="mt-3" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); shareRef.current?.focus(); } catch { setActionError("Copying is unavailable. The share URL is selected for manual copying."); shareRef.current?.focus(); shareRef.current?.select(); } }}>Copy share link</Button>
        </section>
      ) : null}
      {actionError ? <ErrorMessage>{actionError}</ErrorMessage> : null}
      {actionStatus ? <p ref={actionStatusRef} tabIndex={-1} className="text-supporting text-accent-strong" aria-live="polite">{actionStatus}</p> : null}

      <section aria-labelledby="version-history-heading">
        <h2 id="version-history-heading" className="font-display text-section-title font-heading">Version history</h2>
        <p className="mt-2 text-body text-text-muted">Earlier snapshots stay unchanged. Opening one and saving creates the next sequential version.</p>
        <ol className="mt-component space-y-component">
          {versions.map((version) => (
            <li key={version.id} className="rounded-panel border border-border bg-surface p-card">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div><h3 className="font-display text-section-title font-heading">Version {version.versionNumber} {version.isCurrent ? "— Current" : "— Historical"}</h3><p className="text-supporting text-text-muted">Created {new Date(version.createdAt).toLocaleString()}</p></div>
                <div className="flex flex-wrap gap-2">
                  <Link href={{ pathname: "/configure/", query: { project: projectId, version: version.id } }} className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-3 text-button font-control text-text-primary no-underline">Open as editing basis</Link>
                  <Button size="compact" variant="secondary" onClick={() => void createShare(version)}>Create read-only share</Button>
                </div>
              </div>
              <div className="mt-component"><ConfigurationReadonly configuration={version.configuration} /></div>
            </li>
          ))}
        </ol>
      </section>

      {detail.activeShares.length ? (
        <section className="rounded-panel border border-border bg-surface p-card">
          <h2 className="font-display text-section-title font-heading">Active read-only shares</h2>
          <ul className="mt-3 space-y-3">{detail.activeShares.map((grant) => <li key={grant.id} className="flex flex-col gap-2 rounded-card border border-border p-3 sm:flex-row sm:items-center sm:justify-between"><span>Version {grant.versionNumber} · Created {new Date(grant.createdAt).toLocaleString()}</span><Button variant="secondary" size="compact" onClick={async () => { try { setActionError(null); setActionStatus(null); await accountApi.revokeShare(token, projectId, grant.id); setShareUrl(null); await load(); setActionStatus(`Share for version ${grant.versionNumber} revoked.`); requestAnimationFrame(() => actionStatusRef.current?.focus()); } catch (error) { setActionError(errorMessage(error)); } }}>Revoke share</Button></li>)}</ul>
        </section>
      ) : null}

      <section className="rounded-panel border-2 border-accent-strong bg-surface p-card">
        <h2 className="font-display text-section-title font-heading">Delete project</h2>
        <p className="mt-2 text-body">This permanently deletes the project, every immutable version, and every project share. It does not delete your account or anonymous designs.</p>
        {!confirmDelete ? <Button ref={deleteButtonRef} className="mt-3" variant="secondary" onClick={() => { setConfirmDelete(true); requestAnimationFrame(() => confirmDeleteButtonRef.current?.focus()); }}>Review project deletion</Button> : <div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="Confirm project deletion"><Button ref={confirmDeleteButtonRef} onClick={() => void removeProject()}>Permanently delete project</Button><Button variant="secondary" onClick={() => { setConfirmDelete(false); requestAnimationFrame(() => deleteButtonRef.current?.focus()); }}>Cancel</Button></div>}
      </section>
    </div>
  );
}

export function ProjectsScreen() {
  const { state } = useAuth();
  const projectId = useSearchParams().get("project");
  if (state.status === "initializing") return <LoadingState label="Restoring your session…" />;
  if (state.status === "guest") return (
    <section className="rounded-panel border border-border bg-surface p-card">
      <h2 className="font-display text-section-title font-heading">Sign in to view private projects</h2>
      <p className="mt-2 text-body text-text-muted">Accounts are optional. You can still use the configurator and create anonymous immutable public links without signing in.</p>
      <div className="mt-4 flex flex-wrap gap-3"><Link href="/account/" className="inline-flex min-h-12 items-center rounded-control bg-brand px-control-x text-button font-control text-on-brand no-underline">Sign in or register</Link><Link href="/configure/" className="inline-flex min-h-12 items-center rounded-control border border-border-strong px-control-x text-button font-control text-text-primary no-underline">Continue as guest</Link></div>
    </section>
  );
  return projectId ? <ProjectView token={state.token} projectId={projectId} /> : <ProjectList token={state.token} />;
}
