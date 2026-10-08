import { expect, type Page } from "@playwright/test";

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
