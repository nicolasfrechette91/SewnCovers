import { appendFileSync } from "node:fs";
import path from "node:path";

import type { FullConfig, Reporter, Suite } from "@playwright/test/reporter";

export interface SummaryTest {
  /** Test file relative to the frontend, with the test's line. */
  location: string;
  title: string;
  outcome: "expected" | "unexpected" | "flaky" | "skipped";
  /** First line of the first failed attempt's error, if any. */
  firstError?: string;
}

/**
 * The Markdown for the GitHub job summary. A test that failed and then passed
 * on CI's retry leaves the job green, so it gets its own headline and table
 * instead of disappearing into the annotations.
 */
export function formatRetrySummary(
  layout: string,
  tests: readonly SummaryTest[],
): string {
  const flaky = tests.filter((test) => test.outcome === "flaky");
  const failed = tests.filter((test) => test.outcome === "unexpected");
  const passed = tests.filter((test) => test.outcome === "expected").length;

  if (flaky.length === 0 && failed.length === 0) {
    return `### Playwright (${layout}): all ${passed} tests passed on the first attempt\n\n`;
  }
  const headline = [
    failed.length > 0 ? `${count(failed.length)} failed` : "",
    flaky.length > 0 ? `${count(flaky.length)} passed only on retry` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `### ${failed.length > 0 ? "❌" : "⚠️"} Playwright (${layout}): ${headline}`,
    "",
  ];
  if (flaky.length > 0) {
    lines.push(
      `**Passed only on retry.** The first attempt failed, so ${flaky.length === 1 ? "this test is" : "these tests are"} flaky: the retry hides the failure, it does not fix it.`,
      "",
      ...table(flaky),
    );
  }
  if (failed.length > 0) {
    lines.push("**Failed on every attempt.**", "", ...table(failed));
  }
  lines.push(
    `${passed} passed on the first attempt, ${flaky.length} only on retry, ${failed.length} failed.`,
    "",
  );
  return lines.join("\n");
}

function count(tests: number): string {
  return tests === 1 ? "1 test" : `${tests} tests`;
}

function table(tests: readonly SummaryTest[]): string[] {
  return [
    "| Test | First failure |",
    "| --- | --- |",
    ...tests.map(
      (test) =>
        `| \`${test.location}\` ${cell(test.title)} | ${cell(test.firstError ?? "")} |`,
    ),
    "",
  ];
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function firstErrorLine(message: string | undefined): string | undefined {
  return message
    ?.replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .find((line) => line.trim() !== "")
    ?.trim()
    .slice(0, 200);
}

/**
 * Adds the retry summary to the GitHub job summary. Only reports: it never
 * changes the run's result, and a summary it cannot write is only a warning.
 */
export default class RetrySummaryReporter implements Reporter {
  private rootDir = "";
  private suite: Suite | undefined;

  onBegin(config: FullConfig, suite: Suite) {
    this.rootDir = path.dirname(config.configFile ?? config.rootDir);
    this.suite = suite;
  }

  onEnd() {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryFile || !this.suite) return;
    const layout =
      process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "github-pages" : "root";
    const tests = this.suite.allTests().map((test): SummaryTest => ({
      location: `${path.relative(this.rootDir, test.location.file).replaceAll("\\", "/")}:${test.location.line}`,
      title: test.title,
      outcome: test.outcome(),
      firstError: firstErrorLine(
        test.results.find((result) => result.status !== "passed")?.error
          ?.message,
      ),
    }));
    try {
      appendFileSync(summaryFile, formatRetrySummary(layout, tests));
    } catch (error) {
      console.warn(`Could not write the Playwright job summary: ${error}`);
    }
  }

  printsToStdio() {
    return false;
  }
}
