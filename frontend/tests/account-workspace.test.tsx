import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
import {
  buildAccountHref,
  parseAuthenticationMode,
  parseAuthenticationReturnTarget,
  resolveAuthenticationReturnDestination,
} from "../services/auth-navigation";

const configuration: CreateDesignRequest = {
  shape: "tapered",
  width: 73.25,
  height: 49.75,
  backWidth: 61.5,
  thickness: 13.5,
  unit: "cm",
  patternId: "terrace-wave",
  solidColor: null,
  patternScale: 1.6,
  materialId: "linen-blend",
  fitPreference: "relaxed",
  closureType: "envelope",
  seamStyle: "piped",
};
const configurationState: ConfigurationState = {
  ...configuration,
  pattern: { kind: "built-in", patternId: configuration.patternId! },
};
const {
  patternId: builtInPatternId,
  ...configurationWithoutPattern
} = configuration;
const projectConfiguration: ProjectConfigurationRequest = {
  ...configurationWithoutPattern,
  pattern: { kind: "built-in", patternId: builtInPatternId! },
};

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
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

test("defaults to one accessible sign-in form with recovery limitations", async () => {
  const view = render(<AuthProvider><AccountScreen /></AuthProvider>);
  await screen.findByRole("heading", { name: "Sign in" });
  assert.equal(view.container.querySelectorAll("form").length, 1);
  assert.equal(screen.queryByRole("heading", { name: "Create account" }), null);
  assert.equal(screen.queryByRole("checkbox"), null);
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  const passphrase = screen.getByLabelText("Passphrase") as HTMLInputElement;
  assert.equal(email.id, "login-email");
  assert.equal(email.autocomplete, "email");
  assert.equal(passphrase.autocomplete, "current-password");
  assert.equal(passphrase.minLength, 12);
  assert.equal(passphrase.maxLength, 128);
  assert.ok(screen.getByText(/Password recovery is unavailable/));
  assert.equal(screen.getByRole("link", { name: "Sign in" }).getAttribute("aria-current"), "page");
});

test("renders only registration controls for a valid registration mode", async () => {
  window.history.replaceState({}, "", "/account/?mode=register&returnTo=projects");
  const view = render(<AuthProvider><AccountScreen /></AuthProvider>);
  await screen.findByRole("heading", { name: "Create account" });
  assert.equal(view.container.querySelectorAll("form").length, 1);
  assert.equal(screen.queryByRole("heading", { name: "Sign in" }), null);
  assert.equal((screen.getByLabelText("Passphrase") as HTMLInputElement).autocomplete, "new-password");
  assert.ok(screen.getByRole("checkbox", { name: /account terms version 1/i }));
  assert.ok(screen.getByText(/Use 12–128 characters. There is no composition rule/));
  assert.ok(screen.getByText(/Email verification and password recovery are unavailable/));
  assert.ok(screen.getByText(/return to your private projects/));
});

test("associates local authentication errors and focuses the first invalid field", async () => {
  render(<AuthProvider><AccountScreen /></AuthProvider>);
  await screen.findByRole("heading", { name: "Sign in" });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  assert.equal(document.activeElement, email);
  assert.equal(email.getAttribute("aria-invalid"), "true");
  assert.equal(email.getAttribute("aria-describedby"), "login-email-error");
  assert.ok(screen.getByText("Enter your email address."));

  fireEvent.change(email, { target: { value: "not-an-email" } });
  fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "a sufficiently long passphrase" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  assert.ok(screen.getByText("Enter a valid email address."));
});

test("keeps secure credential failures at form level without erasing email", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => json({ errors: [{ code: "authentication_failed", message: "Email or password could not be accepted.", location: ["body", "credentials"] }] }, 401);
  try {
    render(<AuthProvider><AccountScreen /></AuthProvider>);
    await screen.findByRole("heading", { name: "Sign in" });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("alert");
    assert.ok(screen.getByText("Email or password could not be accepted."));
    assert.equal((screen.getByLabelText("Email") as HTMLInputElement).value, "person@example.com");
    assert.ok(document.activeElement?.contains(screen.getByRole("alert")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects missing registration terms before making an API request", async () => {
  window.history.replaceState({}, "", "/account/?mode=register");
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("unexpected request"); };
  try {
    render(<AuthProvider><AccountScreen /></AuthProvider>);
    await screen.findByRole("heading", { name: "Create account" });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    const terms = screen.getByRole("checkbox", { name: /account terms version 1/i });
    assert.equal(document.activeElement, terms);
    assert.equal(terms.getAttribute("aria-describedby"), "register-terms-error");
    assert.ok(screen.getByText(/Acknowledge the account terms/));
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("allowlists authentication returns and rejects redirect-shaped input", () => {
  assert.equal(parseAuthenticationMode(null), "login");
  assert.equal(parseAuthenticationMode("unknown"), "login");
  assert.equal(parseAuthenticationMode("register"), "register");
  assert.equal(parseAuthenticationReturnTarget("projects"), "projects");
  assert.equal(buildAccountHref("register", "cart"), "/account/?mode=register&returnTo=cart");
  assert.equal(resolveAuthenticationReturnDestination("projects"), "/projects/");
  assert.equal(resolveAuthenticationReturnDestination("cart"), "/cart/");
  assert.equal(resolveAuthenticationReturnDestination("orders"), "/orders/");
  assert.equal(resolveAuthenticationReturnDestination("projects", "/SewnCovers/"), "/SewnCovers/projects/");
  for (const value of [
    "https://attacker.example/",
    "//attacker.example/",
    "%2F%2Fattacker.example",
    "/projects/",
    "../projects",
    "admin",
    "projects?next=admin",
    "",
  ]) {
    assert.equal(resolveAuthenticationReturnDestination(value), null);
  }
});

test("distinguishes private project saving from public guest sharing", async () => {
  render(<AuthProvider><PrivateProjectPanel configuration={configurationState} onSavingChange={() => undefined} /></AuthProvider>);
  await screen.findByRole("heading", { name: "Save to a private project" });
  await screen.findByRole("link", { name: "Sign in" });
  assert.ok(screen.getByRole("link", { name: "Create account" }));
  assert.ok(screen.getByRole("link", { name: "Continue configuring as a guest" }));
  assert.ok(screen.getByText(/separate from the public design link/));
  assert.ok(screen.getByText(/public-link workflow above/));
});

test("keeps built-in patterns available when private custom patterns are locked", async () => {
  render(<AuthProvider><ConfigurationProvider><YourPatterns /></ConfigurationProvider></AuthProvider>);
  await screen.findByRole("heading", { name: "Sign in to use private custom patterns" });
  assert.ok(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")?.includes("returnTo=configure"));
  assert.ok(screen.getByRole("link", { name: "Create account" }));
  assert.ok(screen.getByRole("link", { name: "Continue with built-in patterns" }));
  assert.ok(screen.getByText(/All built-in patterns and the guest configuration stages remain available/));
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

test("shows a saved solid fabric with a bordered swatch and hexadecimal text", () => {
  render(
    <AuthProvider>
      <ConfigurationReadonly
        configuration={{
          ...projectConfiguration,
          pattern: { kind: "solid", color: "#F5F2EB" },
        }}
      />
    </AuthProvider>,
  );
  assert.ok(screen.getByText("Solid color · #F5F2EB"));
  assert.ok(document.querySelector('[data-solid-color="#F5F2EB"]'));
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
    if (url.endsWith("/auth/login")) return json({ account: { email: "patterns@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" }, token: "S".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/account/sessions")) return json([{ id: 1, createdAt: "2026-08-18T00:00:00Z", expiresAt: "2099-08-18T00:00:00Z", revokedAt: null, current: true }]);
    if (url.endsWith("/account")) return json({ email: "patterns@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" });
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
    assert.ok(screen.getByText(/moderation is unavailable, so this image cannot be approved/));
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
    if (url.endsWith("/auth/login")) return json({ account: { email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" }, token: "Q".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/account")) return json({ email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" });
    if (url.endsWith("/account/sessions")) return json([]);
    if (url.endsWith("/uploads")) return json([]);
    throw new Error(`Unexpected request GET ${url}`);
  };
  try {
    render(<AuthProvider><SignInForTest><ConfigurationProvider><YourPatterns /></ConfigurationProvider></SignInForTest></AuthProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Enter test account" }));
    const input = await screen.findByLabelText("Choose a pattern image") as HTMLInputElement;
    await screen.findByText("No custom patterns yet.");
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

test("revokes a temporary upload URL when image decoding fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = globalThis.Image;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const revoked: string[] = [];
  class FailedPreviewImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { this.onerror?.(); }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: FailedPreviewImage });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:failed-pattern" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: (url: string) => revoked.push(url) });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) return json({ account: { email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" }, token: "Q".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/uploads")) return json([]);
    throw new Error(`Unexpected request GET ${url}`);
  };
  try {
    render(<AuthProvider><SignInForTest><ConfigurationProvider><YourPatterns /></ConfigurationProvider></SignInForTest></AuthProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Enter test account" }));
    const input = await screen.findByLabelText("Choose a pattern image") as HTMLInputElement;
    await screen.findByText("No custom patterns yet.");
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], "broken.png", { type: "image/png" })] } });
    });
    await screen.findByText("The browser could not preview this image.");
    assert.deepEqual(revoked, ["blob:failed-pattern"]);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "Image", { configurable: true, value: originalImage });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
  }
});

test("revokes replaced, stale, and unmounted upload previews exactly once", async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = globalThis.Image;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const images: PendingPreviewImage[] = [];
  const revoked: string[] = [];
  let urlSequence = 0;
  class PendingPreviewImage {
    naturalWidth = 128;
    naturalHeight = 96;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { images.push(this); }
    set src(_value: string) {}
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: PendingPreviewImage });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => `blob:pattern-${++urlSequence}` });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: (url: string) => revoked.push(url) });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) return json({ account: { email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" }, token: "Q".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/uploads")) return json([]);
    throw new Error(`Unexpected request GET ${url}`);
  };
  try {
    const view = render(<AuthProvider><SignInForTest><ConfigurationProvider><YourPatterns /></ConfigurationProvider></SignInForTest></AuthProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Enter test account" }));
    const input = await screen.findByLabelText("Choose a pattern image") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], "first.png", { type: "image/png" })] } });
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([2])], "second.png", { type: "image/png" })] } });
    await act(async () => { images[1].onload?.(); });
    await screen.findByText("128 × 96 px. The complete image is used without cropping.");
    await act(async () => { images[0].onload?.(); });
    assert.deepEqual(revoked, ["blob:pattern-1"]);
    view.unmount();
    assert.deepEqual(revoked, ["blob:pattern-1", "blob:pattern-2"]);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "Image", { configurable: true, value: originalImage });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
  }
});
