import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import React, { type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
// The context Next's useSearchParams reads; providing it lets a screen run
// outside the App Router with a chosen query.
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { ProductionOperationsScreen } from "../components/assurance/production-operations-screen";
import { CartScreen } from "../components/commerce/cart-screen";
import { OrdersScreen } from "../components/commerce/orders-screen";
import { PrivatePricingWorkspace } from "../components/commerce/pricing-quotes-screen";
import { AuthProvider } from "../context/auth";
import { storeSessionToken } from "../services/account-api";

// How the data screens load: no empty state before their own data (D7),
// loading when the orders view switches (D8), polling that waits for each
// answer, the operations queue's effective filters (D9) and a failed
// action's message surviving its reload (D10). Fixture values only.

const TOKEN = "D".repeat(43);
const ORDER_ID = "O".repeat(22);
const WORK_ID = "W".repeat(22);
const date = "2026-08-28T12:00:00Z";
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Request {
  readonly method: string;
  readonly path: string;
  readonly search: string;
  readonly signal: AbortSignal | null | undefined;
}

type Route = (
  request: Request,
) => Response | undefined | Promise<Response | undefined>;

let requests: Request[] = [];

// Restores an account of the given role, then answers with `route`.
function serve(role: "customer" | "administrator", route: Route): void {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? "GET",
      path: url.pathname,
      search: url.search,
      signal: init?.signal,
    };
    if (request.path === "/account")
      return json({ email: "person@example.invalid", createdAt: date, role });
    if (request.path === "/account/sessions")
      return json([
        {
          id: 1,
          createdAt: date,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          revokedAt: null,
          current: true,
        },
      ]);
    requests.push(request);
    const response = await route(request);
    if (!response) throw new Error(`Unexpected ${request.method} ${url}`);
    return response;
  };
}

function gate<T>() {
  let open!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

const configuration = {
  shape: "box",
  width: 73.25,
  height: 49.75,
  backWidth: null,
  thickness: 13.5,
  unit: "cm",
  pattern: { kind: "built-in", patternId: "terrace-wave" },
  patternScale: 1.6,
  materialId: "linen-blend",
  fitPreference: "relaxed",
  closureType: "envelope",
  seamStyle: "piped",
};

const quote = {
  id: "Q".repeat(22),
  demonstration: true,
  status: "active",
  modelLabel: "Demonstration CAD price model v1",
  priceBookVersion: 1,
  currency: "CAD",
  quantity: 1,
  unitAmountMinor: 10450,
  subtotalAmountMinor: 10450,
  subtotalFormatted: "$104.50 CAD",
  breakdown: [],
  taxTreatment: "Fictional tax.",
  shippingTreatment: "Fictional shipping.",
  projectVersionId: "V".repeat(22),
  configuration,
  createdAt: date,
  expiresAt: date,
  canCheckout: true,
  customAsset: null,
};

function order(paymentStatus: "pending" | "paid") {
  return {
    id: ORDER_ID,
    reference: "SC-DEMO-ORDER0001",
    demonstration: true,
    createdAt: date,
    state: paymentStatus === "paid" ? "paid" : "payment_pending",
    paymentStatus,
    currency: "CAD",
    subtotalAmountMinor: 10450,
    taxAmountMinor: 0,
    shippingAmountMinor: 0,
    totalAmountMinor: 10450,
    totalFormatted: "$104.50 CAD",
    lines: [],
    shipment: null,
    shippingAddress: null,
    timeline: [],
  };
}

function project(index: number) {
  const id = String(index).repeat(22);
  return {
    id,
    name: `Project ${index}`,
    versionCount: 1,
    updatedAt: date,
    privacy: "private",
    createdAt: date,
    currentVersion: {
      id: `V${index}`.padEnd(22, "v"),
      versionNumber: 1,
      configuration,
      createdAt: date,
      isCurrent: true,
    },
    activeShares: [],
  };
}

const work = {
  id: WORK_ID,
  orderReference: "SC-DEMO-WORK0001",
  lineIndex: 0,
  state: "review",
  qualityState: "pending",
  revision: 1,
  specification: { shape: "box" },
  checklist: [{ itemKey: "specification_review", status: "pending" }],
  issues: [],
  history: [],
  demonstration: true,
};

function withQuery(query: string, children: ReactNode) {
  return (
    <SearchParamsContext.Provider value={new URLSearchParams(query)}>
      {children}
    </SearchParamsContext.Provider>
  );
}

beforeEach(() => {
  requests = [];
  window.sessionStorage.clear();
  storeSessionToken(TOKEN);
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  window.sessionStorage.clear();
});

test("the cart never shows its empty state before its own answer (D7)", async () => {
  const cart = gate<void>();
  serve("customer", async ({ path }) => {
    if (path !== "/commerce/cart") return undefined;
    await cart.promise;
    return json({
      id: "K".repeat(22),
      demonstration: true,
      state: "active",
      currency: "CAD",
      lines: [
        { id: "L".repeat(22), quote, quantity: 1, extendedAmountMinor: 10450 },
      ],
      subtotalAmountMinor: 10450,
      subtotalFormatted: "$104.50 CAD",
      notices: [],
    });
  });
  let sawEmpty = false;
  const observer = new window.MutationObserver(() => {
    if (document.body.textContent?.includes("Your demonstration cart is empty"))
      sawEmpty = true;
  });
  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  try {
    render(
      <AuthProvider>
        <CartScreen />
      </AuthProvider>,
    );
    await waitFor(() => assert.equal(requests.length, 1));
    assert.ok(screen.getByText("Loading your demonstration cart…"));
    await act(async () => cart.open());
    await screen.findByText("Estimated subtotal");
  } finally {
    observer.disconnect();
  }
  assert.equal(sawEmpty, false);
});

test("switching from the order list to one order shows the loading state (D8)", async () => {
  const detail = gate<void>();
  serve("customer", async ({ path }) => {
    if (path === "/commerce/orders") return json([order("paid")]);
    if (path === `/commerce/orders/${ORDER_ID}`) {
      await detail.promise;
      return json(order("paid"));
    }
    return undefined;
  });
  const view = render(
    <AuthProvider>{withQuery("", <OrdersScreen />)}</AuthProvider>,
  );
  await screen.findByRole("link", { name: "View order details and timeline" });

  view.rerender(
    <AuthProvider>
      {withQuery(`order=${ORDER_ID}`, <OrdersScreen />)}
    </AuthProvider>,
  );
  assert.ok(screen.getByText("Checking order status…"));
  assert.equal(screen.queryByRole("link", { name: "All orders" }), null);
  await act(async () => detail.open());
  await screen.findByText("Configuration snapshot");
  assert.ok(screen.getByRole("link", { name: "All orders" }));
});

test("after checkout the order is asked again 2 s after each answer, until payment settles", async () => {
  const polls = new Map<number, () => void>();
  let nextTimer = 1_000_000;
  globalThis.setTimeout = ((callback: () => void, delay?: number) => {
    if (delay !== 2_000) return originalSetTimeout(callback, delay);
    const id = nextTimer++;
    polls.set(id, callback);
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => {
    if (id !== undefined && polls.delete(id)) return;
    originalClearTimeout(id);
  }) as typeof clearTimeout;
  const firePoll = () => {
    const [entry] = polls;
    assert.ok(entry, "no poll is scheduled");
    polls.delete(entry[0]);
    entry[1]();
  };
  const answers = [gate<void>(), gate<void>(), gate<void>()];
  serve("customer", async ({ path }) => {
    if (path !== `/commerce/orders/${ORDER_ID}`) return undefined;
    const answer = answers[requests.length - 1];
    await answer.promise;
    return json(order(requests.length < 3 ? "pending" : "paid"));
  });
  render(
    <AuthProvider>
      {withQuery(`order=${ORDER_ID}`, <OrdersScreen pollPending />)}
    </AuthProvider>,
  );
  await waitFor(() => assert.equal(requests.length, 1));
  assert.equal(
    polls.size,
    0,
    "nothing scheduled while the first answer is out",
  );

  await act(async () => answers[0].open());
  await screen.findByText("Configuration snapshot");
  await waitFor(() => assert.equal(polls.size, 1));
  await act(async () => firePoll());
  await waitFor(() => assert.equal(requests.length, 2));
  assert.equal(polls.size, 0, "nothing scheduled while a poll is out");
  assert.ok(
    screen.getByText("Configuration snapshot"),
    "polls in the background",
  );

  await act(async () => answers[1].open());
  await waitFor(() => assert.equal(polls.size, 1));
  await act(async () => firePoll());
  await act(async () => answers[2].open());
  await waitFor(() => assert.ok(screen.getAllByText("Paid").length > 0));
  assert.equal(polls.size, 0, "a settled payment stops polling");
  assert.equal(requests.length, 3);
});

test("pricing preselects the first project's current version", async () => {
  serve("customer", ({ path }) => {
    if (path === "/projects")
      return json(
        [project(1), project(2)].map(
          ({ id, name, versionCount, updatedAt, privacy }) => ({
            id,
            name,
            versionCount,
            updatedAt,
            privacy,
          }),
        ),
      );
    if (path === `/projects/${"1".repeat(22)}`) return json(project(1));
    if (path === `/projects/${"2".repeat(22)}`) return json(project(2));
    if (path === "/commerce/quotes") return json([]);
    return undefined;
  });
  render(
    <AuthProvider>
      <PrivatePricingWorkspace requestedVersion={null} />
    </AuthProvider>,
  );
  const select = (await screen.findByLabelText(
    "Saved version",
  )) as HTMLSelectElement;
  assert.equal(select.value, project(1).currentVersion.id);
});

test("operations asks again only when the effective filters change (D9)", async () => {
  serve("administrator", ({ path }) =>
    path === "/admin/production-work"
      ? json({ items: [work], page: 1, pageSize: 20, total: 1 })
      : undefined,
  );
  render(
    <AuthProvider>
      <ProductionOperationsScreen />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: /SC-DEMO-WORK0001/ });
  assert.deepEqual(
    requests.map(({ search }) => search),
    ["?page=1&pageSize=20"],
  );
  const search = screen.getByLabelText("Search order or work reference");

  fireEvent.change(search, { target: { value: "S" } });
  fireEvent.change(search, { target: { value: "  " } });
  await act(async () => undefined);
  assert.equal(requests.length, 1, "a one-letter search asks nothing");
  fireEvent.change(search, { target: { value: "SC" } });
  await waitFor(() => assert.equal(requests.length, 2));
  fireEvent.change(search, { target: { value: " SC " } });
  await act(async () => undefined);
  assert.deepEqual(
    requests.map(({ search: query }) => query),
    ["?page=1&pageSize=20", "?page=1&pageSize=20&search=SC"],
  );
});

test("operations shows the latest filter's answer and drops an earlier one", async () => {
  const answers = new Map<string, ReturnType<typeof gate<void>>>();
  serve("administrator", async ({ path, search }) => {
    if (path !== "/admin/production-work") return undefined;
    const state = new URLSearchParams(search).get("state") ?? "all";
    if (state !== "all") {
      const answer = gate<void>();
      answers.set(state, answer);
      await answer.promise;
    }
    return json({
      items: [{ ...work, orderReference: `SC-DEMO-${state.toUpperCase()}` }],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });
  render(
    <AuthProvider>
      <ProductionOperationsScreen />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: /SC-DEMO-ALL/ });
  const state = screen.getByLabelText("Work state");

  fireEvent.change(state, { target: { value: "review" } });
  await waitFor(() => assert.ok(answers.has("review")));
  assert.ok(screen.getByText("Loading production work…"));
  assert.ok(
    screen.getByRole("button", { name: /SC-DEMO-ALL/ }),
    "the list stays",
  );
  fireEvent.change(state, { target: { value: "approved" } });
  await waitFor(() => assert.ok(answers.has("approved")));
  assert.equal(requests.at(-2)?.signal?.aborted, true);

  await act(async () => answers.get("review")?.open());
  await act(async () => answers.get("approved")?.open());
  await screen.findByRole("button", { name: /SC-DEMO-APPROVED/ });
  assert.equal(screen.queryByRole("button", { name: /SC-DEMO-REVIEW/ }), null);
});

test("a failed operations action keeps its advice after the reload (D10)", async () => {
  serve("administrator", ({ method, path }) => {
    if (path === "/admin/production-work")
      return json({ items: [work], page: 1, pageSize: 20, total: 1 });
    if (method === "PUT" && path.includes("/checklist/"))
      return json(
        {
          errors: [
            {
              code: "revision_conflict",
              message: "Fictional revision conflict.",
              location: ["expectedRevision"],
            },
          ],
        },
        409,
      );
    return undefined;
  });
  render(
    <AuthProvider>
      <ProductionOperationsScreen />
    </AuthProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /SC-DEMO-WORK0001/ }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Complete" }));

  await waitFor(() =>
    assert.equal(
      requests.filter(({ path }) => path === "/admin/production-work").length,
      2,
    ),
  );
  await screen.findByText(
    "Fictional revision conflict. Reload the current revision and retry.",
  );
  assert.equal(screen.queryByText("Loading production work…"), null);
});
