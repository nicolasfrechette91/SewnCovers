"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useConfiguration } from "@/context/configuration";
import type { PatternCatalogueResult } from "@/data/patterns";
import { apiClient } from "@/services/api-client";
import {
  SharedDesignController,
  type SharedDesignLoadState,
} from "@/services/shared-design";

function removeDesignParameter(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("design");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

export interface SharedDesignLoaderProps {
  catalogue: PatternCatalogueResult;
  onRetryPatterns: () => void;
}

export function SharedDesignLoader({
  catalogue,
  onRetryPatterns,
}: SharedDesignLoaderProps) {
  const { dispatch, getRevision, state: configuration } =
    useConfiguration();
  const [controller] = useState(
    () =>
      new SharedDesignController(
        apiClient,
        (restoredConfiguration) => {
          dispatch({
            configuration: restoredConfiguration,
            type: "restoreConfiguration",
          });
        },
        getRevision,
      ),
  );
  const [state, setState] = useState<SharedDesignLoadState>(
    controller.getSnapshot,
  );

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    controller.start(window.location.search, { status: "loading" });

    return () => {
      unsubscribe();
      controller.cancel();
    };
  }, [controller]);

  useEffect(() => {
    controller.updateCatalogue(catalogue);
  }, [catalogue, controller]);

  useEffect(() => {
    controller.configurationChanged();
  }, [configuration, controller]);

  const dismiss = useCallback(() => {
    controller.dismiss();
    removeDesignParameter();
  }, [controller]);

  if (state.phase === "idle") {
    return null;
  }

  const isLoading =
    state.phase === "loading" || state.phase === "waiting-patterns";
  const canRetryDesign =
    state.phase === "error" || state.phase === "malformed-response";
  const canRetryPatterns =
    state.phase === "catalogue-error" ||
    state.phase === "pattern-unavailable";

  return (
    <section
      aria-labelledby="shared-design-status-heading"
      className="print-hidden mt-layout rounded-panel border border-border bg-surface p-card shadow-raised"
    >
      <h2
        id="shared-design-status-heading"
        className="font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Shared design
      </h2>

      {isLoading ? (
        <LoadingState className="mt-3" label={state.message} />
      ) : state.phase === "restored" ? (
        <p
          className="mt-3 text-supporting text-text-muted"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {state.message}
        </p>
      ) : (
        <ErrorMessage className="mt-3">
          <div>
            <p>{state.message}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {canRetryDesign ? (
                <Button variant="secondary" onClick={() => controller.retry()}>
                  Try loading the shared design again
                </Button>
              ) : null}
              {canRetryPatterns ? (
                <Button variant="secondary" onClick={onRetryPatterns}>
                  Try loading patterns again
                </Button>
              ) : null}
              <Button variant="secondary" onClick={dismiss}>
                Continue with my configuration
              </Button>
            </div>
          </div>
        </ErrorMessage>
      )}
    </section>
  );
}
