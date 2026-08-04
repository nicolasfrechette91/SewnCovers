import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const exportDirectory = path.join(frontendDirectory, "out");
const isPagesExport =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true";
const basePath = isPagesExport ? "/sewncovers" : "";
const expectedApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(
  /\/+$/,
  "",
);

const expectedFiles = [
  "404.html",
  "favicon.ico",
  "index.html",
  path.join("configure", "index.html"),
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function stripQueryAndHash(url) {
  return url.split(/[?#]/, 1)[0];
}

function exportedFileForUrl(url) {
  const pathname = stripQueryAndHash(url);
  const withoutBasePath = basePath
    ? pathname.slice(basePath.length)
    : pathname;
  const relativePath = withoutBasePath.endsWith("/")
    ? `${withoutBasePath}index.html`
    : withoutBasePath;

  return path.resolve(exportDirectory, `.${relativePath}`);
}

for (const relativePath of expectedFiles) {
  const file = await stat(path.join(exportDirectory, relativePath));
  assert.equal(file.isFile(), true, `${relativePath} must be a file.`);
}

const files = await listFiles(exportDirectory);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
assert.equal(htmlFiles.length >= 3, true, "Expected all static HTML routes.");

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  const localUrls = Array.from(
    html.matchAll(/(?:href|src)="(\/[^"]*)"/g),
    (match) => match[1],
  );

  assert.match(html, /<meta name="description" content="[^"]+"\/>/);
  assert.match(
    html,
    new RegExp(
      `href="${basePath.replace(/\//g, "\\/")}\\/favicon\\.ico\\?`,
    ),
  );

  for (const url of localUrls) {
    if (isPagesExport) {
      assert.equal(
        url === basePath || url.startsWith(`${basePath}/`),
        true,
        `${path.relative(frontendDirectory, htmlFile)} contains an unprefixed local URL: ${url}`,
      );
    } else {
      assert.equal(
        url === "/sewncovers" || url.startsWith("/sewncovers/"),
        false,
        `${path.relative(frontendDirectory, htmlFile)} unexpectedly contains the Pages base path: ${url}`,
      );
    }

    const target = exportedFileForUrl(url);
    const targetStat = await stat(target).catch(() => undefined);
    assert.equal(
      targetStat?.isFile(),
      true,
      `${url} does not resolve to an exported file.`,
    );
  }
}

const homeHtml = await readFile(path.join(exportDirectory, "index.html"), "utf8");
const configureHtml = await readFile(
  path.join(exportDirectory, "configure", "index.html"),
  "utf8",
);
assert.match(homeHtml, /<title>SewnCovers \| Plan a cushion-cover design<\/title>/);
assert.match(
  configureHtml,
  /<title>Configure a cushion \| SewnCovers<\/title>/,
);
assert.match(homeHtml, new RegExp(`href="${basePath || ""}\\/"`));
assert.match(configureHtml, new RegExp(`href="${basePath || ""}\\/"`));

const textBundle = (
  await Promise.all(
    files
      .filter((file) => /\.(?:css|html|js)$/.test(file))
      .map((file) => readFile(file, "utf8")),
  )
).join("\n");

if (expectedApiUrl) {
  assert.equal(
    textBundle.includes(expectedApiUrl),
    true,
    "The configured public API URL was not embedded in the export.",
  );
}

assert.equal(
  textBundle.includes("http://api.sewncovers.test"),
  false,
  "The browser-test API URL must not appear in a deployable export.",
);

console.log(
  `Verified ${isPagesExport ? "GitHub Pages" : "ordinary"} static export (${files.length} files, ${htmlFiles.length} HTML routes).`,
);
