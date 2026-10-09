"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button, ErrorMessage, Field, TextInput } from "@/components/ui";
import type { ConfigurationState } from "@/context/configuration";
import { apiClient } from "@/services/api-client";
import { recordPublicDesign } from "@/services/draft-links";
import {
  buildDesignShareUrl,
  copyDesignShareUrl,
  DesignSaveController,
} from "@/services/design-save";

type CopyState = "copying" | "error" | "idle" | "success";

interface SaveSharePanelProps {
  configuration: ConfigurationState;
  controllerFactory?: () => DesignSaveController;
  onSavingChange?: (saving: boolean) => void;
}

function createShareUrl(publicId: string): string {
  if (typeof window === "undefined") {
    throw new Error("Share links can only be created in the browser.");
  }

  return buildDesignShareUrl(
    publicId,
    window.location.origin,
    process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  );
}

export function SaveSharePanel({
  configuration,
  controllerFactory,
  onSavingChange,
}: SaveSharePanelProps) {
  const controller = useMemo(
    () =>
      controllerFactory?.() ??
      new DesignSaveController(apiClient, createShareUrl),
    [controllerFactory],
  );
  const saveState = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const shareUrlInput = useRef<HTMLInputElement>(null);
  const copyPending = useRef(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const customPatternSelected = configuration.pattern?.kind === "custom";

  useEffect(() => {
    if (saveState.phase !== "success") {
      return;
    }

    shareUrlInput.current?.focus();
    shareUrlInput.current?.select();
  }, [saveState.phase]);

  // Opening this public link later must not be mistaken for replacing work.
  const savedPublicId =
    saveState.phase === "success" ? saveState.publicId : null;
  useEffect(() => {
    if (savedPublicId) recordPublicDesign(savedPublicId, configuration);
  }, [configuration, savedPublicId]);

  const saveDesign = () => {
    onSavingChange?.(true);
    void controller
      .submit(configuration)
      .finally(() => onSavingChange?.(false));
  };

  const copyShareLink = async () => {
    if (saveState.phase !== "success" || copyPending.current) {
      return;
    }

    copyPending.current = true;
    setCopyState("copying");

    try {
      await copyDesignShareUrl(
        saveState.shareUrl,
        typeof navigator === "undefined" ? undefined : navigator.clipboard,
      );
      setCopyState("success");
    } catch {
      setCopyState("error");
      shareUrlInput.current?.focus();
      shareUrlInput.current?.select();
    } finally {
      copyPending.current = false;
    }
  };

  return (
    <section
      aria-labelledby="configuration-save-share-heading"
      className="print-hidden mt-layout min-w-0 rounded-panel border border-brand bg-surface p-card shadow-card"
    >
      <p className="eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">
        Save and share
      </p>
      <h2
        id="configuration-save-share-heading"
        className="mt-3 break-words font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Create a public link
      </h2>
      <p className="mt-3 max-w-3xl break-words text-body text-text-muted">
        Get a link to this design. Anyone with the link can view it, and a saved
        design can&apos;t be changed.
      </p>

      {customPatternSelected ? (
        <p className="mt-component rounded-card border border-border bg-surface-subtle px-5 py-4 text-supporting text-text-primary">
          Public links work with our patterns and plain colours. To share a
          design that uses your own image, save it to a project and share it
          from there.
        </p>
      ) : null}

      {saveState.phase === "idle" && !customPatternSelected ? (
        <Button className="mt-component" onClick={saveDesign}>
          Save and create share link
        </Button>
      ) : null}

      {saveState.phase === "saving" ? (
        <div className="mt-component">
          <Button
            isLoading
            loadingLabel="Saving design\u2026"
            aria-describedby="configuration-save-status"
          >
            Save and create share link
          </Button>
          <p
            id="configuration-save-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-3 break-words text-supporting text-text-muted"
          >
            {saveState.message}
          </p>
        </div>
      ) : null}

      {saveState.phase === "error" ? (
        <div className="mt-component">
          <ErrorMessage>
            <p>{saveState.message}</p>
            <p className="mt-1">Your design is still here.</p>
          </ErrorMessage>
          <Button className="mt-3" onClick={saveDesign}>
            Try saving again
          </Button>
        </div>
      ) : null}

      {saveState.phase === "success" ? (
        <div className="mt-component">
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="break-words text-body font-emphasis text-text-primary"
          >
            {saveState.message}
          </p>
          <Field
            className="mt-4"
            help="Anyone with this link can view this design. It doesn't show your account or projects."
            id="configuration-share-url"
            label="Share URL"
          >
            {(control) => (
              <TextInput
                {...control}
                ref={shareUrlInput}
                type="url"
                value={saveState.shareUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono"
              />
            )}
          </Field>
          <Button
            className="mt-3"
            variant="secondary"
            isLoading={copyState === "copying"}
            loadingLabel="Copying link\u2026"
            aria-describedby="configuration-copy-feedback"
            onClick={() => void copyShareLink()}
          >
            Copy share link
          </Button>
          <div
            id="configuration-copy-feedback"
            aria-live="polite"
            aria-atomic="true"
            className="mt-3"
          >
            {copyState === "success" ? (
              <p
                role="status"
                className="break-words text-supporting text-text-primary"
              >
                Share link copied to your clipboard.
              </p>
            ) : null}
            {copyState === "error" ? (
              <ErrorMessage aria-live="assertive">
                Couldn&apos;t copy the link. It&apos;s selected, so you can copy
                it yourself.
              </ErrorMessage>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
