import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AccountScreen } from "../components/account";
import { PrivateProjectPanel } from "../components/configurator/private-project-panel";
import { YourPatterns } from "../components/configurator/your-patterns";
import { ConfigurationReadonly } from "../components/projects";
import { AuthProvider, useAuth } from "../context/auth";
import { ConfigurationProvider, useConfiguration } from "../context/configuration";
import type { CreateDesignRequest } from "../services/api-client";
import type { ConfigurationState } from "../context/configuration";
import type { ProjectConfigurationRequest } from "../services/account-api";
import {
  buildProjectShareUrl,
  readSessionToken,
  removeSessionToken,
  storeSessionToken,
  withBasePath,
} from "../services/account-api";

const configuration: CreateDesignRequest = {
  shape: "tapered",
  width: 73.25,
  height: 49.75,
  backWidth: 61.5,
  thickness: 13.5,
  unit: "cm",
  patternId: "terrace-wave",
  patternScale: 1.6,
  materialId: "linen-blend",
  fitPreference: "relaxed",
  closureType: "envelope",
  seamStyle: "piped",
};
const configurationState: ConfigurationState = {
  ...configuration,
  pattern: { kind: "built-in", patternId: configuration.patternId },
};
const {
  patternId: builtInPatternId,
  ...configurationWithoutPattern
} = configuration;
const projectConfiguration: ProjectConfigurationRequest = {
  ...configurationWithoutPattern,
  pattern: { kind: "built-in", patternId: builtInPatternId },
};

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

function PatternProbe() {
  const { state } = useConfiguration();
  return <span data-testid="selected-custom">{state.pattern?.kind === "custom" ? state.pattern.label : "none"}</span>;
}

function SignInForTest({ children }: Readonly<{ children: React.ReactNode }>) {
  const { state, login } = useAuth();
  if (state.status === "initializing") return <span>Initializing test account</span>;
  if (state.status === "guest") {
    return <button onClick={() => void login("patterns@example.com", "correct horse battery staple")}>Enter test account</button>;
  }
  return children;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function uploadState(state: string, index: number) {
  return {
    id: String(index).padStart(22, "A"), label: `${state} pattern`, state,
    moderationState: state === "approved" ? "approved" : state === "rejected" ? "rejected" : state === "awaiting_moderation" ? "unavailable" : "not_started",
    contentType: "image/png", byteSize: 100, width: state === "approved" ? 128 : null,
    height: state === "approved" ? 96 : null, processingVersion: "tile-v1",
    tileDerivativeId: state === "approved" ? "T".repeat(22) : null,
    thumbnailDerivativeId: state === "approved" ? "N".repeat(22) : null,
    processingAttempts: state === "failed" ? 1 : 0, moderationAttempts: 0,
    retryEligible: state === "failed" || state === "awaiting_moderation",
    referencedByVersions: state === "approved" ? 2 : 0,
    createdAt: "2026-08-18T00:00:00Z", updatedAt: "2026-08-18T00:00:00Z", deletedAt: state === "deleted" ? "2026-08-18T00:01:00Z" : null,
  };
}

function AuthProbe() {
  const { state } = useAuth();
  return <span data-testid="auth-state">{state.status}</span>;
}

test("restores the optional guest journey without creating browser records", async () => {
  render(<AuthProvider><AuthProbe /></AuthProvider>);
  await waitFor(() => assert.equal(screen.getByTestId("auth-state").textContent, "guest"));
  assert.equal(readSessionToken(), null);
  assert.equal(window.localStorage.length, 0);
});

test("keeps opaque authentication only in sessionStorage", () => {
  const token = "A".repeat(43);
  storeSessionToken(token);
  assert.equal(readSessionToken(), token);
  assert.equal(window.sessionStorage.length, 1);
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.location.href.includes(token), false);
  removeSessionToken();
  assert.equal(readSessionToken(), null);
});

test("renders native sign-in and registration forms with documented limits", async () => {
  render(<AuthProvider><AccountScreen /></AuthProvider>);
  await screen.findByRole("heading", { name: "Sign in" });
  assert.ok(screen.getByRole("heading", { name: "Create an account" }));
  const passphrases = screen.getAllByLabelText("Passphrase") as HTMLInputElement[];
  assert.equal(passphrases.length, 2);
  assert.ok(passphrases.every((input) => input.minLength === 12 && input.maxLength === 128));
  assert.ok(screen.getByText(/Email verification and password recovery are not available/));
});

test("distinguishes private project saving from anonymous immutable sharing", async () => {
  render(<AuthProvider><PrivateProjectPanel configuration={configurationState} onSavingChange={() => undefined} /></AuthProvider>);
  await screen.findByRole("heading", { name: "Save to a private project" });
  await screen.findByRole("link", { name: "Sign in or register" });
  assert.ok(screen.getByText(/Accounts are optional/));
  assert.ok(screen.getByRole("link", { name: "Sign in or register" }));
  assert.ok(screen.getByText(/anonymous public design link/));
});

test("shows every Task 10.1 field in a read-only version summary", () => {
  render(<AuthProvider><ConfigurationReadonly configuration={projectConfiguration} /></AuthProvider>);
  for (const value of [
    "tapered", "73.25 cm", "49.75 cm", "61.5 cm", "13.5 cm",
    "Linen blend", "More relaxed fit", "Envelope opening", "Piped edge",
    "terrace-wave", "1.6×",
  ]) assert.ok(screen.getByText(value));
  assert.ok(screen.getByText(/Read-only preview/));
});

test("builds root-safe bearer share routes without account identifiers", () => {
  const token = "B".repeat(43);
  assert.equal(withBasePath("/projects/"), "/projects/");
  const url = buildProjectShareUrl(token);
  assert.equal(url, `https://example.test/configure/?share=${token}`);
  assert.equal(url.includes("account"), false);
  assert.equal(url.includes("email"), false);
});

test("shows every custom upload lifecycle state and selects only approved assets", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;
  const requests: string[] = [];
  const states = ["awaiting_upload", "uploaded", "processing", "awaiting_moderation", "approved", "rejected", "failed", "deleted", "expired"].map(uploadState);
  globalThis.fetch = async (input, init) => {
    const url = String(input); const method = init?.method ?? "GET"; requests.push(`${method} ${url}`);
    if (url.endsWith("/auth/login")) return json({ account: { email: "patterns@example.com", createdAt: "2026-08-18T00:00:00Z" }, token: "S".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/account/sessions")) return json([{ id: 1, createdAt: "2026-08-18T00:00:00Z", expiresAt: "2099-08-18T00:00:00Z", revokedAt: null, current: true }]);
    if (url.endsWith("/account")) return json({ email: "patterns@example.com", createdAt: "2026-08-18T00:00:00Z" });
    if (url.endsWith("/uploads") && method === "GET") return json(states);
    if (/\/uploads\/[A-Za-z0-9_-]{22}$/.test(url) && method === "GET") return json(states[5]);
    if (url.includes("/assets/tile/access")) return json({ url: "/assets/direct/" + "Z".repeat(43) + "/tile", expiresAt: "2099-08-18T00:00:00Z", contentType: "image/png" });
    if (url.endsWith("/retry")) return json(states[6]);
    if (method === "PATCH") return json({ ...states[4], label: "Renamed pattern" });
    if (method === "DELETE") return json({ id: states[4].id, state: "deleted", referencedByVersions: 2 });
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  window.confirm = () => false;
  window.prompt = () => "Renamed pattern";
  try {
    render(<AuthProvider><SignInForTest><ConfigurationProvider><YourPatterns /><PatternProbe /></ConfigurationProvider></SignInForTest></AuthProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Enter test account" }));
    await screen.findByText("approved pattern");
    for (const label of ["Awaiting upload", "Queued for processing", "Processing", "Approved", "Rejected", "Processing failed", "Deleted", "Upload expired"]) assert.ok(screen.getByText(label, { exact: true }));
    assert.ok(screen.getByText(/Awaiting moderation — moderation unavailable/));
    assert.equal(screen.getAllByRole("radio").length, 1);
    fireEvent.click(screen.getByRole("radio", { name: "Select custom pattern approved pattern" }));
    await waitFor(() => assert.equal(screen.getByTestId("selected-custom").textContent, "approved pattern"));
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[4]);
    await screen.findByText("Renamed pattern");
    assert.ok(requests.some((item) => item.includes("/assets/tile/access")));
    assert.ok(requests.some((item) => item.endsWith("/retry")));
    assert.ok(requests.some((item) => item.startsWith("PATCH")));
  } finally {
    globalThis.fetch = originalFetch; window.confirm = originalConfirm; window.prompt = originalPrompt;
  }
});

test("validates the accessible file control and shows a local repeat preview", async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = globalThis.Image;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  class PreviewImage {
    naturalWidth = 128; naturalHeight = 96; onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: PreviewImage });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:local-pattern" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) return json({ account: { email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z" }, token: "Q".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/account")) return json({ email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z" });
    if (url.endsWith("/account/sessions")) return json([]);
    if (url.endsWith("/uploads")) return json([]);
    throw new Error(`Unexpected request GET ${url}`);
  };
  try {
    render(<AuthProvider><SignInForTest><ConfigurationProvider><YourPatterns /></ConfigurationProvider></SignInForTest></AuthProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Enter test account" }));
    const input = await screen.findByLabelText("Choose a pattern image") as HTMLInputElement;
    assert.equal(input.accept, "image/jpeg,image/png,image/webp");
    assert.equal(input.accept.includes("svg"), false);
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], "calm.png", { type: "image/png" })] } });
    await screen.findByLabelText("Repeating preview of the selected local image", {}, { timeout: 3_000 });
    assert.equal((screen.getByLabelText("Pattern label") as HTMLInputElement).value, "calm");
    assert.ok(screen.getByText("128 × 96 px. The complete image is used without cropping."));
    assert.ok(screen.getByText(/Local repeat preview ready/));
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "Image", { configurable: true, value: originalImage });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
  }
});
