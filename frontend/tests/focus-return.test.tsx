import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React, { useEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { AccountScreen } from "../components/account";
import { ProductionOperationsScreen } from "../components/assurance/production-operations-screen";
import { DraftRestoredNotice } from "../components/configurator/draft-session";
import { ShapeSelectionStep } from "../components/configurator/shape-selection-step";
import { YourPatterns } from "../components/configurator/your-patterns";
import { AuthProvider } from "../context/auth";
import {
  ConfigurationProvider,
  useConfiguration,
  type ConfigurationState,
} from "../context/configuration";
import { storeSessionToken } from "../services/account-api";
import { reloadDraftFromStorage } from "../services/configurator-draft";
import { resetUploadAvailability } from "../services/upload-availability";
import { assertFocused } from "./focus-assertions";

// When an inline question closes (Escape, its cancel button or its confirm
// button) the control that was pressed is gone. Focus must land on the control
// that opened the question, or on a sensible neighbour, never on <body>.

const rectangle: ConfigurationState = {
  shape: "rectangle",
  width: 80,
  height: 40,
  backWidth: null,
  thickness: 10,
  unit: "cm",
  pattern: { kind: "built-in", patternId: "fern-trail" },
  patternScale: 1,
  materialId: "cotton-canvas",
  fitPreference: "standard",
  closureType: "zipper",
  seamStyle: "plain",
};

afterEach(() => {
  cleanup();
  resetUploadAvailability();
  window.sessionStorage.clear();
  window.localStorage.clear();
  reloadDraftFromStorage();
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function Seed({
  configuration,
}: Readonly<{ configuration: ConfigurationState }>) {
  const { dispatch } = useConfiguration();
  useEffect(() => {
    dispatch({ type: "restoreConfiguration", configuration });
  }, [configuration, dispatch]);
  return null;
}

function active(): Element | null {
  return document.activeElement;
}

test("the shape question returns focus to the chosen shape: cancel, Escape and confirm", () => {
  render(
    <AuthProvider>
      <ConfigurationProvider>
        <Seed configuration={rectangle} />
        <ShapeSelectionStep />
      </ConfigurationProvider>
    </AuthProvider>,
  );
  const round = () =>
    screen.getByRole("radio", { name: "Round cushion" }) as HTMLInputElement;
  const question = () =>
    screen.getByRole("heading", { name: "Use the same width and height?" });

  fireEvent.click(round());
  assertFocused(screen.getByRole("button", { name: "Use the width for both" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep current shape" }));
  assertFocused(round());
  assert.equal(round().checked, false);

  fireEvent.click(round());
  fireEvent.keyDown(question().parentElement!, { key: "Escape" });
  assert.equal(
    screen.queryByRole("heading", { name: "Use the same width and height?" }),
    null,
  );
  assertFocused(round());

  fireEvent.click(round());
  fireEvent.click(
    screen.getByRole("button", { name: "Use the width for both" }),
  );
  assertFocused(round());
  assert.equal(round().checked, true);
});

test("the start-again question returns focus: Escape, cancel and confirm", () => {
  let startedOver = 0;
  render(
    <AuthProvider>
      <ConfigurationProvider>
        <DraftRestoredNotice
          onStartOver={() => {
            startedOver += 1;
          }}
        />
      </ConfigurationProvider>
    </AuthProvider>,
  );
  const startNew = () =>
    screen.getByRole("button", { name: "Start a new design" });

  fireEvent.click(startNew());
  assertFocused(screen.getByRole("button", { name: "Keep designing" }));
  fireEvent.keyDown(active()!, { key: "Escape" });
  assertFocused(startNew());
  assert.equal(startedOver, 0);

  fireEvent.click(startNew());
  fireEvent.click(screen.getByRole("button", { name: "Keep designing" }));
  assertFocused(startNew());

  fireEvent.click(startNew());
  fireEvent.click(
    screen.getByRole("button", { name: "Clear and start again" }),
  );
  assert.equal(startedOver, 1);
});

test("account deletion returns focus to its button on Escape and Cancel", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/account")
      return json({
        email: "owner@example.com",
        role: "customer",
        createdAt: "2026-10-01T00:00:00Z",
      });
    if (path === "/account/sessions") {
      return json([
        {
          id: 1,
          createdAt: "2026-10-01T00:00:00Z",
          expiresAt: "2099-01-01T00:00:00Z",
          revokedAt: null,
          current: true,
        },
      ]);
    }
    return json(
      {
        errors: [
          {
            code: "resource_not_found",
            message: "Not found.",
            location: ["path"],
          },
        ],
      },
      404,
    );
  };
  storeSessionToken("D".repeat(43));
  try {
    render(
      <AuthProvider>
        <AccountScreen />
      </AuthProvider>,
    );
    await screen.findByText(/Current session/, undefined, { timeout: 5000 });
    const review = () =>
      screen.getByRole("button", { name: "Review account deletion" });

    fireEvent.click(review());
    const passphrase = screen.getByLabelText(
      "Re-enter your passphrase to confirm",
    );
    assertFocused(passphrase);
    fireEvent.keyDown(passphrase, { key: "Escape" });
    assert.equal(
      screen.queryByLabelText("Re-enter your passphrase to confirm"),
      null,
    );
    assertFocused(review());

    fireEvent.click(review());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    assertFocused(review());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function upload(label: string) {
  return {
    id: "A".repeat(22),
    label,
    state: "approved",
    moderationState: "approved",
    contentType: "image/png",
    byteSize: 100,
    width: 128,
    height: 96,
    processingVersion: "tile-v1",
    tileDerivativeId: "T".repeat(22),
    thumbnailDerivativeId: "N".repeat(22),
    processingAttempts: 0,
    moderationAttempts: 0,
    retryEligible: false,
    referencedByVersions: 2,
    createdAt: "2026-08-18T00:00:00Z",
    updatedAt: "2026-08-18T00:00:00Z",
    deletedAt: null,
  };
}

test("renaming and deleting an uploaded pattern return focus: Escape, cancel and confirm", async () => {
  const originalFetch = globalThis.fetch;
  let current = upload("Garden repeat");
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    if (path === "/uploads/availability") return json({ enabled: true });
    if (path === "/account")
      return json({
        email: "owner@example.com",
        role: "customer",
        createdAt: "2026-10-01T00:00:00Z",
      });
    if (path === "/account/sessions") {
      return json([
        {
          id: 1,
          createdAt: "2026-10-01T00:00:00Z",
          expiresAt: "2099-01-01T00:00:00Z",
          revokedAt: null,
          current: true,
        },
      ]);
    }
    if (path === "/uploads" && method === "GET") return json([current]);
    if (method === "PATCH") {
      current = {
        ...current,
        label: (JSON.parse(String(init?.body)) as { label: string }).label,
      };
      return json(current);
    }
    if (method === "DELETE") {
      current = { ...current, state: "deleted" };
      return json({
        id: current.id,
        state: "deleted",
        referencedByVersions: 2,
      });
    }
    return json(
      {
        errors: [
          {
            code: "resource_not_found",
            message: "Not found.",
            location: ["path"],
          },
        ],
      },
      404,
    );
  };
  storeSessionToken("E".repeat(43));
  try {
    render(
      <AuthProvider>
        <ConfigurationProvider>
          <YourPatterns />
        </ConfigurationProvider>
      </AuthProvider>,
    );
    await screen.findByText("Garden repeat");
    const rename = () => screen.getByRole("button", { name: "Rename" });
    const remove = () => screen.getByRole("button", { name: "Delete" });

    fireEvent.click(rename());
    const label = screen.getByRole("textbox", { name: "New pattern label" });
    assertFocused(label);
    fireEvent.keyDown(label, { key: "Escape" });
    assert.equal(
      screen.queryByRole("textbox", { name: "New pattern label" }),
      null,
    );
    assertFocused(rename());

    fireEvent.click(rename());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    assertFocused(rename());

    fireEvent.click(rename());
    fireEvent.change(
      screen.getByRole("textbox", { name: "New pattern label" }),
      { target: { value: "Garden repeat, larger" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save label" }));
    await screen.findByText("Garden repeat, larger");
    await waitFor(() =>
      assert.equal(active()?.textContent, "Pattern label updated."),
    );

    fireEvent.click(remove());
    const cancel = screen.getByRole("button", { name: "Cancel" });
    assertFocused(cancel);
    assert.match(
      screen.getByRole("group").textContent ?? "",
      /referenced by 2 saved versions/,
    );
    fireEvent.keyDown(cancel, { key: "Escape" });
    assertFocused(remove());

    fireEvent.click(remove());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    assertFocused(remove());

    fireEvent.click(remove());
    fireEvent.click(screen.getByRole("button", { name: "Delete pattern" }));
    await waitFor(() =>
      assert.match(active()?.textContent ?? "", /^Custom pattern deleted\./),
    );
    assert.notEqual(active(), document.body);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Ending a session removes the signed-in view, and the button that was pressed
// with it. The sign-in form that replaces it takes focus on its heading.
function accountFetch(
  role: "administrator" | "customer" = "customer",
): typeof fetch {
  return async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    if (path === "/account")
      return json({
        email: "owner@example.com",
        role,
        createdAt: "2026-10-01T00:00:00Z",
      });
    if (path === "/account/sessions" && method === "GET") {
      return json([
        {
          id: 1,
          createdAt: "2026-10-01T00:00:00Z",
          expiresAt: "2099-01-01T00:00:00Z",
          revokedAt: null,
          current: true,
        },
      ]);
    }
    if (
      path === "/auth/logout" ||
      path === "/auth/logout-all" ||
      /^\/account\/sessions\/\d+$/.test(path)
    ) {
      return new Response(null, { status: 204 });
    }
    if (path === "/account/delete") return json({ deleted: true });
    return json(
      {
        errors: [
          {
            code: "resource_not_found",
            message: "Not found.",
            location: ["path"],
          },
        ],
      },
      404,
    );
  };
}

for (const route of [
  "Sign out",
  "Sign out everywhere",
  "Revoke this session",
  "Permanently delete account",
]) {
  test(`ending the session with "${route}" moves focus to the sign-in heading`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = accountFetch();
    storeSessionToken("S".repeat(43));
    try {
      render(
        <AuthProvider>
          <AccountScreen />
        </AuthProvider>,
      );
      await screen.findByText(/Current session/, undefined, { timeout: 5000 });
      if (route === "Permanently delete account") {
        fireEvent.click(
          screen.getByRole("button", { name: "Review account deletion" }),
        );
        fireEvent.change(
          screen.getByLabelText("Re-enter your passphrase to confirm"),
          { target: { value: "correct horse battery staple" } },
        );
      }
      const pressed = screen.getByRole("button", { name: route });
      pressed.focus();
      fireEvent.click(pressed);

      const heading = await screen.findByRole("heading", { name: "Sign in" });
      await waitFor(() => assertFocused(heading));
      assert.notEqual(active(), document.body);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

const work = {
  id: "W".repeat(22),
  orderReference: "SC-DEMO-WORK0001",
  lineIndex: 0,
  state: "review",
  qualityState: "pending",
  revision: 1,
  specification: { shape: "box" },
  checklist: [{ itemKey: "specification_review", status: "pending" }],
  issues: [],
  history: [
    {
      action: "created",
      toState: "review",
      createdAt: "2026-10-01T00:00:00Z",
    },
  ],
  demonstration: true,
};

// The production queue holds `work`; approving it answers once `answered`
// settles.
function productionFetch(answered: Promise<void> = Promise.resolve()) {
  const account = accountFetch("administrator");
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname === "/admin/production-work" && method === "GET") {
      return json({ items: [work], page: 1, pageSize: 20, total: 1 });
    }
    if (url.pathname.endsWith("/transition")) {
      await answered;
      return json({ ...work, state: "approved", revision: 2 });
    }
    return account(input, init);
  };
}

test("a work step button that is replaced hands focus to the work heading", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = productionFetch();
  storeSessionToken("A".repeat(43));
  try {
    render(
      <AuthProvider>
        <ProductionOperationsScreen />
      </AuthProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /SC-DEMO-WORK0001/ }),
    );
    const heading = await screen.findByRole("heading", {
      name: `Work ${work.id}`,
    });

    const approve = screen.getByRole("button", { name: "Approve work" });
    approve.focus();
    assertFocused(approve);
    fireEvent.click(approve);

    await screen.findByRole("button", { name: "Start production" });
    assert.equal(screen.queryByRole("button", { name: "Approve work" }), null);
    await waitFor(() => assertFocused(heading));
    assert.notEqual(active(), document.body);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a work step leaves focus where the visitor moved it while the step ran", async () => {
  const originalFetch = globalThis.fetch;
  let answer!: () => void;
  globalThis.fetch = productionFetch(
    new Promise<void>((resolve) => {
      answer = resolve;
    }),
  );
  storeSessionToken("A".repeat(43));
  try {
    render(
      <AuthProvider>
        <ProductionOperationsScreen />
      </AuthProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /SC-DEMO-WORK0001/ }),
    );
    await screen.findByRole("heading", { name: `Work ${work.id}` });

    const approve = screen.getByRole("button", { name: "Approve work" });
    approve.focus();
    fireEvent.click(approve);
    const download = screen.getByRole("button", {
      name: "Download safe packet",
    });
    download.focus();
    answer();

    await screen.findByRole("button", { name: "Start production" });
    // React runs the step's effects in a setImmediate task queued before this
    // one, so focus is final once it resolves.
    await act(() => new Promise((resolve) => setImmediate(resolve)));
    assertFocused(download);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
