import { defineConfig } from "@playwright/test";

const origin = "http://127.0.0.1:3100";
// GitHub Actions sets CI. Runners are slower and noisier than a workstation,
// so CI gets one retry and a longer suite limit; local runs stay strict.
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // Everything the runner writes stays under the git-ignored .playwright/.
  outputDir: ".playwright/test-results",
  globalTimeout: isCI ? 600_000 : 240_000,
  timeout: 45_000,
  fullyParallel: false,
  workers: 2,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [
        ["line"],
        ["github"],
        ["html", { open: "never", outputFolder: ".playwright/report" }],
        // The job summary names any test that passed only on the retry.
        ["./e2e/support/retry-summary-reporter.ts"],
      ]
    : "line",
  use: {
    baseURL: origin,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
});
