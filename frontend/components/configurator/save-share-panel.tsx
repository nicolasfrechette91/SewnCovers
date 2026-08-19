"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button, ErrorMessage } from "@/components/ui";
import type { ConfigurationState } from "@/context/configuration";
import { apiClient } from "@/services/api-client";
import {
  buildDesignShareUrl,
  copyDesignShareUrl,
  DesignSaveController,
} from "@/services/design-save";

type CopyState = "copying" | "error" | "idle" | "success";

interface SaveSharePanelProps {
  configuration: ConfigurationState;
  controllerFactory?: () => DesignSaveController;
  onSavingChange: (saving: boolean) => void;
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

  const saveDesign = () => {
    onSavingChange(true);
    void controller
      .submit(configuration)
      .finally(() => onSavingChange(false));
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
        typeof navigator === "undefined"
          ? undefined
          : navigator.clipboard,
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
      className="print-hidden mt-layout min-w-0 rounded-panel border border-brand bg-surface p-card shadow-raised"
    >
      <p className="text-label font-control tracking-label text-accent-strong">
        Save and share
      </p>
      <h3
        id="configuration-save-share-heading"
        className="mt-2 break-words font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Create a public link
      </h3>
      <p className="mt-3 max-w-3xl break-words text-body text-text-muted">
        Saving creates an immutable public copy of the reviewed
        configuration. It does not place an order or change your current
        configuration.
      </p>

      {customPatternSelected ? (
        <p className="mt-component rounded-card border border-border-strong bg-surface-subtle p-control-x py-4 text-supporting text-text-muted">
          Anonymous permanent design links support built-in patterns only. Save
          this configuration to a private project, then create a revocable
          project share so asset access follows the share grant.
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
            <p className="mt-1">
              Your configuration is still here. No automatic retry was
              attempted.
            </p>
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
          <label
            htmlFor="configuration-share-url"
            className="mt-4 block text-label font-control tracking-label text-text-muted"
          >
            Share URL
          </label>
          <input
            ref={shareUrlInput}
            id="configuration-share-url"
            type="url"
            value={saveState.shareUrl}
            readOnly
            aria-describedby="configuration-share-url-help"
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 min-h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface-subtle px-control-x py-control-y text-body text-text-primary"
          />
          <p
            id="configuration-share-url-help"
            className="mt-2 break-words text-supporting text-text-muted"
          >
            This link identifies the saved configuration by its public
            design ID.
          </p>
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
                Copying is unavailable. The share URL is selected so you can
                copy it manually.
              </ErrorMessage>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
