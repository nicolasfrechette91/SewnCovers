import { defineConfig } from "@playwright/test";

const origin = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".playwright",
  globalTimeout: 60_000,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: origin,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
});
