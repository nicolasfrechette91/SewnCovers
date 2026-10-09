"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { InlineSignIn } from "@/components/account/inline-sign-in";
import {
  Button,
  ErrorMessage,
  Field,
  textLinkClasses,
  TextInput,
  useDeferredFocus,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import type { ConfigurationState } from "@/context/configuration";
import {
  accountApi,
  AccountApiError,
  type ProjectDetail,
} from "@/services/account-api";
import { commerceApi } from "@/services/commerce-api";
import {
  clearPendingAccountAction,
  getDraftSnapshot,
  getServerDraftSnapshot,
  readDraft,
  setPendingAccountAction,
  subscribeToDraft,
  takePendingAccountAction,
  writeDraft,
  type PendingAccountActionKind,
} from "@/services/configurator-draft";
import { mapConfigurationToProjectConfiguration } from "@/services/design-save";
import { designFingerprint } from "@/services/draft-links";

interface LinkedProject {
  readonly projectId: string;
  readonly name: string;
  readonly currentFingerprint: string;
  readonly versionNumber: number;
}

interface SavedProject {
  readonly projectId: string;
  readonly versionId: string;
  readonly message: string;
  /** False when the design was already saved as the current version. */
  readonly changed: boolean;
}

interface Outcome {
  readonly message: string;
  readonly projectId: string | null;
  readonly cart: boolean;
}

class ProjectNameRequiredError extends Error {}

const SIGN_IN_COPY = {
  save: {
    titles: {
      login: "Sign in to save this design",
      register: "Create an account to save this design",
    },
    submitLabels: {
      login: "Sign in and save",
      register: "Create account and save",
    },
    reason:
      "Projects are kept in your account. Your design stays in this browser and is saved as soon as you sign in.",
  },
  cart: {
    titles: {
      login: "Sign in to add this design to your cart",
      register: "Create an account to add it to your cart",
    },
    submitLabels: {
      login: "Sign in and add to cart",
      register: "Create account and add to cart",
    },
    reason:
      "The cart belongs to your account. Once you sign in, this design is saved and added to it.",
  },
} as const;

// One save at a time, across remounts and React's development double effects.
let actionInFlight = false;

function isMissingProject(error: unknown): boolean {
  return (
    error instanceof AccountApiError &&
    (error.status === 403 || error.status === 404)
  );
}

function linkedFrom(project: ProjectDetail): LinkedProject {
  return {
    projectId: project.id,
    name: project.name,
    currentFingerprint: designFingerprint(project.currentVersion.configuration),
    versionNumber: project.currentVersion.versionNumber,
  };
}

export function PrivateProjectPanel({
  configuration,
  defaultName = "",
  onSavingChange,
}: Readonly<{
  configuration: ConfigurationState;
  /** Used when the name is left empty, so saving never stops to ask for one. */
  defaultName?: string;
  onSavingChange?: (saving: boolean) => void;
}>) {
  const { state: auth } = useAuth();
  const draft = useSyncExternalStore(
    subscribeToDraft,
    getDraftSnapshot,
    getServerDraftSnapshot,
  );
  const link = draft?.project ?? null;
  const fingerprint = designFingerprint(configuration);
  const token = auth.status === "authenticated" ? auth.token : null;
  const [linked, setLinked] = useState<LinkedProject | null>(null);
  const [name, setName] = useState(defaultName);
  const [signInFor, setSignInFor] = useState<PendingAccountActionKind | null>(
    null,
  );
  const [busy, setBusy] = useState<PendingAccountActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<PendingAccountActionKind | null>(null);
  const focusLater = useDeferredFocus();
  const linkedProjectId = link?.projectId ?? null;
  const verified =
    linked !== null && linked.projectId === linkedProjectId ? linked : null;
  const savedAndUnchanged =
    verified !== null && verified.currentFingerprint === fingerprint;

  // A draft linked to a project: confirm it still belongs to this account
  // and learn its name. A project that's gone (or another account's) is
  // unlinked, so the next save creates a new one.
  useEffect(() => {
    if (!token || !linkedProjectId) return;
    let cancelled = false;
    const timer = globalThis.setTimeout(async () => {
      try {
        const project = await accountApi.getProject(token, linkedProjectId);
        if (!cancelled) setLinked(linkedFrom(project));
      } catch (caught) {
        if (!cancelled && isMissingProject(caught))
          writeDraft({ project: null, cart: null });
      }
    }, 0);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [linkedProjectId, token]);

  // Saves to the linked project when there is one (a new version only if the
  // design changed), otherwise creates a project and links the draft to it,
  // so saving again never creates a duplicate.
  const ensureSaved = async (
    sessionToken: string,
    projectName: string,
  ): Promise<SavedProject> => {
    const snapshot = mapConfigurationToProjectConfiguration(configuration);
    const current = readDraft()?.project ?? null;
    if (current) {
      let project: ProjectDetail | null = null;
      try {
        project = await accountApi.getProject(sessionToken, current.projectId);
      } catch (caught) {
        if (!isMissingProject(caught)) throw caught;
        writeDraft({ project: null, cart: null });
      }
      if (project) {
        if (
          designFingerprint(project.currentVersion.configuration) ===
          fingerprint
        ) {
          writeDraft({
            project: {
              projectId: project.id,
              versionId: project.currentVersion.id,
              fingerprint,
            },
          });
          setLinked(linkedFrom(project));
          return {
            projectId: project.id,
            versionId: project.currentVersion.id,
            message: `Already saved in My projects as “${project.name}”, version ${project.currentVersion.versionNumber}.`,
            changed: false,
          };
        }
        const version = await accountApi.createVersion(
          sessionToken,
          project.id,
          snapshot,
        );
        writeDraft({
          project: {
            projectId: project.id,
            versionId: version.id,
            fingerprint,
          },
        });
        setLinked({
          projectId: project.id,
          name: project.name,
          currentFingerprint: fingerprint,
          versionNumber: version.versionNumber,
        });
        return {
          projectId: project.id,
          versionId: version.id,
          message: `Version ${version.versionNumber} saved without changing earlier history.`,
          changed: true,
        };
      }
    }
    const trimmed = projectName.trim();
    if (!trimmed) throw new ProjectNameRequiredError();
    const project = await accountApi.createProject(
      sessionToken,
      trimmed,
      snapshot,
    );
    writeDraft({
      project: {
        projectId: project.id,
        versionId: project.currentVersion.id,
        fingerprint,
      },
      cart: null,
    });
    setLinked({ ...linkedFrom(project), currentFingerprint: fingerprint });
    return {
      projectId: project.id,
      versionId: project.currentVersion.id,
      message: "Private project created with version 1.",
      changed: true,
    };
  };

  // Quotes are priced from a saved version. A version already in the cart is
  // never added twice; an earlier quote for it is reused while still valid.
  const addToCart = async (
    sessionToken: string,
    saved: SavedProject,
  ): Promise<string> => {
    const cart = await commerceApi.cart(sessionToken);
    if (
      cart.lines.some((line) => line.quote.projectVersionId === saved.versionId)
    ) {
      return "This design is already in your demonstration cart.";
    }
    const marker = readDraft()?.cart ?? null;
    let quoteId: string | null = null;
    if (marker && marker.versionId === saved.versionId) {
      try {
        const quote = await commerceApi.quote(sessionToken, marker.quoteId);
        if (quote.status === "active" && quote.canCheckout) quoteId = quote.id;
      } catch {
        // Create a fresh quote below.
      }
    }
    if (!quoteId) {
      const quote = await commerceApi.createQuote(
        sessionToken,
        saved.versionId,
        1,
      );
      quoteId = quote.id;
      writeDraft({ cart: { versionId: saved.versionId, quoteId } });
    }
    await commerceApi.addQuote(sessionToken, quoteId);
    return "Added to your demonstration cart as a fictional quote.";
  };

  const run = async (
    kind: PendingAccountActionKind,
    projectName: string,
    sessionToken: string,
  ) => {
    if (actionInFlight) return;
    actionInFlight = true;
    setBusy(kind);
    onSavingChange?.(true);
    setError(null);
    setOutcome(null);
    focusLater(() => statusRef.current);
    let saved: SavedProject | null = null;
    try {
      saved = await ensureSaved(sessionToken, projectName);
      const cartMessage =
        kind === "cart" ? await addToCart(sessionToken, saved) : null;
      const message =
        cartMessage === null
          ? saved.message
          : saved.changed
            ? `${saved.message} ${cartMessage}`
            : cartMessage;
      setOutcome({
        message,
        projectId: saved.projectId,
        cart: kind === "cart",
      });
      focusLater(() => statusRef.current);
    } catch (caught) {
      if (caught instanceof ProjectNameRequiredError) {
        setError("Enter a project name.");
        focusLater(() => nameRef.current);
      } else {
        const reason =
          caught instanceof AccountApiError
            ? caught.message
            : "The request could not be completed. Try again.";
        setError(
          saved
            ? `The demonstration cart could not be updated. ${reason}`
            : reason,
        );
        if (saved)
          setOutcome({
            message: saved.message,
            projectId: saved.projectId,
            cart: false,
          });
        focusLater(() => statusRef.current);
      }
    } finally {
      actionInFlight = false;
      setBusy(null);
      onSavingChange?.(false);
    }
  };

  // Resume the Save or Add to cart that asked for sign-in, exactly once:
  // the pending record is removed as it is read. The timer is not cancelled
  // on cleanup, so a taken action always runs.
  useEffect(() => {
    if (!token) return;
    const action = takePendingAccountAction(fingerprint);
    if (!action) return;
    globalThis.setTimeout(() => {
      setSignInFor(null);
      void run(action.kind, action.name, token);
    }, 0);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (kind: PendingAccountActionKind) => {
    if (auth.status === "initializing" || busy !== null) return;
    setError(null);
    setOutcome(null);
    // An emptied name falls back to the suggested one, so a guest goes
    // straight to sign-in and the resumed save has a name to use.
    const projectName = name.trim() || defaultName.trim();
    if (!link && !projectName) {
      setError("Enter a project name.");
      focusLater(() => nameRef.current);
      return;
    }
    if (token) {
      void run(kind, projectName, token);
      return;
    }
    setPendingAccountAction({ kind, name: projectName, fingerprint });
    setSignInFor(kind);
  };

  // "Continue as guest" puts focus back on the button that opened sign-in.
  useEffect(() => {
    if (signInFor !== null || returnFocusTo.current === null) return;
    const opener =
      returnFocusTo.current === "save" ? saveButtonRef.current : null;
    returnFocusTo.current = null;
    (opener ?? cartButtonRef.current)?.focus();
  }, [signInFor]);

  const continueAsGuest = () => {
    clearPendingAccountAction();
    returnFocusTo.current = signInFor;
    setSignInFor(null);
  };

  const heading = !link
    ? "Save to My projects"
    : savedAndUnchanged
      ? "Saved to My projects"
      : "Save a new version";
  const description = !link
    ? "Keep this design in your account and come back to it later. Only you can see it unless you share it."
    : savedAndUnchanged && verified
      ? `This design is saved as “${verified.name}”. If you change it, saving adds the next version and leaves earlier versions unchanged.`
      : verified
        ? `Linked to “${verified.name}” in My projects. Saving adds the next version and leaves earlier versions unchanged.`
        : "This design is linked to a project in My projects. Saving adds the next version and leaves earlier versions unchanged.";
  const statusText =
    busy === "cart"
      ? "Saving your design and adding it to the cart…"
      : busy === "save"
        ? "Saving your design to My projects…"
        : (outcome?.message ?? "");
  const copy = signInFor ? SIGN_IN_COPY[signInFor] : null;

  return (
    <Surface
      as="section"
      aria-labelledby="private-project-heading"
      className="print-hidden mt-layout"
    >
      <p className="eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">
        Your account
      </p>
      <h2
        id="private-project-heading"
        className="mt-3 font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        {heading}
      </h2>
      <p className="mt-3 max-w-3xl text-body text-text-muted">{description}</p>
      {auth.status === "initializing" ? (
        <p className="mt-3" role="status">
          Restoring your session…
        </p>
      ) : null}
      <form
        className="mt-4"
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          start("save");
        }}
      >
        {!link ? (
          <>
            <Field id="private-project-name" label="Project name">
              {(control) => (
                <TextInput
                  {...control}
                  ref={nameRef}
                  name="name"
                  required
                  maxLength={120}
                  value={name}
                  readOnly={busy !== null || signInFor !== null}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
          </>
        ) : null}
        {savedAndUnchanged && verified && !outcome && busy === null ? (
          <p className="mt-3 max-w-3xl text-supporting text-text-muted">
            This design matches version {verified.versionNumber}, the current
            version.
          </p>
        ) : null}
        {error ? <ErrorMessage className="mt-3">{error}</ErrorMessage> : null}
        <p
          ref={statusRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className={statusText ? "mt-3 text-body font-emphasis" : "sr-only"}
        >
          {statusText}
        </p>
        {outcome?.projectId || (savedAndUnchanged && verified) ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href={{
                pathname: "/projects/",
                query: { project: outcome?.projectId ?? verified?.projectId },
              }}
              className={textLinkClasses}
            >
              Open saved project
            </Link>
            {outcome?.cart ? (
              <Link href="/cart/" className={textLinkClasses}>
                View cart
              </Link>
            ) : null}
          </div>
        ) : null}
        {signInFor === null ? (
          <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
            {!savedAndUnchanged ? (
              <Button
                ref={saveButtonRef}
                type="submit"
                disabled={auth.status === "initializing" || busy === "cart"}
                isLoading={busy === "save"}
                loadingLabel="Saving private version…"
              >
                {link ? "Save as new version" : "Save to My projects"}
              </Button>
            ) : null}
            <Button
              ref={cartButtonRef}
              variant="secondary"
              disabled={auth.status === "initializing" || busy === "save"}
              isLoading={busy === "cart"}
              loadingLabel="Adding to cart…"
              onClick={() => start("cart")}
            >
              {savedAndUnchanged ? "Add to cart" : "Save and add to cart"}
            </Button>
          </div>
        ) : null}
        {auth.status === "guest" && signInFor === null ? (
          <p className="mt-3 max-w-3xl text-supporting text-text-muted">
            You&apos;ll be asked to sign in or create an account next. Your
            design stays in this browser either way.
          </p>
        ) : null}
      </form>
      {auth.status === "guest" && copy ? (
        <InlineSignIn
          idPrefix={`private-${signInFor}`}
          headingLevel="h3"
          titles={copy.titles}
          reason={<p>{copy.reason}</p>}
          submitLabels={copy.submitLabels}
          sessionNotice={auth.notice}
          guestNote="Your design stays in this browser. You can still create a public link above, or print or download the summary."
          onCancel={continueAsGuest}
        />
      ) : null}
    </Surface>
  );
}
