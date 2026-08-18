"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button, ErrorMessage } from "@/components/ui";
import { useAuth } from "@/context/auth";
import type { ConfigurationState } from "@/context/configuration";
import { accountApi, AccountApiError } from "@/services/account-api";
import { mapConfigurationToCreateDesign } from "@/services/design-save";

export function PrivateProjectPanel({ configuration, onSavingChange }: Readonly<{ configuration: ConfigurationState; onSavingChange: (saving: boolean) => void }>) {
  const { state: auth } = useAuth();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ projectId: string; message: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      const value = new URL(window.location.href).searchParams.get("project");
      setProjectId(value && /^[A-Za-z0-9_-]{22}$/.test(value) ? value : null);
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (auth.status !== "authenticated") return;
    setPending(true); onSavingChange(true); setError(null); setSuccess(null);
    try {
      const snapshot = mapConfigurationToCreateDesign(configuration);
      if (projectId) {
        const version = await accountApi.createVersion(auth.token, projectId, snapshot);
        setSuccess({ projectId, message: `Version ${version.versionNumber} saved without changing earlier history.` });
      } else {
        const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
        if (!name) { setError("Enter a project name."); requestAnimationFrame(() => nameRef.current?.focus()); return; }
        const project = await accountApi.createProject(auth.token, name, snapshot);
        setSuccess({ projectId: project.id, message: "Private project created with immutable version 1." });
      }
      requestAnimationFrame(() => statusRef.current?.focus());
    } catch (caught) {
      setError(caught instanceof AccountApiError ? caught.message : "The private project could not be saved. Try again.");
      requestAnimationFrame(() => (projectId ? statusRef.current : nameRef.current)?.focus());
    } finally { setPending(false); onSavingChange(false); }
  };

  return (
    <section aria-labelledby="private-project-heading" className="print-hidden mt-layout rounded-panel border border-border-strong bg-surface p-card shadow-raised">
      <p className="text-label font-control text-accent-strong">Private account workspace</p>
      <h3 id="private-project-heading" className="mt-2 font-display text-section-title font-heading">{projectId ? "Save a new immutable version" : "Save to a private project"}</h3>
      <p className="mt-3 max-w-3xl text-body text-text-muted">{projectId ? "This configuration was opened from project history. Saving appends the next version; it never rewrites the historical snapshot." : "A named project is private by default. It is separate from the anonymous public design link below and becomes readable anonymously only if you explicitly create a revocable project share."}</p>
      {auth.status === "initializing" ? <p className="mt-3" role="status">Restoring your session…</p> : null}
      {auth.status === "guest" ? <div className="mt-3"><p className="text-supporting text-text-muted">Accounts are optional. Sign in to use projects, or keep using anonymous immutable sharing.</p><Link href="/account/" className="mt-3 inline-flex min-h-11 items-center text-button font-control text-brand underline">Sign in or register</Link></div> : null}
      {auth.status === "authenticated" ? (
        <form className="mt-4" onSubmit={(event) => void save(event)}>
          {!projectId ? <><label htmlFor="private-project-name" className="block text-label font-control">Project name</label><input ref={nameRef} id="private-project-name" name="name" required maxLength={120} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-control-x" /></> : null}
          {error ? <ErrorMessage className="mt-3">{error}</ErrorMessage> : null}
          {success ? <div className="mt-3"><p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="text-body font-emphasis">{success.message}</p><Link href={{ pathname: "/projects/", query: { project: success.projectId } }} className="mt-2 inline-flex min-h-11 items-center text-button font-control text-brand underline">Open saved project</Link></div> : null}
          {!success ? <Button className="mt-4" type="submit" isLoading={pending} loadingLabel="Saving private version…">{projectId ? "Save as new version" : "Create private project"}</Button> : null}
        </form>
      ) : null}
    </section>
  );
}
