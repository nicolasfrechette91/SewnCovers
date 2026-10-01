import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { RouteAwareSiteHeader } from "../components/layout/route-aware-site-layout";
import { AuthProvider, useAuth } from "../context/auth";
import {
  configurationReducer,
  ConfigurationProvider,
  initialConfigurationState,
  isInitialConfiguration,
  useConfiguration,
  type ConfigurationState,
} from "../context/configuration";
import { sanitizeDraftConfiguration } from "../context/configuration/draft-configuration";
import { storeSessionToken } from "../services/account-api";
import {
  clearAccountLinkedBrowserData,
  readDraft,
  reloadDraftFromStorage,
  setPendingAccountAction,
  storableConfiguration,
  subscribeToDraftReset,
  takePendingAccountAction,
  writeDraft,
} from "../services/configurator-draft";
import {
  designFingerprint,
  draftNeedsProtection,
  linkRefFromSearch,
  recordLinkRestore,
  recordPublicDesign,
} from "../services/draft-links";
import { planArrival } from "../components/configurator/draft-session";

const DRAFT_KEY = "sewncovers.configurator-draft";

const complete: ConfigurationState = {
  shape: "tapered",
  width: 73.25,
  height: 49.75,
  backWidth: 61.5,
  thickness: 13.5,
  unit: "cm",
  pattern: { kind: "built-in", patternId: "terrace-wave" },
  patternScale: 1.6,
  materialId: "linen-blend",
  fitPreference: "relaxed",
  closureType: "envelope",
  seamStyle: "piped",
};

const customPattern = {
  kind: "custom",
  assetId: "A".repeat(22),
  derivativeId: "D".repeat(22),
  processingVersion: "tile-v1",
  label: "Grandma's quilt",
  previewUrl: "https://assets.example.test/short-lived",
} as const;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  reloadDraftFromStorage();
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

test("restores a partial draft field by field and drops anything malformed", () => {
  const restored = sanitizeDraftConfiguration({
    shape: "square",
    width: 45,
    height: 99,
    thickness: -2,
    backWidth: 12.345,
    unit: "in",
    pattern: { kind: "built-in", patternId: "Not A Pattern" },
    patternScale: 7,
    materialId: "velvet",
    fitPreference: "close",
    closureType: "zipper",
    seamStyle: "piped",
    token: "S".repeat(43),
  });

  assert.deepEqual(restored, {
    ...initialConfigurationState,
    shape: "square",
    width: 45,
    height: 45,
    unit: "in",
    fitPreference: "close",
    seamStyle: "piped",
  });
  assert.deepEqual(sanitizeDraftConfiguration("not a draft"), initialConfigurationState);
  assert.deepEqual(sanitizeDraftConfiguration(complete), complete);
  assert.equal(isInitialConfiguration(sanitizeDraftConfiguration({})), true);
  assert.equal(isInitialConfiguration(restored), false);
});

test("restores a custom pattern without its short-lived preview grant", () => {
  const restored = configurationReducer(initialConfigurationState, {
    type: "restoreDraft",
    configuration: sanitizeDraftConfiguration({ ...complete, pattern: customPattern }),
  });
  assert.deepEqual(restored.pattern, { ...customPattern, previewUrl: null });
  assert.equal(
    configurationReducer(restored, { type: "clearCustomPattern" }).pattern,
    null,
  );
  assert.deepEqual(
    storableConfiguration({ ...complete, pattern: customPattern }).pattern,
    { kind: "custom", assetId: customPattern.assetId, derivativeId: customPattern.derivativeId, processingVersion: "tile-v1", label: "Grandma's quilt" },
  );
});

test("keeps the draft in local storage without any sign-in data", () => {
  writeDraft({ configuration: complete, step: "pattern", highestStep: 3 });
  const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");
  assert.equal(stored.version, 1);
  assert.equal(stored.step, "pattern");
  assert.equal(JSON.stringify(stored).includes("token"), false);
  assert.equal(window.sessionStorage.length, 0);

  reloadDraftFromStorage();
  assert.deepEqual(readDraft()?.configuration, complete);
  assert.equal(readDraft()?.highestStep, 3);

  window.localStorage.setItem(DRAFT_KEY, "{not json");
  reloadDraftFromStorage();
  assert.equal(readDraft(), null);
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...stored, version: 2 }));
  reloadDraftFromStorage();
  assert.equal(readDraft(), null);
});

test("works in memory when browser storage is blocked", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("Storage is disabled", "SecurityError");
    },
  });
  try {
    reloadDraftFromStorage();
    assert.equal(readDraft(), null);
    assert.doesNotThrow(() => writeDraft({ configuration: complete, step: "details", highestStep: 2 }));
    assert.equal(readDraft()?.step, "details");
  } finally {
    if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
  }
});

test("hands a pending account action to exactly one caller", () => {
  const fingerprint = designFingerprint(complete);
  setPendingAccountAction({ kind: "cart", name: "Patio bench", fingerprint });
  assert.deepEqual(
    { ...takePendingAccountAction(fingerprint), createdAt: 0 },
    { kind: "cart", name: "Patio bench", fingerprint, createdAt: 0 },
  );
  assert.equal(takePendingAccountAction(fingerprint), null);

  setPendingAccountAction({ kind: "save", name: "Patio bench", fingerprint });
  assert.equal(takePendingAccountAction(designFingerprint({ ...complete, width: 80 })), null);
  assert.equal(window.sessionStorage.getItem("sewncovers.pending-account-action"), null);
});

test("sign-out removes account-linked drafts and keeps a never-saved one", () => {
  const events: string[] = [];
  const unsubscribe = subscribeToDraftReset((kind) => events.push(kind));
  try {
    writeDraft({ configuration: complete, project: { projectId: "P".repeat(22), versionId: "V".repeat(22), fingerprint: "x" } });
    setPendingAccountAction({ kind: "save", name: "Patio bench", fingerprint: "x" });
    assert.equal(clearAccountLinkedBrowserData(), "cleared");
    assert.equal(readDraft(), null);
    assert.equal(window.localStorage.getItem(DRAFT_KEY), null);
    assert.equal(window.sessionStorage.length, 0);

    writeDraft({ configuration: { ...complete, pattern: customPattern } });
    assert.equal(clearAccountLinkedBrowserData(), "stripped");
    assert.deepEqual(readDraft()?.configuration, { ...complete, pattern: null });

    assert.equal(clearAccountLinkedBrowserData(), null);
    assert.equal(readDraft()?.configuration !== null, true);
    assert.deepEqual(events, ["cleared", "stripped"]);
  } finally {
    unsubscribe();
  }
});

test("warns before a link replaces unsaved work, and only then", () => {
  const fingerprint = designFingerprint(complete);
  const edited = designFingerprint({ ...complete, width: 80 });
  assert.equal(linkRefFromSearch("?design=abc"), "design:abc");
  assert.equal(linkRefFromSearch("?project=P&version=V"), "project:P:V");
  assert.equal(linkRefFromSearch("?resume=1"), null);

  writeDraft({ configuration: complete });
  assert.equal(draftNeedsProtection(readDraft(), fingerprint, "design:ABC"), true);
  assert.equal(draftNeedsProtection(readDraft(), null, "design:ABC"), false);

  recordPublicDesign("B".repeat(22), complete);
  assert.equal(draftNeedsProtection(readDraft(), fingerprint, `design:${"B".repeat(22)}`), false);
  assert.equal(draftNeedsProtection(readDraft(), fingerprint, `design:${"C".repeat(22)}`), true);

  recordLinkRestore("share:token", complete);
  assert.equal(draftNeedsProtection(readDraft(), fingerprint, "design:other"), false);
  assert.equal(draftNeedsProtection(readDraft(), edited, "design:other"), true);
  assert.equal(JSON.stringify(readDraft()).includes("share:token"), false);

  writeDraft({ project: { projectId: "P".repeat(22), versionId: "V".repeat(22), fingerprint: edited } });
  assert.equal(draftNeedsProtection(readDraft(), edited, "design:other"), false);
});

test("plans arrival: restore, open the link, or ask before replacing unsaved work", () => {
  assert.deepEqual(planArrival("", null, initialConfigurationState), { kind: "none" });

  writeDraft({ configuration: complete, step: "preview", highestStep: 4 });
  assert.deepEqual(planArrival("", readDraft(), initialConfigurationState), {
    kind: "restore",
    stored: { configuration: complete, step: "preview", highestStep: 4 },
  });
  // Returning with the same design in memory (a client-side navigation) restores the stage too.
  assert.equal(planArrival("", readDraft(), complete).kind, "restore");
  assert.deepEqual(planArrival("?design=" + "D".repeat(22), readDraft(), initialConfigurationState), { kind: "confirm", reason: "design" });
  assert.deepEqual(planArrival("?share=" + "S".repeat(43), readDraft(), initialConfigurationState), { kind: "confirm", reason: "share" });
  assert.deepEqual(planArrival("?project=P&version=V", readDraft(), initialConfigurationState), { kind: "confirm", reason: "project" });
  // A new design started before the stored one loaded never silently replaces it.
  assert.deepEqual(planArrival("", readDraft(), { ...initialConfigurationState, shape: "round" }), { kind: "confirm", reason: "started" });

  recordLinkRestore("design:" + "D".repeat(22), complete);
  assert.deepEqual(planArrival("?design=" + "D".repeat(22), readDraft(), initialConfigurationState), { kind: "link" });
  assert.deepEqual(planArrival("?design=" + "E".repeat(22), readDraft(), initialConfigurationState), { kind: "link" });
});

function SignOutProbe() {
  const { state, logout } = useAuth();
  const { state: configuration, dispatch } = useConfiguration();
  return (
    <>
      <span data-testid="auth">{state.status}</span>
      <span data-testid="shape">{configuration.shape ?? "none"}</span>
      <button onClick={() => dispatch({ type: "restoreDraft", configuration: complete })}>Restore</button>
      <button onClick={() => void logout()}>Sign out</button>
    </>
  );
}

test("signing out clears a saved draft from storage and from the open design", async () => {
  storeSessionToken("N".repeat(43));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/account")) return json({ email: "person@example.com", createdAt: "2026-09-30T00:00:00Z", role: "customer" });
    if (url.endsWith("/account/sessions")) return json([{ id: 1, createdAt: "2026-09-30T00:00:00Z", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), revokedAt: null, current: true }]);
    if (url.endsWith("/auth/logout")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    writeDraft({ configuration: complete, project: { projectId: "P".repeat(22), versionId: "V".repeat(22), fingerprint: designFingerprint(complete) } });
    render(<AuthProvider><ConfigurationProvider><SignOutProbe /></ConfigurationProvider></AuthProvider>);
    await waitFor(() => assert.equal(screen.getByTestId("auth").textContent, "authenticated"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    assert.equal(screen.getByTestId("shape").textContent, "tapered");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    });
    await waitFor(() => assert.equal(screen.getByTestId("auth").textContent, "guest"));
    assert.equal(readDraft(), null);
    assert.equal(screen.getByTestId("shape").textContent, "none");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const utilityItems = [
  { href: "/cart/", label: "Cart" },
  { href: "/account/", label: "Account" },
];

test("shows guests a quiet Sign in link that returns to the current page", async () => {
  render(<AuthProvider><RouteAwareSiteHeader utilityItems={utilityItems} /></AuthProvider>);
  const utilities = screen.getByRole("list", { name: "Shopping and account" });
  await waitFor(() =>
    assert.deepEqual(Array.from(utilities.querySelectorAll("a"), (link) => link.textContent), ["Cart", "Sign in"]),
  );
  assert.match(screen.getByRole("link", { name: "Sign in" }).getAttribute("href") ?? "", /^\/account\/?\?mode=login&returnTo=home$/);
});

test("keeps the Account link for a stored or verified session", async () => {
  storeSessionToken("N".repeat(43));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Promise<Response>(() => undefined);
  try {
    render(<AuthProvider><RouteAwareSiteHeader utilityItems={utilityItems} /></AuthProvider>);
    await screen.findByRole("link", { name: "Account" });
    assert.equal(screen.queryByRole("link", { name: "Sign in" }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
