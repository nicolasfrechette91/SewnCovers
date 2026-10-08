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
  resolveAuthenticationReturnPath,
  returnTargetForPath,
} from "../services/auth-navigation";
import {
  readDraft,
  reloadDraftFromStorage,
  writeDraft,
} from "../services/configurator-draft";
import { resetUploadAvailability } from "../services/upload-availability";

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
  resetUploadAvailability();
  window.sessionStorage.clear();
  window.localStorage.clear();
  reloadDraftFromStorage();
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

// Answers the Pattern stage's upload-availability question, then defers to
// the test's own API double.
function withUploadAvailability(enabled: boolean, next?: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (String(input).endsWith("/uploads/availability")) return json({ enabled });
    if (next) return next(input, init);
    throw new Error(`Unexpected request ${String(input)}`);
  };
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
    assert.ok(screen.getByText("That email and passphrase don't match an account. Check them and try again."));
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
  assert.equal(resolveAuthenticationReturnDestination("configure", "/SewnCovers"), "/SewnCovers/configure/");
  assert.equal(resolveAuthenticationReturnDestination("home"), "/");
  assert.equal(resolveAuthenticationReturnPath("legal"), "/legal/");
  assert.equal(resolveAuthenticationReturnPath("pricing"), "/commerce/");
  assert.equal(resolveAuthenticationReturnPath("admin"), null);
  assert.equal(returnTargetForPath("/configure/"), "configure");
  assert.equal(returnTargetForPath("/SewnCovers/configure", "/SewnCovers"), "configure");
  assert.equal(returnTargetForPath("/"), "home");
  assert.equal(returnTargetForPath("/commerce/"), "pricing");
  assert.equal(returnTargetForPath("/checkout/return/"), "orders");
  assert.equal(returnTargetForPath("/account/"), null);
  assert.equal(returnTargetForPath("/admin/"), null);
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

const { solidColor: _unusedSolidColor, ...savedConfiguration } = projectConfiguration as ProjectConfigurationRequest & { solidColor?: null };
void _unusedSolidColor;

function projectDetail(id: string, name: string, versionId: string, versionNumber: number, saved: ProjectConfigurationRequest) {
  return {
    id, name, versionCount: versionNumber, updatedAt: "2026-09-30T10:00:00Z", privacy: "private", createdAt: "2026-09-30T10:00:00Z",
    currentVersion: { id: versionId, versionNumber, configuration: saved, createdAt: "2026-09-30T10:00:00Z", isCurrent: true },
    activeShares: [],
  };
}

const signedInSession = {
  account: { email: "guest@example.com", createdAt: "2026-09-30T09:00:00Z", role: "customer" },
  token: "G".repeat(43),
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

async function signInInline(button: string) {
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "guest@example.com" } });
  fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "correct horse battery staple" } });
  fireEvent.click(screen.getByRole("button", { name: button }));
}

test("offers private saving to guests as an optional inline step", async () => {
  const suggested = "Tapered / trapezoid cushion, Terrace wave";
  render(<AuthProvider><PrivateProjectPanel configuration={configurationState} defaultName={suggested} /></AuthProvider>);
  await screen.findByRole("heading", { name: "Save to My projects" });
  assert.ok(screen.getByText(/Only you can see it unless you share it/));
  await screen.findByText(/asked to sign in or create an account next/);
  assert.equal(screen.queryByRole("link", { name: /sign in/i }), null);
  assert.equal((screen.getByLabelText("Project name") as HTMLInputElement).value, suggested);

  // A guest goes straight to sign-in; no name has to be typed first.
  fireEvent.click(screen.getByRole("button", { name: "Save and add to cart" }));
  const cartHeading = await screen.findByRole("heading", { name: "Sign in to add this design to your cart" });
  await waitFor(() => assert.equal(document.activeElement, cartHeading));
  assert.equal(screen.queryByText("Enter a project name."), null);
  assert.equal(JSON.parse(window.sessionStorage.getItem("sewncovers.pending-account-action") ?? "{}").name, suggested);
  fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));
  const cart = await screen.findByRole("button", { name: "Save and add to cart" });
  await waitFor(() => assert.equal(document.activeElement, cart));

  // An emptied name falls back to the suggestion instead of stopping.
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save to My projects" }));
  const heading = await screen.findByRole("heading", { name: "Sign in to save this design" });
  await waitFor(() => assert.equal(document.activeElement, heading));
  assert.ok(screen.getByText(/Projects are kept in your account/));
  assert.equal(JSON.parse(window.sessionStorage.getItem("sewncovers.pending-account-action") ?? "{}").name, suggested);

  fireEvent.click(screen.getByRole("button", { name: "Create an account instead" }));
  await screen.findByRole("heading", { name: "Create an account to save this design" });
  assert.ok(screen.getByRole("checkbox", { name: /account terms version 1/i }));
  assert.ok(screen.getByRole("button", { name: "Create account and save" }));

  fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));
  const save = await screen.findByRole("button", { name: "Save to My projects" });
  await waitFor(() => assert.equal(document.activeElement, save));
  assert.equal(window.sessionStorage.getItem("sewncovers.pending-account-action"), null);
});

test("still asks for a name when there is nothing to suggest", async () => {
  render(<AuthProvider><PrivateProjectPanel configuration={configurationState} /></AuthProvider>);
  await screen.findByText(/asked to sign in or create an account next/);
  fireEvent.click(screen.getByRole("button", { name: "Save to My projects" }));
  assert.ok(screen.getByText("Enter a project name."));
  await waitFor(() => assert.equal(document.activeElement, screen.getByLabelText("Project name")));
});

test("signs in at save, saves the design once, and links the draft to the project", async () => {
  writeDraft({ configuration: configurationState, step: "review", highestStep: 5 });
  const originalFetch = globalThis.fetch;
  const projectId = "P".repeat(22);
  const versionId = "V".repeat(22);
  let created: unknown = null;
  let projectPosts = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/auth/login")) return json(signedInSession);
    if (url.endsWith("/account")) return json(signedInSession.account);
    if (url.endsWith("/account/sessions")) return json([{ id: 1, createdAt: "2026-09-30T09:00:00Z", expiresAt: signedInSession.expiresAt, revokedAt: null, current: true }]);
    if (method === "POST" && url.endsWith("/projects")) {
      projectPosts += 1;
      created = JSON.parse(String(init?.body));
      return json(projectDetail(projectId, "Patio bench", versionId, 1, savedConfiguration), 201);
    }
    if (url.endsWith(`/projects/${projectId}`)) return json(projectDetail(projectId, "Patio bench", versionId, 1, savedConfiguration));
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  try {
    const view = render(<AuthProvider><PrivateProjectPanel configuration={configurationState} onSavingChange={() => undefined} /></AuthProvider>);
    fireEvent.change(await screen.findByLabelText("Project name"), { target: { value: "Patio bench" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to My projects" }));
    await signInInline("Sign in and save");

    const status = await screen.findByText("Private project created with version 1.");
    await waitFor(() => assert.equal(document.activeElement, status));
    assert.equal(projectPosts, 1);
    assert.deepEqual(created, { name: "Patio bench", configuration: savedConfiguration });
    assert.equal(readDraft()?.project?.projectId, projectId);
    assert.equal(window.sessionStorage.getItem("sewncovers.pending-account-action"), null);
    assert.ok(screen.getByRole("link", { name: "Open saved project" }));

    // Coming back to Review with the same design never saves it again.
    view.unmount();
    render(<AuthProvider><PrivateProjectPanel configuration={configurationState} onSavingChange={() => undefined} /></AuthProvider>);
    await screen.findByText(/This design matches version 1, the current version/);
    assert.ok(screen.getByRole("heading", { name: "Saved to My projects" }));
    assert.ok(screen.getByText(/This design is saved as “Patio bench”/));
    assert.equal(screen.queryByRole("button", { name: /Save to My projects|Save as new version/ }), null);
    assert.equal(projectPosts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adds a design to the cart once after sign-in, even when asked again", async () => {
  writeDraft({ configuration: configurationState, step: "review", highestStep: 5 });
  const originalFetch = globalThis.fetch;
  const projectId = "P".repeat(22);
  const versionId = "V".repeat(22);
  const counts = { projects: 0, quotes: 0, lines: 0 };
  const quote = {
    demonstration: true, modelLabel: "Demonstration CAD price model v1", priceBookVersion: 1, currency: "CAD", quantity: 1,
    unitAmountMinor: 10450, subtotalAmountMinor: 10450, subtotalFormatted: "$104.50 CAD", breakdown: [],
    taxTreatment: "Fictional.", shippingTreatment: "Fictional.", id: "Q".repeat(22), status: "active", projectVersionId: versionId,
    configuration: {}, createdAt: "2026-09-30T10:00:00Z", expiresAt: "2026-10-07T10:00:00Z", canCheckout: true, customAsset: null,
  };
  const line = { id: "L".repeat(22), quote, quantity: 1, extendedAmountMinor: 10450 };
  const cart = (lines: unknown[]) => ({ id: "K".repeat(22), demonstration: true, state: "active", currency: "CAD", lines, subtotalAmountMinor: 0, subtotalFormatted: "$0.00 CAD", notices: [] });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/auth/login")) return json(signedInSession);
    if (method === "POST" && url.endsWith("/projects")) { counts.projects += 1; return json(projectDetail(projectId, "Patio bench", versionId, 1, savedConfiguration), 201); }
    if (url.endsWith(`/projects/${projectId}`)) return json(projectDetail(projectId, "Patio bench", versionId, 1, savedConfiguration));
    if (method === "GET" && url.endsWith("/commerce/cart")) return json(cart(counts.lines ? [line] : []));
    if (method === "POST" && url.endsWith("/commerce/quotes")) { counts.quotes += 1; return json(quote, 201); }
    if (method === "POST" && url.endsWith("/commerce/cart/lines")) { counts.lines += 1; return json(cart([line])); }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  try {
    render(<AuthProvider><PrivateProjectPanel configuration={configurationState} onSavingChange={() => undefined} /></AuthProvider>);
    fireEvent.change(await screen.findByLabelText("Project name"), { target: { value: "Patio bench" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and add to cart" }));
    await screen.findByRole("heading", { name: "Sign in to add this design to your cart" });
    await signInInline("Sign in and add to cart");

    await screen.findByText(/Private project created with version 1\. Added to your demonstration cart/);
    assert.ok(screen.getByRole("link", { name: "View cart" }));
    assert.deepEqual(counts, { projects: 1, quotes: 1, lines: 1 });
    assert.equal(readDraft()?.cart?.versionId, versionId);

    fireEvent.click(await screen.findByRole("button", { name: "Add to cart" }));
    await screen.findByText("This design is already in your demonstration cart.");
    assert.deepEqual(counts, { projects: 1, quotes: 1, lines: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("offers private custom patterns to guests as an optional inline step", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = withUploadAvailability(true);
  try {
    render(<AuthProvider><ConfigurationProvider><YourPatterns /></ConfigurationProvider></AuthProvider>);
    const upload = await screen.findByRole("button", { name: "Upload your own pattern" });
    assert.ok(screen.getByRole("heading", { level: 2, name: "Your patterns" }));
    assert.ok(screen.getByText(/Upload your own image to use as a pattern/));
    assert.equal(screen.queryByRole("link", { name: /sign in/i }), null);

    fireEvent.click(upload);
    await screen.findByRole("heading", { level: 3, name: "Sign in to upload your own pattern" });
    assert.ok(screen.getByText(/Your uploads are private to your account/));
    fireEvent.click(screen.getByRole("button", { name: "Continue with our patterns" }));
    const reopened = await screen.findByRole("button", { name: "Upload your own pattern" });
    await waitFor(() => assert.equal(document.activeElement, reopened));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not offer uploads, or their sign-in, when uploads are disabled", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = withUploadAvailability(false, async (input, init) => {
    const url = String(input);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/auth/login")) return json({ account: { email: "patterns@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" }, token: "S".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/account")) return json({ email: "patterns@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" });
    if (url.endsWith("/account/sessions")) return json([]);
    throw new Error(`Unexpected request ${url}`);
  });
  try {
    const guest = render(<AuthProvider><ConfigurationProvider><YourPatterns /></ConfigurationProvider></AuthProvider>);
    await screen.findByText("Custom uploads aren't enabled in this demo.");
    assert.ok(screen.getByRole("heading", { level: 2, name: "Your patterns" }));
    assert.equal(screen.queryByRole("button", { name: "Upload your own pattern" }), null);
    assert.equal(screen.queryByRole("heading", { name: /Sign in to upload/ }), null);
    guest.unmount();

    render(<AuthProvider><SignInForTest><ConfigurationProvider><YourPatterns /></ConfigurationProvider></SignInForTest></AuthProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Enter test account" }));
    await screen.findByText("Custom uploads aren't enabled in this demo.");
    assert.equal(screen.queryByLabelText("Choose a pattern image"), null);
    // Signed in, the upload list is not even requested.
    assert.equal(requests.some((request) => request.endsWith("/uploads")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Nothing upload-related is on screen: no upload, no sign-in, no "off" claim.
function expectNoUploadOffer() {
  assert.equal(screen.queryByRole("button", { name: "Upload your own pattern" }), null);
  assert.equal(screen.queryByRole("heading", { name: /upload your own pattern/i }), null);
  assert.equal(screen.queryByRole("heading", { name: "Your patterns" }), null);
  assert.equal(screen.queryByText(/Custom uploads aren't enabled/), null);
}

test("offers nothing while availability is still unanswered, then follows the answer", async () => {
  const originalFetch = globalThis.fetch;
  let answer!: (response: Response) => void;
  let asked = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/uploads/availability")) {
      asked += 1;
      return new Promise<Response>((resolve) => { answer = resolve; });
    }
    throw new Error(`Unexpected request ${String(input)}`);
  };
  try {
    render(<AuthProvider><ConfigurationProvider><YourPatterns /></ConfigurationProvider></AuthProvider>);
    await waitFor(() => assert.equal(asked, 1));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });
    expectNoUploadOffer();

    await act(async () => { answer(json({ enabled: true })); });
    assert.ok(await screen.findByRole("button", { name: "Upload your own pattern" }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const [failure, respond] of [
  ["an error response", () => json({ errors: [{ code: "service_unavailable", message: "Unavailable.", location: ["service"] }] }, 503)],
  ["a network failure", () => { throw new TypeError("Failed to fetch"); }],
  ["a malformed answer", () => json({ enabled: "yes" })],
] as const) {
  test(`fails closed when availability ends in ${failure}`, async () => {
    const originalFetch = globalThis.fetch;
    let asked = 0;
    globalThis.fetch = async (input) => {
      if (String(input).endsWith("/uploads/availability")) {
        asked += 1;
        return respond();
      }
      throw new Error(`Unexpected request ${String(input)}`);
    };
    try {
      render(<AuthProvider><ConfigurationProvider><YourPatterns /></ConfigurationProvider></AuthProvider>);
      await waitFor(() => assert.ok(asked >= 1));
      // Let the client finish any retries and settle on its answer.
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2_000)); });
      expectNoUploadOffer();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("shows every Task 10.1 field in a read-only version summary", () => {
  render(<AuthProvider><ConfigurationReadonly configuration={projectConfiguration} /></AuthProvider>);
  for (const value of [
    "tapered", "73.25 cm", "49.75 cm", "61.5 cm", "13.5 cm",
    "Linen blend", "More relaxed fit", "Envelope opening", "Piped edge",
    "terrace-wave", "1.6×",
  ]) assert.ok(screen.getByText(value));
  assert.ok(screen.getByText(/Read-only preview/));
});

test("shows a saved solid fabric as a swatch, without the colour code", () => {
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
  assert.ok(screen.getAllByText("Solid colour").length > 0);
  assert.equal(document.body.textContent?.includes("#F5F2EB"), false);
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
  const requests: string[] = [];
  const states = ["awaiting_upload", "uploaded", "processing", "awaiting_moderation", "approved", "rejected", "failed", "deleted", "expired"].map(uploadState);
  globalThis.fetch = withUploadAvailability(true, async (input, init) => {
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
  });
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
    // Renaming asks inline, in the list item, with the label pre-filled.
    fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[4]);
    const labelField = screen.getByRole("textbox", { name: "New pattern label" }) as HTMLInputElement;
    assert.equal(labelField.value, "approved pattern");
    fireEvent.change(labelField, { target: { value: "Renamed pattern" } });
    fireEvent.click(screen.getByRole("button", { name: "Save label" }));
    await screen.findByText("Renamed pattern");
    assert.ok(requests.some((item) => item.includes("/assets/tile/access")));
    assert.ok(requests.some((item) => item.endsWith("/retry")));
    assert.ok(requests.some((item) => item.startsWith("PATCH")));
  } finally {
    globalThis.fetch = originalFetch;
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
  globalThis.fetch = withUploadAvailability(true, async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) return json({ account: { email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" }, token: "Q".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/account")) return json({ email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" });
    if (url.endsWith("/account/sessions")) return json([]);
    if (url.endsWith("/uploads")) return json([]);
    throw new Error(`Unexpected request GET ${url}`);
  });
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
  globalThis.fetch = withUploadAvailability(true, async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) return json({ account: { email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" }, token: "Q".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/uploads")) return json([]);
    throw new Error(`Unexpected request GET ${url}`);
  });
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
  globalThis.fetch = withUploadAvailability(true, async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) return json({ account: { email: "preview@example.com", createdAt: "2026-08-18T00:00:00Z", role: "customer" }, token: "Q".repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/uploads")) return json([]);
    throw new Error(`Unexpected request GET ${url}`);
  });
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

test("a wrong deletion passphrase keeps the session and later waits are explained", async () => {
  const originalFetch = globalThis.fetch;
  const deleteResponses = [
    () => json({ errors: [{ code: "authentication_failed", message: "Email or password could not be accepted.", location: ["body", "credentials"] }], requestId: "0123456789abcdef0123456789abcdef" }, 401),
    () => new Response(JSON.stringify({ errors: [{ code: "credential_throttled", message: "Too many incorrect passphrase attempts. Try again in 2 minutes.", location: ["request"] }], requestId: "0123456789abcdef0123456789abcdef" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "120" } }),
  ];
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/account") return json({ email: "owner@example.com", role: "customer", createdAt: "2026-10-01T00:00:00Z" });
    if (path === "/account/sessions") {
      return json([{ id: 1, createdAt: "2026-10-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", revokedAt: null, current: true }]);
    }
    if (path === "/account/delete") return deleteResponses.shift()!();
    return json({ errors: [{ code: "resource_not_found", message: "Resource not found.", location: ["path"] }] }, 404);
  };
  storeSessionToken("D".repeat(43));
  try {
    render(<AuthProvider><AccountScreen /></AuthProvider>);
    // Wait until the screen has loaded its session list: that load resets the
    // error message, so submitting before it finishes would race with it.
    await screen.findByText(/Current session/, undefined, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: "Review account deletion" }));
    const passphrase = screen.getByLabelText("Re-enter your passphrase to confirm");
    fireEvent.change(passphrase, { target: { value: "not the right passphrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    await screen.findByText("That passphrase is incorrect. Check it and try again.");
    assert.equal(readSessionToken(), "D".repeat(43), "the session survives a wrong passphrase");
    assert.ok(screen.getByRole("heading", { name: "Delete account" }));

    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));
    await screen.findByText("Too many incorrect passphrase attempts. Try again in 2 minutes.");
    assert.equal(readSessionToken(), "D".repeat(43));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
