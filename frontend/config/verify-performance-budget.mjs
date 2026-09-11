import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stats = JSON.parse(
  readFileSync(new URL("../.next/diagnostics/route-bundle-stats.json", import.meta.url), "utf8"),
);
const byRoute = new Map(stats.map((entry) => [entry.route, entry]));
const budgets = new Map([
  ["/", 580_000],
  ["/configure", 630_000],
  ["/commerce", 625_000],
  ["/admin", 650_000],
]);

for (const [route, maximum] of budgets) {
  const entry = byRoute.get(route);
  assert.ok(entry, `Missing route-bundle statistics for ${route}.`);
  assert.ok(
    entry.firstLoadUncompressedJsBytes <= maximum,
    `${route} first-load JavaScript is ${entry.firstLoadUncompressedJsBytes} bytes; budget is ${maximum}.`,
  );
}

const configure = byRoute.get("/configure");
const initialSource = configure.firstLoadChunkPaths
  .map((path) => readFileSync(new URL(`../${path.replaceAll("\\", "/")}`, import.meta.url), "utf8"))
  .join("\n");
assert.doesNotMatch(
  initialSource,
  /Approximate interactive 3D preview/,
  "The optional WebGL renderer entered the initial configurator chunks.",
);
assert.doesNotMatch(
  initialSource,
  /Search built-in patterns/,
  "The Pattern stage entered the initial configurator chunks.",
);

console.log(
  `Performance budgets passed (${stats.length} routes; /configure ${configure.firstLoadUncompressedJsBytes} bytes).`,
);
