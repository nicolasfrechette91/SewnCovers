"use client";

import { useEffect, useState } from "react";

import { apiClient, type SewnCoversApiClient } from "./api-client";

/**
 * Whether custom uploads can be offered. Only "enabled" offers them:
 * "checking" (no answer yet) and "unknown" (the request failed or timed out)
 * fail closed, so nothing upload-related is shown.
 */
export type UploadAvailability =
  "checking" | "enabled" | "disabled" | "unknown";

let pending: Promise<boolean | null> | null = null;

/**
 * Asks the API once per tab, and only when something needs the answer (the
 * Pattern stage), so no page pays for it on load. A failed answer is not
 * cached, so a later visit asks again.
 */
export function loadUploadAvailability(
  client: Pick<SewnCoversApiClient, "getUploadAvailability"> = apiClient,
): Promise<boolean | null> {
  pending ??= client.getUploadAvailability().then(
    (response) => response.enabled,
    () => {
      pending = null;
      return null;
    },
  );
  return pending;
}

/** Forgets the cached answer; for tests. */
export function resetUploadAvailability(): void {
  pending = null;
}

export function useUploadAvailability(): UploadAvailability {
  const [availability, setAvailability] =
    useState<UploadAvailability>("checking");

  useEffect(() => {
    let active = true;
    void loadUploadAvailability().then((enabled) => {
      if (!active) return;
      setAvailability(
        enabled === null ? "unknown" : enabled ? "enabled" : "disabled",
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return availability;
}
