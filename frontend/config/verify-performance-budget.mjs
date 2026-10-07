// First-load JavaScript budgets, measured on the ordinary (root) build.
//
// Raw first-load bytes are mostly React and the Next.js runtime, which move
// with every framework release. This check reads the source maps that the
// ordinary build emits and attributes every byte of each route's first-load
// chunks to one of:
//
//   app        code from this repository (components, context, data, services)
//   framework  node_modules (Next.js, its bundled React, SWC helpers) and the
//              Turbopack runtime
//   glue       bytes no source maps to (module wrappers and separators)
//
// Two budgets per route:
//
//   app       raw minified app bytes: the number this repository controls.
//   transfer  gzip bytes of every first-load chunk: roughly what a visitor
//             downloads. Catches a new heavy dependency or framework growth.
//
// Run `npm run build` (without SEWNCOVERS_GITHUB_PAGES) first. The Pages build
// ships without source maps, and differs from the root build only by the
// base-path strings.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const frontendUrl = new URL("../", import.meta.url);
const statsUrl = new URL(".next/diagnostics/route-bundle-stats.json", frontendUrl);

// Measured on Next.js 16.3.8 in October 2026 (docs/testing.md has the table).
// App budgets leave about 25 percent of headroom, transfer budgets about 15
// percent, which absorbs a framework patch of roughly 15 percent.
const budgets = new Map([
  ["/", { app: 55_000, transfer: 175_000 }],
  ["/configure", { app: 130_000, transfer: 200_000 }],
  ["/commerce", { app: 98_000, transfer: 185_000 }],
  ["/admin", { app: 125_000, transfer: 190_000 }],
]);

const base64Digits = new Map(
  [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map(
    (character, index) => [character, index],
  ),
);

function decodeVlq(text) {
  const values = [];
  let value = 0;
  let shift = 0;

  for (const character of text) {
    const digit = base64Digits.get(character);
    assert.notEqual(digit, undefined, `Invalid source-map character "${character}".`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }

  return values;
}

function categoryOf(source) {
  return /\/node_modules\/|\[turbopack\]/.test(source) ? "framework" : "app";
}

// Adds [column, category] marks per generated line for one (non-indexed) map.
function addMarks(map, lineOffset, columnOffset, marks) {
  let sourceIndex = 0;

  map.mappings.split(";").forEach((line, lineIndex) => {
    const generatedLine = lineOffset + lineIndex;
    let column = lineIndex === 0 ? columnOffset : 0;

    for (const segment of line.split(",")) {
      if (segment === "") {
        continue;
      }

      const [columnDelta, sourceDelta] = decodeVlq(segment);
      column += columnDelta;
      let category = "glue";
      if (sourceDelta !== undefined) {
        sourceIndex += sourceDelta;
        category = categoryOf(map.sources[sourceIndex]);
      }
      (marks[generatedLine] ??= []).push([column, category]);
    }
  });
}

function attributeChunk(chunkPath) {
  const chunkUrl = new URL(chunkPath.replaceAll("\\", "/"), frontendUrl);
  const source = readFileSync(chunkUrl, "utf8");
  const mapName = /\/\/# sourceMappingURL=([^\s]+)\s*$/.exec(source)?.[1];
  const mapUrl = mapName ? new URL(mapName, chunkUrl) : undefined;

  assert.ok(
    mapUrl && existsSync(mapUrl),
    `No source map for ${chunkPath}. Run \`npm run build\` without SEWNCOVERS_GITHUB_PAGES before this check; the Pages build has no source maps.`,
  );

  // The Pages build has no trailing map comment, so it is not counted.
  const code = source.replace(/\n?\/\/# sourceMappingURL=[^\n]*\s*$/, "");
  const map = JSON.parse(readFileSync(mapUrl, "utf8"));
  const marks = [];

  if (map.sections) {
    for (const { offset, map: sectionMap } of map.sections) {
      (marks[offset.line] ??= []).push([offset.column, "glue"]);
      addMarks(sectionMap, offset.line, offset.column, marks);
    }
  } else {
    addMarks(map, 0, 0, marks);
  }

  const bytes = { app: 0, framework: 0, glue: 0 };

  code.split("\n").forEach((line, lineIndex) => {
    // Separator newlines and anything before a line's first mark are glue.
    bytes.glue += lineIndex === 0 ? 0 : 1;
    const lineMarks = (marks[lineIndex] ?? []).sort((a, b) => a[0] - b[0]);
    let previousColumn = 0;
    let previousCategory = "glue";

    for (const [column, category] of [...lineMarks, [line.length, "glue"]]) {
      bytes[previousCategory] += Buffer.byteLength(line.slice(previousColumn, column));
      previousColumn = column;
      previousCategory = category;
    }
  });

  return { bytes, code, gzip: gzipSync(code).length };
}

const stats = JSON.parse(readFileSync(statsUrl, "utf8"));
const byRoute = new Map(stats.map((entry) => [entry.route, entry]));
const chunkCache = new Map();
const failures = [];
const rows = [];

for (const [route, budget] of budgets) {
  const entry = byRoute.get(route);
  assert.ok(entry, `Missing route-bundle statistics for ${route}.`);

  const totals = { app: 0, framework: 0, glue: 0, transfer: 0 };
  for (const chunkPath of entry.firstLoadChunkPaths) {
    if (!chunkCache.has(chunkPath)) {
      chunkCache.set(chunkPath, attributeChunk(chunkPath));
    }
    const chunk = chunkCache.get(chunkPath);
    totals.app += chunk.bytes.app;
    totals.framework += chunk.bytes.framework;
    totals.glue += chunk.bytes.glue;
    totals.transfer += chunk.gzip;
  }

  rows.push({
    route,
    "app (raw)": `${totals.app} / ${budget.app}`,
    "framework (raw)": totals.framework,
    "glue (raw)": totals.glue,
    "transfer (gzip)": `${totals.transfer} / ${budget.transfer}`,
  });
  if (totals.app > budget.app) {
    failures.push(`${route} app code is ${totals.app} bytes; budget is ${budget.app}.`);
  }
  if (totals.transfer > budget.transfer) {
    failures.push(
      `${route} first-load transfer is ${totals.transfer} gzip bytes; budget is ${budget.transfer}.`,
    );
  }
}

console.table(rows);

const initialSource = byRoute
  .get("/configure")
  .firstLoadChunkPaths.map((chunkPath) => chunkCache.get(chunkPath).code)
  .join("\n");
if (/Search built-in patterns/.test(initialSource)) {
  failures.push("The Pattern stage entered the initial configurator chunks.");
}

assert.deepEqual(failures, [], failures.join("\n"));
console.log(`Performance budgets passed (${budgets.size} routes).`);
