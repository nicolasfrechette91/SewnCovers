"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { GuestEmptyState } from "@/components/account/guest-empty-state";
import {
  Button,
  buttonClasses,
  ButtonLink,
  EmptyState,
  ErrorMessage,
  Field,
  LoadingState,
  Notice,
  TextInput,
  TextLink,
  useDeferredFocus,
  Surface,
  SectionHeader,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  accountApi,
  AccountApiError,
  buildProjectShareUrl,
  type ProjectDetail,
  type ProjectSummary,
  type ProjectVersion,
} from "@/services/account-api";
import {
  draftHasDesign,
  getDraftSnapshot,
  getServerDraftSnapshot,
  subscribeToDraft,
} from "@/services/configurator-draft";

import { ConfigurationReadonly } from "./configuration-readonly";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

function errorMessage(error: unknown): string {
  return error instanceof AccountApiError
    ? error.message
    : "The request could not be completed. Try again.";
}

function ProjectList({ token }: Readonly<{ token: string }>) {
  const [state, setState] = useState<LoadState<readonly ProjectSummary[]>>({
    status: "loading",
  });
  const load = async () => {
    setState({ status: "loading" });
    try {
      setState({
        status: "ready",
        value: await accountApi.listProjects(token),
      });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === "loading")
    return <LoadingState label="Loading your private projects…" />;
  if (state.status === "error")
    return (
      <div>
        <ErrorMessage>{state.message}</ErrorMessage>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => void load()}
        >
          Retry projects
        </Button>
      </div>
    );
  if (state.value.length === 0)
    return (
      <EmptyState
        title="No private projects yet"
        description={
          <p>
            Complete a configuration, open its review, and choose Save to a
            private project.
          </p>
        }
        action={<ButtonLink href="/configure/">Start configuring</ButtonLink>}
      />
    );
  return (
    <ul className="grid min-w-0 wrap-anywhere gap-component sm:grid-cols-2 lg:grid-cols-3">
      {state.value.map((project) => (
        <Surface
          as="li"
          key={project.id}
          className="flex flex-col transition-[border-color,box-shadow] duration-(--duration-base) hover:border-border-strong hover:shadow-card motion-reduce:transition-none"
        >
          <SectionHeader
            size="card"
            eyebrow={
              project.privacy === "shared"
                ? "Shared by revocable link"
                : "Private"
            }
            title={project.name}
          />
          <p className="mt-2 font-mono text-supporting text-text-muted">
            {project.versionCount}{" "}
            {project.versionCount === 1 ? "version" : "versions"} · Updated{" "}
            {new Date(project.updatedAt).toLocaleString()}
          </p>
          <Link
            href={{ pathname: "/projects/", query: { project: project.id } }}
            className="mt-auto pt-4 inline-flex min-h-11 max-w-full items-center rounded-control text-button font-control break-words text-brand underline decoration-1 underline-offset-4 hover:text-brand-hover hover:decoration-2"
          >
            Open project
          </Link>
        </Surface>
      ))}
    </ul>
  );
}

function ProjectView({
  token,
  projectId,
}: Readonly<{ token: string; projectId: string }>) {
  const router = useRouter();
  const focusLater = useDeferredFocus();
  const [state, setState] = useState<
    LoadState<{ detail: ProjectDetail; versions: readonly ProjectVersion[] }>
  >({ status: "loading" });
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
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [projectId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shareUrl || state.status !== "ready") return;
    const timer = globalThis.setTimeout(() => {
      shareRef.current?.focus();
      shareRef.current?.select();
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [shareUrl, state.status]);
  if (state.status === "loading")
    return <LoadingState label="Loading project and version history…" />;
  if (state.status === "error")
    return (
      <div>
        <ErrorMessage>{state.message}</ErrorMessage>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => void load()}
        >
          Retry project
        </Button>
      </div>
    );
  const { detail, versions } = state.value;

  const rename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setActionStatus(null);
    try {
      await accountApi.renameProject(
        token,
        projectId,
        String(new FormData(event.currentTarget).get("name")),
      );
      await load();
      setActionStatus("Project renamed.");
      focusLater(() => renameRef.current);
    } catch (error) {
      setActionError(errorMessage(error));
      focusLater(() => renameRef.current);
    }
  };
  const createShare = async (version: ProjectVersion) => {
    setActionError(null);
    setActionStatus(null);
    try {
      const created = await accountApi.createShare(
        token,
        projectId,
        version.id,
      );
      setShareUrl(buildProjectShareUrl(created.shareToken));
      setActionStatus(
        `Read-only share created for version ${version.versionNumber}.`,
      );
      await load();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };
  const removeProject = async () => {
    setActionError(null);
    setActionStatus(null);
    try {
      await accountApi.deleteProject(token, projectId);
      // The project's own view is about to unmount, so focus goes to the page.
      router.push("/projects/");
      focusLater(() => document.getElementById("main-content"));
    } catch (error) {
      setActionError(errorMessage(error));
      closeDeleteReview();
    }
  };
  const openDeleteReview = () => {
    setConfirmDelete(true);
    focusLater(() => confirmDeleteButtonRef.current);
  };
  const closeDeleteReview = () => {
    setConfirmDelete(false);
    focusLater(() => deleteButtonRef.current);
  };

  return (
    <div className="min-w-0 wrap-anywhere space-y-layout">
      <Link
        href="/projects/"
        className="inline-flex min-h-11 max-w-full items-center rounded-control text-button font-control break-words text-brand underline decoration-1 underline-offset-4 hover:text-brand-hover hover:decoration-2"
      >
        ← All projects
      </Link>
      <Surface as="section">
        <SectionHeader
          eyebrow={
            detail.privacy === "shared"
              ? "Shared — one or more revocable links are active"
              : "Private — no active project share links"
          }
          title={detail.name}
        />
        <p className="mt-2 font-mono text-supporting text-text-muted">
          {detail.versionCount} saved{" "}
          {detail.versionCount === 1 ? "version" : "versions"} · Updated{" "}
          {new Date(detail.updatedAt).toLocaleString()}
        </p>
        <form
          className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row"
          onSubmit={(event) => void rename(event)}
        >
          <Field
            className="flex-1"
            hideLabel
            id="project-name"
            label="New project name"
          >
            {(control) => (
              <TextInput
                {...control}
                ref={renameRef}
                name="name"
                required
                maxLength={120}
                defaultValue={detail.name}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary">
            Rename project
          </Button>
        </form>
      </Surface>

      {shareUrl ? (
        <Surface
          as="section"
          tone="emphasis"
          elevation="card"
          aria-live="polite"
        >
          <SectionHeader title="Read-only share created" />
          <p className="mt-2 text-body text-text-muted">
            Anyone with this link can view this version until you revoke the
            share. Copy it now; the complete link is shown only once.
          </p>
          <Field className="mt-4" id="project-share-url" label="Share URL">
            {(control) => (
              <TextInput
                {...control}
                ref={shareRef}
                type="url"
                readOnly
                value={shareUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono"
              />
            )}
          </Field>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                shareRef.current?.focus();
              } catch {
                setActionError(
                  "Copying is unavailable. The share URL is selected for manual copying.",
                );
                shareRef.current?.focus();
                shareRef.current?.select();
              }
            }}
          >
            Copy share link
          </Button>
        </Surface>
      ) : null}
      {actionError ? <ErrorMessage>{actionError}</ErrorMessage> : null}
      {actionStatus ? (
        <p
          ref={actionStatusRef}
          tabIndex={-1}
          className="rounded-card border border-success-border bg-success-surface px-5 py-3 text-supporting font-emphasis text-success-text"
          aria-live="polite"
        >
          {actionStatus}
        </p>
      ) : null}

      <section aria-labelledby="version-history-heading">
        <SectionHeader
          title="Version history"
          titleId="version-history-heading"
        />
        <p className="mt-2 text-body text-text-muted">
          Earlier snapshots stay unchanged. Opening one and saving creates the
          next sequential version.
        </p>
        <ol className="mt-component space-y-component">
          {versions.map((version) => (
            <Surface as="li" key={version.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <SectionHeader
                    level={3}
                    size="card"
                    title={
                      <>
                        Version {version.versionNumber}{" "}
                        {version.isCurrent ? "— Current" : "— Historical"}
                      </>
                    }
                  />
                  <p className="mt-1 font-mono text-supporting text-text-muted">
                    Created {new Date(version.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={{
                      pathname: "/configure/",
                      query: { project: projectId, version: version.id },
                    }}
                    className={buttonClasses({
                      element: "link",
                      size: "compact",
                      variant: "secondary",
                    })}
                  >
                    Open as editing basis
                  </Link>
                  <Link
                    href={{
                      pathname: "/commerce/",
                      query: { version: version.id },
                    }}
                    className={buttonClasses({
                      className: "border-brand text-brand",
                      element: "link",
                      size: "compact",
                      variant: "secondary",
                    })}
                  >
                    Estimate demo price
                  </Link>
                  <Button
                    size="compact"
                    variant="secondary"
                    onClick={() => void createShare(version)}
                  >
                    Create read-only share
                  </Button>
                </div>
              </div>
              <div className="mt-component border-t border-dashed border-border-strong pt-component">
                <ConfigurationReadonly configuration={version.configuration} />
              </div>
            </Surface>
          ))}
        </ol>
      </section>

      {detail.activeShares.length ? (
        <Surface as="section">
          <SectionHeader title="Active read-only shares" />
          <ul className="mt-3 divide-y divide-dashed divide-border-strong">
            {detail.activeShares.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-col gap-2 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-mono text-supporting">
                  Version {grant.versionNumber} · Created{" "}
                  {new Date(grant.createdAt).toLocaleString()}
                </span>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={async () => {
                    try {
                      setActionError(null);
                      setActionStatus(null);
                      await accountApi.revokeShare(token, projectId, grant.id);
                      setShareUrl(null);
                      await load();
                      setActionStatus(
                        `Share for version ${grant.versionNumber} revoked.`,
                      );
                      focusLater(() => actionStatusRef.current);
                    } catch (error) {
                      setActionError(errorMessage(error));
                    }
                  }}
                >
                  Revoke share
                </Button>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      <Surface as="section" tone="danger" elevation="flat">
        <SectionHeader title="Delete project" />
        <p className="mt-2 text-body text-text-muted">
          This permanently deletes the project, every saved version, and every
          project share. It does not delete your account or public designs
          created without an account.
        </p>
        {!confirmDelete ? (
          <Button
            ref={deleteButtonRef}
            className="mt-3"
            variant="secondary"
            onClick={openDeleteReview}
          >
            Review project deletion
          </Button>
        ) : (
          <div
            className="mt-3 flex flex-wrap gap-3"
            role="group"
            aria-label="Confirm project deletion"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeDeleteReview();
              }
            }}
          >
            <Button
              ref={confirmDeleteButtonRef}
              onClick={() => void removeProject()}
            >
              Permanently delete project
            </Button>
            <Button variant="secondary" onClick={closeDeleteReview}>
              Cancel
            </Button>
          </div>
        )}
      </Surface>
    </div>
  );
}

// A signed-in visitor with a design in this browser that was never saved.
function UnsavedDraftNotice() {
  const draft = useSyncExternalStore(
    subscribeToDraft,
    getDraftSnapshot,
    getServerDraftSnapshot,
  );
  if (!draftHasDesign(draft) || draft?.project) return null;
  return (
    <Notice className="mb-component" title="Design in progress">
      <p>
        This browser has a design that isn&apos;t in My projects yet. Open it
        and choose Save to a private project on its Review stage.
      </p>
      <TextLink href="/configure/">Continue your design</TextLink>
    </Notice>
  );
}

export function ProjectsScreen() {
  const { state } = useAuth();
  const projectId = useSearchParams().get("project");
  if (state.status === "initializing")
    return <LoadingState label="Restoring your session…" />;
  if (state.status === "guest")
    return (
      <GuestEmptyState
        title="Your projects will appear here"
        description={
          <p>
            Save a design from its Review stage and it appears here, with its
            version history and read-only links you can revoke. You&apos;ll be
            asked to sign in or create an account then.
          </p>
        }
        returnTo="projects"
        signInLabel="Sign in to see your projects"
      />
    );
  return projectId ? (
    <ProjectView token={state.token} projectId={projectId} />
  ) : (
    <>
      <UnsavedDraftNotice />
      <ProjectList token={state.token} />
    </>
  );
}
