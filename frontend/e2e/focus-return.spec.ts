import { expect, test, type Page } from "@playwright/test";

import {
  api,
  base,
  corsHeaders,
  enableUploads,
  fixtures,
  id,
  work,
} from "./support/api-fixtures";
import {
  chooseRadio,
  expectStageFocused,
  type ConfiguratorStage,
} from "./support/keyboard";

// When an inline question, sign-in panel or menu closes (Escape, its cancel
// button, or its confirm button), keyboard focus goes to the control that
// opened it, or to a sensible neighbour when that control is gone. It never
// falls back to <body>, which would send a keyboard user back to the top of
// the page. Everything below drives the keyboard only.

const publicId = "AbCdEfGhIjKlMnOpQrStUv";

async function expectNotOnBody(page: Page) {
  expect(
    await page.evaluate(() => document.activeElement === document.body),
  ).toBe(false);
}

async function openStage(page: Page, stage: ConfiguratorStage) {
  await page.getByRole("button", { name: `Continue to ${stage}` }).click();
  await expectStageFocused(page, stage);
}

test("the shape question returns focus to the shape: cancel, Escape and confirm", async ({
  page,
}) => {
  await fixtures(page, "guest");
  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();

  const square = page.getByRole("radio", { name: "Square cushion" });
  const useWidth = page.getByRole("button", { name: "Use the width for both" });
  const keepShape = page.getByRole("button", { name: "Keep current shape" });

  await square.focus();
  await square.press("Space");
  await expect(useWidth).toBeFocused();
  await keepShape.press("Enter");
  await expect(keepShape).toHaveCount(0);
  await expect(square).toBeFocused();
  await expect(square).not.toBeChecked();

  await square.press("Space");
  await expect(useWidth).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(useWidth).toHaveCount(0);
  await expect(square).toBeFocused();
  await expect(square).not.toBeChecked();

  await square.press("Space");
  await useWidth.press("Enter");
  await expect(useWidth).toHaveCount(0);
  await expect(square).toBeFocused();
  await expect(square).toBeChecked();
});

test("starting a new design returns focus: Escape, cancel and confirm", async ({
  page,
}) => {
  await fixtures(page, "guest");
  await page.goto(`${base}/configure/`);
  await page.getByText("Rectangle cushion", { exact: true }).click();
  await page.reload();

  const startNew = page.getByRole("button", { name: "Start a new design" });
  const keepDesigning = page.getByRole("button", { name: "Keep designing" });
  const clear = page.getByRole("button", { name: "Clear and start again" });

  await startNew.focus();
  await startNew.press("Enter");
  await expect(keepDesigning).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(startNew).toBeFocused();

  await startNew.press("Enter");
  await keepDesigning.press("Enter");
  await expect(startNew).toBeFocused();

  await startNew.press("Enter");
  await expect(keepDesigning).toBeFocused();
  await clear.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Choose your cushion shape" }),
  ).toBeFocused();
});

test("closing a failed link's panel moves focus on to the stage heading", async ({
  page,
}) => {
  await fixtures(page, "guest");
  const missing = {
    errors: [
      { code: "resource_not_found", message: "Not found.", location: ["path"] },
    ],
  };
  await page.route(`${api}/designs/ZZZZZZZZZZZZZZZZZZZZZZ`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify(missing),
      headers: corsHeaders,
      status: 404,
    });
  });
  await page.route(`${api}/shares/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify(missing),
      headers: corsHeaders,
      status: 404,
    });
  });

  for (const link of [
    "?design=ZZZZZZZZZZZZZZZZZZZZZZ",
    `?share=${"H".repeat(43)}`,
  ]) {
    await page.goto(`${base}/configure/${link}`);
    const dismiss = page.getByRole("button", {
      name: "Continue with my configuration",
    });
    await dismiss.focus();
    await dismiss.press("Enter");
    await expect(dismiss).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Choose your cushion shape" }),
    ).toBeFocused();
  }
});

test("sign-in panels in the configurator return focus to what opened them", async ({
  page,
}) => {
  await fixtures(page, "guest");
  await enableUploads(page);
  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  for (const stage of ["Measurements", "Cover details", "Pattern"] as const)
    await openStage(page, stage);

  const upload = page.getByRole("button", { name: "Upload your own pattern" });
  await upload.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Sign in to upload your own pattern" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Continue with our patterns" })
    .press("Enter");
  await expect(upload).toBeFocused();

  await chooseRadio(page, "Terrace wave");
  for (const stage of ["Preview", "Review"] as const)
    await openStage(page, stage);

  for (const opener of ["Save to My projects", "Save and add to cart"]) {
    const button = page.getByRole("button", { name: opener, exact: true });
    await button.press("Enter");
    await expect(
      page.getByRole("heading", { name: /^(Sign in|Create an account) to/ }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Continue as guest" })
      .press("Enter");
    await expect(button).toBeFocused();
  }
});

test("renaming and deleting an uploaded pattern return focus: Escape, cancel and confirm", async ({
  page,
}) => {
  await fixtures(page, "customer");
  await enableUploads(page);
  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  for (const stage of ["Measurements", "Cover details", "Pattern"] as const)
    await openStage(page, stage);
  await expect(page.getByText("Garden repeat", { exact: true })).toBeVisible();

  const rename = page.getByRole("button", { name: "Rename" });
  const label = page.getByRole("textbox", { name: "New pattern label" });
  await rename.press("Enter");
  await expect(label).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(label).toHaveCount(0);
  await expect(rename).toBeFocused();

  await rename.press("Enter");
  await expect(label).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).press("Enter");
  await expect(rename).toBeFocused();

  await rename.press("Enter");
  await label.fill("Garden repeat, larger");
  await label.press("Enter");
  const status = page
    .getByRole("status")
    .filter({ hasText: "Pattern label updated." });
  await expect(status).toBeFocused();
  await expect(
    page.getByText("Garden repeat, larger", { exact: true }),
  ).toBeVisible();

  const remove = page.getByRole("button", { name: "Delete", exact: true });
  await remove.press("Enter");
  const cancel = page.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(remove).toBeFocused();

  await remove.press("Enter");
  await cancel.press("Enter");
  await expect(remove).toBeFocused();

  await remove.press("Enter");
  await expect(cancel).toBeFocused();
  await page.getByRole("button", { name: "Delete pattern" }).press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Custom pattern deleted." }),
  ).toBeFocused();
  await expectNotOnBody(page);
});

test("account deletion returns focus: Escape and cancel", async ({ page }) => {
  await fixtures(page, "customer");
  await page.goto(`${base}/account/`);
  const review = page.getByRole("button", { name: "Review account deletion" });
  const passphrase = page.locator("#delete-password");

  await review.press("Enter");
  await expect(passphrase).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(passphrase).toHaveCount(0);
  await expect(review).toBeFocused();

  await review.press("Enter");
  await expect(passphrase).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).press("Enter");
  await expect(review).toBeFocused();
});

test("project deletion returns focus: Escape, cancel and confirm", async ({
  page,
}) => {
  await fixtures(page, "customer");
  await page.route(`${api}/projects/${id}`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
    } else if (route.request().method() === "DELETE") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
    } else {
      await route.fallback();
    }
  });
  await page.goto(`${base}/projects/?project=${id}`);
  const review = page.getByRole("button", { name: "Review project deletion" });
  const confirm = page.getByRole("button", {
    name: "Permanently delete project",
  });

  await review.press("Enter");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(review).toBeFocused();

  await review.press("Enter");
  await expect(confirm).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).press("Enter");
  await expect(review).toBeFocused();

  // The project is gone, so the page's own landmark gets focus.
  await review.press("Enter");
  await confirm.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${base}/projects/$`));
  await expect(page.locator("#main-content")).toBeFocused();
});

test("administrator confirmations return focus: Escape, cancel and confirm", async ({
  page,
}) => {
  await fixtures(page, "administrator");
  await page.route(`${api}/admin/price-books/${id}/publish`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        id,
        version: 1,
        label: "Published",
        state: "published",
        currency: "CAD",
        configuration: { model: "demonstration-price-v1" },
        effectiveAt: "2026-08-28T12:00:00Z",
        publishedAt: "2026-08-28T12:00:00Z",
        createdAt: "2026-08-28T12:00:00Z",
      }),
      headers: corsHeaders,
    });
  });
  await page.goto(`${base}/admin/`);

  const review = page.getByRole("button", { name: "Review publication" });
  const cancel = page
    .getByRole("group", { name: /Confirm publication/ })
    .getByRole("button", { name: "Cancel" });
  await review.press("Enter");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(review).toBeFocused();

  await review.press("Enter");
  await cancel.press("Enter");
  await expect(review).toBeFocused();

  await review.press("Enter");
  await expect(cancel).toBeFocused();
  await page.getByRole("button", { name: "Confirm publish" }).press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "published and frozen" }),
  ).toBeFocused();

  await page
    .getByRole("button", { name: "Review specification" })
    .press("Enter");
  // Opening the order moves focus to its status once the order has loaded.
  await expect(
    page.getByRole("status").filter({ hasText: "Opened SC-DEMO-ORDER0001." }),
  ).toBeFocused();
  const reviewRefund = page.getByRole("button", { name: "Review refund" });
  const cancelRefund = page
    .getByRole("group", { name: "Confirm full refund" })
    .getByRole("button", { name: "Cancel" });
  await reviewRefund.press("Enter");
  await expect(cancelRefund).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reviewRefund).toBeFocused();

  await reviewRefund.press("Enter");
  await cancelRefund.press("Enter");
  await expect(reviewRefund).toBeFocused();
});

test("the menu returns focus to its button on Escape", async ({ page }) => {
  await fixtures(page, "guest");
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${base}/`);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Pricing" }).focus();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("ending the session moves focus to the sign-in heading, whichever way it ends", async ({
  page,
}) => {
  await fixtures(page, "customer");
  // The shared fixtures do not allow DELETE or know these endpoints.
  await page.route(
    new RegExp(`^${api}/(auth/logout(-all)?|account/(sessions/1|delete))$`),
    async (route) => {
      const method = route.request().method();
      if (method === "OPTIONS") {
        await route.fulfill({ headers: corsHeaders, status: 204 });
      } else if (route.request().url().endsWith("/account/delete")) {
        await route.fulfill({
          body: JSON.stringify({ deleted: true }),
          headers: corsHeaders,
        });
      } else {
        await route.fulfill({ headers: corsHeaders, status: 204 });
      }
    },
  );

  for (const route of [
    "Sign out",
    "Sign out everywhere",
    "Revoke this session",
    "Permanently delete account",
  ]) {
    await page.goto(`${base}/account/`);
    await expect(page.getByText("Current session")).toBeVisible();
    if (route === "Permanently delete account") {
      await page
        .getByRole("button", { name: "Review account deletion" })
        .press("Enter");
      await page
        .locator("#delete-password")
        .fill("correct horse battery staple");
    }
    await page.getByRole("button", { name: route, exact: true }).press("Enter");
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
      route,
    ).toBeFocused();
    await expectNotOnBody(page);
  }
});

test("a work step button that is replaced hands focus to the work heading", async ({
  page,
}) => {
  await fixtures(page, "administrator");
  await page.route(
    `${api}/admin/production-work/${work.id}/transition`,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ headers: corsHeaders, status: 204 });
        return;
      }
      await route.fulfill({
        body: JSON.stringify({ ...work, state: "approved", revision: 2 }),
        headers: corsHeaders,
      });
    },
  );
  await page.goto(`${base}/admin/`);

  await page.getByRole("button", { name: /SC-DEMO-WORK0001/ }).press("Enter");
  const heading = page.getByRole("heading", { name: `Work ${work.id}` });
  await expect(heading).toBeFocused();

  await page.getByRole("button", { name: "Approve work" }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Start production" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve work" })).toHaveCount(
    0,
  );
  await expect(heading).toBeFocused();
});
