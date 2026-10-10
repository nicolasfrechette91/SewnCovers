import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatRetrySummary,
  type SummaryTest,
} from "../e2e/support/retry-summary-reporter";

const passing: SummaryTest = {
  location: "e2e/landing-page.spec.ts:12",
  title: "landing page",
  outcome: "expected",
};
const flaky: SummaryTest = {
  location: "e2e/commerce-workflow.spec.ts:155",
  title: "sandbox quote-to-delivery workflow",
  outcome: "flaky",
  firstError: "Error: locator.press: Test timeout of 45000ms exceeded.",
};

test("a clean run says every test passed on the first attempt", () => {
  assert.equal(
    formatRetrySummary("root", [passing, passing]),
    "### Playwright (root): all 2 tests passed on the first attempt\n\n",
  );
});

test("a test that passed only on retry gets a warning headline and a row", () => {
  const summary = formatRetrySummary("github-pages", [passing, flaky]);

  assert.match(
    summary,
    /^### ⚠️ Playwright \(github-pages\): 1 test passed only on retry\n/,
  );
  assert.match(summary, /\*\*Passed only on retry\.\*\* .* this test is flaky/);
  assert.ok(
    summary.includes(
      "| `e2e/commerce-workflow.spec.ts:155` sandbox quote-to-delivery workflow | Error: locator.press: Test timeout of 45000ms exceeded. |",
    ),
  );
  assert.match(
    summary,
    /1 passed on the first attempt, 1 only on retry, 0 failed\./,
  );
});

test("failures lead the headline and keep their own table", () => {
  const summary = formatRetrySummary("root", [
    flaky,
    { ...flaky, location: "e2e/focus-return.spec.ts:40", outcome: "flaky" },
    {
      location: "e2e/navigation.spec.ts:7",
      title: "menu | closes",
      outcome: "unexpected",
      firstError: "Error: expected\nsecond line",
    },
  ]);

  assert.match(
    summary,
    /^### ❌ Playwright \(root\): 1 test failed, 2 tests passed only on retry\n/,
  );
  assert.match(summary, /these tests are flaky/);
  assert.match(summary, /\*\*Failed on every attempt\.\*\*/);
  // A pipe in a title or error must not split the table cell.
  assert.ok(
    summary.includes(
      "| `e2e/navigation.spec.ts:7` menu \\| closes | Error: expected second line |",
    ),
  );
});
