import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Chooses a radio the way a keyboard user does. The choice cards hide the
 * native input and let a label cover it, so Playwright's own `check()` cannot
 * click the input itself; focusing it and pressing Space is the real gesture.
 */
export async function chooseRadio(page: Page, name: string | RegExp) {
  const radio = page.getByRole("radio", { name });
  await radio.focus();
  await page.keyboard.press("Space");
  await expect(radio).toBeChecked();
}

// `locator.press()` focuses its target and then sends the key. When the app
// moves focus in between (an action finishing, a stage mounting), the key
// lands on the new focus instead and the press is lost. So after anything
// that ends by moving focus, wait for focus to arrive before the next press.

/** Waits for focus to land on the element showing `text`, such as a status. */
export async function expectFocusOn(page: Page, text: string | RegExp) {
  await expect(page.locator(":focus")).toHaveText(text);
}

// Where the configurator puts focus once each stage has loaded.
const stageFocusTargets = {
  Measurements: (page: Page) =>
    page.getByRole("heading", { level: 1, name: /^Measure your / }),
  "Cover details": (page: Page) =>
    page.getByRole("heading", { level: 1, name: "Choose cover details" }),
  Pattern: (page: Page) =>
    page.getByRole("heading", { level: 1, name: "Choose a colour or pattern" }),
  Preview: (page: Page) => page.getByRole("slider", { name: "Pattern size" }),
  Review: (page: Page) =>
    page.getByRole("heading", {
      level: 1,
      name: "SewnCovers configuration summary",
    }),
} satisfies Record<string, (page: Page) => Locator>;

export type ConfiguratorStage = keyof typeof stageFocusTargets;

/**
 * Waits for focus to land on a configurator stage after Continue. Stages load
 * lazily and take focus a frame after they mount, so a control in the stage
 * can be pressed before then.
 */
export async function expectStageFocused(page: Page, stage: ConfiguratorStage) {
  await expect(stageFocusTargets[stage](page)).toBeFocused();
}
