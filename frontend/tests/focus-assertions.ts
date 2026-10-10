import assert from "node:assert/strict";

/**
 * Asserts that `expected` has focus, and names both elements when it fails.
 *
 * Do not compare DOM nodes with assert.equal. To describe a failure,
 * node:assert inspects both values to depth 1000 and diffs the results, and
 * React's __reactFiber$ properties lead from a rendered node through the
 * whole component tree. One such message took a minute and over 50 GB of
 * memory, and inside waitFor every poll that fails builds one.
 */
export function assertFocused(expected: Element | null): void {
  const focused = document.activeElement;
  if (focused !== expected) {
    assert.fail(
      `Expected focus on ${describe(expected)}, but it is on ${describe(focused)}.`,
    );
  }
}

function describe(element: Element | null): string {
  if (element === null) return "nothing";
  const name = (element.getAttribute("aria-label") ?? element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `<${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}> "${name}"`;
}
