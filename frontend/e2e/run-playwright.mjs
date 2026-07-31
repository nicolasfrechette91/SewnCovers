import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "./static-server.mjs";

const frontendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const nextCli = path.join(
  frontendDirectory,
  "node_modules/next/dist/bin/next",
);
const playwrightCli = path.join(
  frontendDirectory,
  "node_modules/@playwright/test/cli.js",
);
const fontResponses = path.join(
  frontendDirectory,
  "e2e/font-responses.cjs",
);

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: frontendDirectory,
      env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`Command stopped by ${signal}.`));
        return;
      }

      resolve(code ?? 1);
    });
  });
}

const buildExitCode = await run([nextCli, "build"], {
  ...process.env,
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontResponses,
  NEXT_PUBLIC_API_URL: "http://api.sewncovers.test",
});

if (buildExitCode !== 0) {
  process.exitCode = buildExitCode;
} else {
  const server = await startStaticServer();

  try {
    process.exitCode = await run(
      [playwrightCli, "test", ...process.argv.slice(2)],
      process.env,
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}
