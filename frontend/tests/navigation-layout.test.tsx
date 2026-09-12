import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { AccountNavigation } from "../components/account";
import {
  SiteFooter,
  SiteHeader,
  isCurrentNavigationPath,
  normalizeNavigationPath,
} from "../components/layout";
import { AuthProvider } from "../context/auth";
import { storeSessionToken } from "../services/account-api";

const primaryItems = [
  { href: "/configure/", label: "Configure" },
  { href: "/projects/", label: "My projects" },
  { href: "/commerce/", label: "Pricing" },
] as const;
const utilityItems = [
  { href: "/cart/", label: "Cart" },
  { href: "/account/", label: "Account" },
] as const;

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function header(currentHref = "/configure/") {
  return (
    <SiteHeader
      currentHref={currentHref}
      primaryItems={primaryItems}
      utilityItems={utilityItems}
    />
  );
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function authenticatedAccount(role: "customer" | "administrator") {
  storeSessionToken("N".repeat(43));
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/account")) {
      return json({
        email: `${role}@example.invalid`,
        createdAt: "2026-08-30T00:00:00Z",
        role,
      });
    }
    if (url.endsWith("/account/sessions")) {
      return json([
        {
          id: 1,
          createdAt: "2026-08-30T00:00:00Z",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          revokedAt: null,
          current: true,
        },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
}

test("separates desktop primary and utility destinations", () => {
  render(header());
  const navigation = screen.getByRole("navigation", {
    name: "Primary navigation",
  });
  const primary = screen.getByRole("list", { name: "Primary destinations" });
  const utilities = screen.getByRole("list", { name: "Shopping and account" });

  assert.deepEqual(
    Array.from(primary.querySelectorAll("a"), (link) => link.textContent),
    ["Configure", "My projects", "Pricing"],
  );
  assert.deepEqual(
    Array.from(utilities.querySelectorAll("a"), (link) => link.textContent),
    ["Cart", "Account"],
  );
  for (const removed of ["Orders", "Admin", "Legal", "Trust", "Case study"]) {
    assert.equal(
      navigation.querySelector(`a[href$="/${removed.toLowerCase()}/"]`),
      null,
    );
  }
  assert.equal(
    screen.getByRole("link", { name: "SewnCovers home" }).getAttribute("href"),
    "/",
  );
});

test("opens and closes the mobile disclosure with state and focus restoration", () => {
  const view = render(header());
  const button = screen.getByRole("button", { name: "Menu" });
  const navigation = screen.getByRole("navigation", {
    name: "Primary navigation",
  });

  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(button.getAttribute("aria-controls"), "site-navigation-menu");
  assert.ok(
    document.getElementById("site-navigation-menu")?.classList.contains("hidden"),
  );

  fireEvent.click(button);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.ok(
    document.getElementById("site-navigation-menu")?.classList.contains("block"),
  );
  screen.getByRole("link", { name: "Pricing" }).focus();
  fireEvent.keyDown(navigation, { key: "Escape" });
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, button);

  fireEvent.click(button);
  view.rerender(header("/projects/"));
  assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("normalizes trailing slashes and the GitHub Pages base path", () => {
  assert.equal(normalizeNavigationPath("/configure"), "/configure/");
  assert.equal(
    normalizeNavigationPath("/SewnCovers/configure/?design=example", "/SewnCovers/"),
    "/configure/",
  );
  assert.equal(
    isCurrentNavigationPath(
      "/SewnCovers/configure",
      "/configure/",
      "/SewnCovers",
    ),
    true,
  );
  assert.equal(
    isCurrentNavigationPath("/orders/", "/account/"),
    false,
  );

  render(header("/configure"));
  const currentLinks = document.querySelectorAll('[aria-current="page"]');
  assert.equal(currentLinks.length, 1);
  assert.equal(currentLinks[0].textContent, "Configure");
});

test("keeps Case study, Legal, and Trust discoverable and current in the footer", () => {
  render(
    <SiteFooter
      currentHref="/legal/"
      navigationItems={[
        { href: "/case-study/", label: "Case study" },
        { href: "/legal/", label: "Legal and privacy" },
        { href: "/trust/", label: "Trust" },
        { href: "/.well-known/security.txt", label: "security.txt" },
      ]}
    />,
  );
  const footer = screen.getByRole("navigation", { name: "Footer navigation" });
  assert.ok(screen.getByRole("link", { name: "Case study" }));
  assert.ok(screen.getByRole("link", { name: "Legal and privacy" }));
  assert.ok(screen.getByRole("link", { name: "Trust" }));
  assert.ok(screen.getByRole("link", { name: "security.txt" }));
  assert.equal(footer.querySelectorAll("a").length, 4);
  assert.equal(
    screen.getByRole("link", { name: "Legal and privacy" }).getAttribute(
      "aria-current",
    ),
    "page",
  );
});

test("shows Orders but not Administration in a verified customer account", async () => {
  authenticatedAccount("customer");
  render(
    <AuthProvider>
      <AccountNavigation currentHref="/orders/" />
    </AuthProvider>,
  );

  const orders = await screen.findByRole("link", { name: "Orders" });
  assert.equal(orders.getAttribute("aria-current"), "page");
  assert.equal(screen.queryByRole("link", { name: "Administration" }), null);
});

test("shows Administration only after a verified administrator session", async () => {
  authenticatedAccount("administrator");
  render(
    <AuthProvider>
      <AccountNavigation currentHref="/account/" />
    </AuthProvider>,
  );

  await waitFor(() =>
    assert.ok(screen.getByRole("link", { name: "Administration" })),
  );
  assert.ok(screen.getByRole("link", { name: "Orders" }));
});
