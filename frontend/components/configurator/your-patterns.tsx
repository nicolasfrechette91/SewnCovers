"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { InlineSignIn } from "@/components/account/inline-sign-in";
import {
  Button,
  cardTitleClasses,
  Checkbox,
  ErrorMessage,
  Field,
  fieldLabelClasses,
  LoadingState,
  StitchDivider,
  TextInput,
  useDeferredFocus,
  Surface,
  EmptyState,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useConfiguration } from "@/context/configuration";
import {
  accountApi,
  AccountApiError,
  performUpload,
  resolveAssetUrl,
  sha256File,
  type CustomUpload,
} from "@/services/account-api";
import { assuranceApi } from "@/services/assurance-api";
import { useUploadAvailability } from "@/services/upload-availability";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;
const POLL_DELAYS = [2_000, 3_000, 5_000, 8_000, 10_000] as const;

const stateLabels: Readonly<Record<CustomUpload["state"], string>> = {
  awaiting_upload: "Awaiting upload",
  uploaded: "Queued for processing",
  processing: "Processing",
  awaiting_moderation: "Awaiting moderation",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Processing failed",
  deleted: "Deleted",
  expired: "Upload expired",
};

function defaultLabel(file: File): string {
  return (
    file.name
      .replace(/\.[^.]+$/, "")
      .trim()
      .slice(0, 120) || "My pattern"
  );
}

async function validateImage(
  file: File,
  url: string,
): Promise<{ height: number; url: string; width: number }> {
  if (!ALLOWED_TYPES.has(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size < 1 || file.size > MAX_BYTES)
    throw new Error("Choose an image no larger than 10 MB.");
  const dimensions = await new Promise<{ height: number; width: number }>(
    (resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ height: image.naturalHeight, width: image.naturalWidth });
      image.onerror = () =>
        reject(new Error("The browser could not preview this image."));
      image.src = url;
    },
  );
  if (
    dimensions.width < 64 ||
    dimensions.height < 64 ||
    dimensions.width > 4096 ||
    dimensions.height > 4096 ||
    dimensions.width * dimensions.height > 16_000_000
  ) {
    throw new Error(
      "Image dimensions must be 64–4096 px per side and at most 16 million pixels.",
    );
  }
  return { ...dimensions, url };
}

export function YourPatterns() {
  const { state: auth } = useAuth();
  const { state: configuration, dispatch } = useConfiguration();
  // Fails closed: only a successful "enabled: true" answer offers uploads.
  const availability = useUploadAvailability();
  const uploadsOffered = availability === "enabled";
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const pendingValidationUrls = useRef(new Set<string>());
  const currentValidationUrl = useRef<string | null>(null);
  const [uploads, setUploads] = useState<readonly CustomUpload[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "uploading">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error`: a list that arrives late must not clear a
  // message about the chosen file or an action.
  const [listError, setListError] = useState<string | null>(null);
  const [rightsAcknowledged, setRightsAcknowledged] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const uploadActionRef = useRef<HTMLButtonElement>(null);
  const returnFocusToUpload = useRef(false);
  // The upload being renamed or deleted, with the inline question it shows.
  const [editing, setEditing] = useState<{
    id: string;
    kind: "rename" | "delete";
    draft: string;
  } | null>(null);
  const focusLater = useDeferredFocus();

  // "Continue with our patterns" puts focus back on the action that opened sign-in.
  useEffect(() => {
    if (signInOpen || !returnFocusToUpload.current) return;
    returnFocusToUpload.current = false;
    uploadActionRef.current?.focus();
  }, [signInOpen]);

  const load = useCallback(async () => {
    if (auth.status !== "authenticated" || !uploadsOffered) return;
    setPhase("loading");
    try {
      setUploads(await accountApi.listUploads(auth.token));
      setListError(null);
    } catch (caught) {
      setListError(
        caught instanceof AccountApiError
          ? caught.message
          : "Your patterns could not be loaded.",
      );
    } finally {
      setPhase("idle");
    }
  }, [auth, uploadsOffered]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );
  useEffect(
    () => () => {
      pendingValidationUrls.current.forEach((url) => URL.revokeObjectURL(url));
      pendingValidationUrls.current.clear();
    },
    [],
  );

  const chooseFile = async (next: File | null) => {
    currentValidationUrl.current = null;
    setError(null);
    setLocalPreview(null);
    setFile(null);
    setDimensions(null);
    if (!next) return;
    const validationUrl = URL.createObjectURL(next);
    currentValidationUrl.current = validationUrl;
    pendingValidationUrls.current.add(validationUrl);
    try {
      const preview = await validateImage(next, validationUrl);
      if (currentValidationUrl.current !== validationUrl) {
        if (pendingValidationUrls.current.delete(preview.url)) {
          URL.revokeObjectURL(preview.url);
        }
        return;
      }
      currentValidationUrl.current = null;
      pendingValidationUrls.current.delete(preview.url);
      setFile(next);
      setLabel(defaultLabel(next));
      setLocalPreview(preview.url);
      setDimensions(`${preview.width} × ${preview.height} px`);
      setMessage(
        "Local repeat preview ready. The full image will be retained; no silent crop is applied.",
      );
    } catch (caught) {
      if (pendingValidationUrls.current.delete(validationUrl)) {
        URL.revokeObjectURL(validationUrl);
      }
      if (currentValidationUrl.current !== validationUrl) return;
      currentValidationUrl.current = null;
      setError(
        caught instanceof Error ? caught.message : "Choose a valid image.",
      );
      focusLater(() => fileInput.current);
    }
  };

  const poll = async (uploadId: string, attempt = 0): Promise<void> => {
    if (auth.status !== "authenticated") return;
    const current = await accountApi.getUpload(auth.token, uploadId);
    setUploads((items) => [
      current,
      ...items.filter((item) => item.id !== current.id),
    ]);
    if (
      ["uploaded", "processing", "awaiting_moderation"].includes(
        current.state,
      ) &&
      attempt < 20
    ) {
      globalThis.setTimeout(
        () => void poll(uploadId, attempt + 1),
        POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)],
      );
    }
  };

  const upload = async () => {
    if (auth.status !== "authenticated" || !file || !label.trim()) return;
    if (!rightsAcknowledged) {
      setError("Acknowledge upload notice version 1 before uploading.");
      return;
    }
    setPhase("uploading");
    setError(null);
    setMessage("Preparing your private upload…");
    try {
      await assuranceApi.acknowledge(auth.token, "uploads", "upload_rights");
      const intent = await accountApi.createUploadIntent(
        auth.token,
        label.trim(),
        file,
      );
      setMessage("Uploading your image…");
      await performUpload(intent.upload, file);
      setMessage("Upload complete. Preparing the image for review…");
      const confirmed = await accountApi.confirmUpload(
        auth.token,
        intent.id,
        await sha256File(file),
      );
      setUploads((items) => [
        confirmed,
        ...items.filter((item) => item.id !== confirmed.id),
      ]);
      setFile(null);
      setLocalPreview(null);
      setDimensions(null);
      setLabel("");
      setRightsAcknowledged(false);
      setMessage(
        "Upload received. Processing and moderation will continue in the background.",
      );
      focusLater(() => statusRef.current);
      void poll(intent.id);
    } catch (caught) {
      setError(
        caught instanceof AccountApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "The upload could not be completed.",
      );
      focusLater(() => fileInput.current);
    } finally {
      setPhase("idle");
    }
  };

  const select = async (item: CustomUpload) => {
    if (
      auth.status !== "authenticated" ||
      !item.tileDerivativeId ||
      item.state !== "approved"
    )
      return;
    try {
      const access = await accountApi.assetAccess(auth.token, item.id, "tile");
      dispatch({
        type: "setCustomPattern",
        pattern: {
          kind: "custom",
          assetId: item.id,
          derivativeId: item.tileDerivativeId,
          processingVersion: item.processingVersion,
          label: item.label,
          previewUrl: resolveAssetUrl(access.url),
        },
      });
      setMessage(
        `${item.label} selected for this private project configuration.`,
      );
    } catch (caught) {
      setError(
        caught instanceof AccountApiError
          ? caught.message
          : "The approved pattern could not be opened.",
      );
    }
  };

  const retry = async (item: CustomUpload) => {
    if (auth.status !== "authenticated") return;
    try {
      await accountApi.retryUpload(auth.token, item.id);
      setMessage("Retry queued.");
      void poll(item.id);
    } catch (caught) {
      setError(
        caught instanceof AccountApiError
          ? caught.message
          : "Retry could not be queued.",
      );
    }
  };

  // Each question replaces the button that opened it: focus enters at its
  // first control, and leaving without confirming returns to the opener.
  const itemControlId = (control: string, item: CustomUpload) =>
    `${id}-${control}-${item.id}`;
  const startRename = (item: CustomUpload) => {
    setEditing({ id: item.id, kind: "rename", draft: item.label });
    focusLater(() => document.getElementById(itemControlId("label", item)));
  };
  const startDelete = (item: CustomUpload) => {
    setEditing({ id: item.id, kind: "delete", draft: "" });
    focusLater(() => document.getElementById(itemControlId("keep", item)));
  };
  const cancelEditing = (item: CustomUpload, opener: "rename" | "delete") => {
    setEditing(null);
    focusLater(() => document.getElementById(itemControlId(opener, item)));
  };

  const rename = async (item: CustomUpload, draft: string) => {
    if (auth.status !== "authenticated") return;
    const next = draft.trim();
    if (!next || next === item.label) {
      cancelEditing(item, "rename");
      return;
    }
    try {
      const updated = await accountApi.renameUpload(auth.token, item.id, next);
      setUploads((items) =>
        items.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setEditing(null);
      setMessage("Pattern label updated.");
      focusLater(() => statusRef.current);
    } catch (caught) {
      setError(
        caught instanceof AccountApiError
          ? caught.message
          : "The pattern label could not be updated.",
      );
      focusLater(() => document.getElementById(itemControlId("label", item)));
    }
  };

  const deleteWarning = (item: CustomUpload) =>
    item.referencedByVersions > 0
      ? `This pattern is referenced by ${item.referencedByVersions} saved version${item.referencedByVersions === 1 ? "" : "s"}. Those versions will show “custom asset deleted.” Delete it anyway?`
      : "Delete this custom pattern? It will no longer be available in the configurator.";

  const remove = async (item: CustomUpload) => {
    if (auth.status !== "authenticated") return;
    try {
      await accountApi.deleteUpload(auth.token, item.id);
      if (
        configuration.pattern?.kind === "custom" &&
        configuration.pattern.assetId === item.id
      ) {
        dispatch({
          type: "setCustomPattern",
          pattern: {
            ...configuration.pattern,
            previewUrl: null,
            unavailableReason: "deleted",
          },
        });
      }
      await load();
      setEditing(null);
      setMessage(
        "Custom pattern deleted. It will no longer appear in saved projects or previews.",
      );
      focusLater(() => statusRef.current);
    } catch (caught) {
      setError(
        caught instanceof AccountApiError
          ? caught.message
          : "The custom pattern could not be deleted.",
      );
      cancelEditing(item, "delete");
    }
  };

  // No answer yet, or no answer at all (failure or timeout): show nothing,
  // neither the upload nor a claim that uploads are off.
  if (availability === "checking" || availability === "unknown") return null;

  if (availability === "disabled") {
    return (
      <section aria-labelledby={`${id}-heading`} className="mt-layout">
        <StitchDivider className="mb-component" />
        <h2 id={`${id}-heading`} className={cardTitleClasses}>
          Your patterns
        </h2>
        <p className="mt-3 max-w-reading text-supporting text-text-muted">
          Custom uploads aren&apos;t enabled in this demo.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-layout">
      <StitchDivider className="mb-component" />
      <h2 id={`${id}-heading`} className={cardTitleClasses}>
        Your patterns
      </h2>
      {auth.status === "guest" && !signInOpen ? (
        <div className="mt-3 flex min-w-0 flex-col items-start gap-3">
          <p className="max-w-reading text-supporting text-text-muted">
            Upload your own image to use as a pattern. You&apos;ll need an
            account.
          </p>
          <Button
            ref={uploadActionRef}
            variant="secondary"
            onClick={() => setSignInOpen(true)}
          >
            Upload your own pattern
          </Button>
        </div>
      ) : null}
      {auth.status === "guest" && signInOpen ? (
        <InlineSignIn
          idPrefix="upload"
          headingLevel="h3"
          titles={{
            login: "Sign in to upload your own pattern",
            register: "Create an account to upload your own pattern",
          }}
          reason={
            <p>
              Your uploads are private to your account. Your design stays as it
              is while you sign in.
            </p>
          }
          submitLabels={{ login: "Sign in", register: "Create account" }}
          sessionNotice={auth.notice}
          cancelLabel="Continue with our patterns"
          guestNote="Every pattern and plain colour here works without an account."
          onCancel={() => {
            returnFocusToUpload.current = true;
            setSignInOpen(false);
          }}
          onSignedIn={() => {
            setSignInOpen(false);
            setMessage("Signed in. You can upload your own pattern below.");
            focusLater(() => statusRef.current);
          }}
        />
      ) : null}
      {auth.status === "initializing" ? (
        <LoadingState
          className="mt-3"
          label="Waking your private pattern workspace…"
        />
      ) : null}
      {auth.status === "authenticated" ? (
        <>
          <p className="mt-3 text-supporting text-text-muted">
            JPEG, PNG, or WebP; 1 byte–10 MB; 64–4096 px per side; one still
            frame; at most 16 million pixels. Your original stays private. If
            external moderation is available, a processed copy may be checked
            before you can use the pattern.
          </p>
          <Checkbox
            className="mt-3"
            checked={rightsAcknowledged}
            onChange={(event) =>
              setRightsAcknowledged(event.currentTarget.checked)
            }
            label="I acknowledge upload notice version 1: I have permission to use this image; configured external moderation may process it; automated approval does not guarantee safety, legality, or ownership; deletion stops project rendering while a protected paid-order copy may be retained."
          />
          <div
            className="cutting-mat mt-4 rounded-card border border-dashed border-border-strong p-4 sm:p-5"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              void chooseFile(event.dataTransfer.files[0] ?? null);
            }}
          >
            <Field
              help="You can also drop one file in this bordered area."
              id={`${id}-file`}
              label="Choose a pattern image"
            >
              {(control) => (
                <input
                  {...control}
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block min-h-11 w-full max-w-full text-body text-text-primary file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border file:border-border-strong file:bg-surface file:px-4 file:font-control file:text-text-primary hover:file:border-brand hover:file:text-brand"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    void chooseFile(event.target.files?.[0] ?? null)
                  }
                />
              )}
            </Field>
          </div>
          {localPreview ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Field
                  help={`${dimensions}. The complete image is used without cropping.`}
                  id={`${id}-label`}
                  label="Pattern label"
                >
                  {(control) => (
                    <TextInput
                      {...control}
                      value={label}
                      maxLength={120}
                      onChange={(event) => setLabel(event.target.value)}
                    />
                  )}
                </Field>
                <Button
                  className="mt-3"
                  isLoading={phase === "uploading"}
                  loadingLabel="Uploading pattern…"
                  onClick={() => void upload()}
                >
                  Upload for review
                </Button>
              </div>
              <div>
                <p className={fieldLabelClasses}>Live repeating preview</p>
                <div
                  className="mt-2 aspect-square max-w-64 rounded-card border border-border-strong shadow-card"
                  style={{
                    backgroundImage: `url("${localPreview}")`,
                    backgroundRepeat: "repeat",
                    backgroundSize: "45% auto",
                  }}
                  role="img"
                  aria-label="Repeating preview of the selected local image"
                />
              </div>
            </div>
          ) : null}
          {phase === "loading" ? (
            <LoadingState className="mt-4" label="Loading your patterns…" />
          ) : null}
          {listError ? (
            <ErrorMessage className="mt-4">{listError}</ErrorMessage>
          ) : null}
          {error ? <ErrorMessage className="mt-4">{error}</ErrorMessage> : null}
          {message ? (
            <p
              ref={statusRef}
              tabIndex={-1}
              role="status"
              aria-live="polite"
              className="mt-4 text-supporting text-text-muted"
            >
              {message}
            </p>
          ) : null}
          {uploads.length > 0 ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {uploads.map((item) => {
                const editable =
                  item.state !== "deleted" && item.state !== "expired";
                const question = editing?.id === item.id ? editing : null;
                const escapeToCancel =
                  (opener: "rename" | "delete") =>
                  (event: KeyboardEvent<HTMLElement>) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEditing(item, opener);
                    }
                  };
                return (
                  <Surface
                    as="li"
                    padding="compact"
                    radius="card"
                    key={item.id}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-control">{item.label}</p>
                        <p className="mt-1 text-supporting text-text-muted">
                          {stateLabels[item.state]}
                          {item.moderationState === "unavailable"
                            ? " — moderation is unavailable, so this image cannot be approved"
                            : ""}
                        </p>
                      </div>
                      {item.state === "approved" ? (
                        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control has-focus-visible:outline has-focus-visible:outline-2">
                          <input
                            className="size-5 accent-brand"
                            type="radio"
                            name="cushion-pattern"
                            aria-label={`Select custom pattern ${item.label}`}
                            checked={
                              configuration.pattern?.kind === "custom" &&
                              configuration.pattern.assetId === item.id
                            }
                            onChange={() => void select(item)}
                          />
                        </label>
                      ) : null}
                    </div>
                    {question?.kind === "rename" ? (
                      <form
                        className="mt-3 grid min-w-0 gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void rename(item, question.draft);
                        }}
                        onKeyDown={escapeToCancel("rename")}
                      >
                        <Field
                          id={itemControlId("label", item)}
                          label="New pattern label"
                        >
                          {(control) => (
                            <TextInput
                              {...control}
                              value={question.draft}
                              maxLength={120}
                              required
                              onChange={(event) =>
                                setEditing({
                                  ...question,
                                  draft: event.target.value,
                                })
                              }
                            />
                          )}
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="compact">
                            Save label
                          </Button>
                          <Button
                            type="button"
                            size="compact"
                            variant="secondary"
                            onClick={() => cancelEditing(item, "rename")}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : question?.kind === "delete" ? (
                      <Surface
                        tone="danger"
                        elevation="flat"
                        padding="tight"
                        radius="card"
                        className="mt-3"
                        role="group"
                        aria-labelledby={itemControlId("warning", item)}
                        onKeyDown={escapeToCancel("delete")}
                      >
                        <p
                          id={itemControlId("warning", item)}
                          className="break-words text-supporting text-text-primary"
                        >
                          {deleteWarning(item)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            id={itemControlId("keep", item)}
                            size="compact"
                            variant="secondary"
                            onClick={() => cancelEditing(item, "delete")}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="compact"
                            onClick={() => void remove(item)}
                          >
                            Delete pattern
                          </Button>
                        </div>
                      </Surface>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {editable ? (
                          <Button
                            id={itemControlId("rename", item)}
                            variant="secondary"
                            onClick={() => startRename(item)}
                          >
                            Rename
                          </Button>
                        ) : null}
                        {item.retryEligible ? (
                          <Button
                            variant="secondary"
                            onClick={() => void retry(item)}
                          >
                            Retry
                          </Button>
                        ) : null}
                        {editable ? (
                          <Button
                            id={itemControlId("delete", item)}
                            variant="secondary"
                            onClick={() => startDelete(item)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </Surface>
                );
              })}
            </ul>
          ) : phase !== "loading" ? (
            <EmptyState
              align="start"
              className="mt-4"
              description="No custom patterns yet."
              size="compact"
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
