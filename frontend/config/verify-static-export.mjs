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
const basePath = isPagesExport ? "/SewnCovers" : "";
const productionOrigin = "https://nicolasfrechette91.github.io";
const productionBasePath = "/SewnCovers";
const productionSiteUrl = `${productionOrigin}${productionBasePath}/`;
const socialImageUrl = `${productionSiteUrl}social-preview.jpg`;
const productionApiUrl = "https://sewncovers-api.onrender.com";
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(
  /\/+$/,
  "",
);
const expectedApiUrl = isPagesExport ? productionApiUrl : configuredApiUrl;

if (isPagesExport) {
  assert.equal(
    configuredApiUrl,
    productionApiUrl,
    "The GitHub Pages export must be built with the exact production API URL.",
  );
}

const expectedFiles = [
  "404.html",
  "favicon.ico",
  "index.html",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
  "social-preview.jpg",
  path.join("account", "index.html"),
  path.join("configure", "index.html"),
  path.join("projects", "index.html"),
  path.join("commerce", "index.html"),
  path.join("cart", "index.html"),
  path.join("case-study", "index.html"),
  path.join("orders", "index.html"),
  path.join("admin", "index.html"),
  path.join("legal", "index.html"),
  path.join("trust", "index.html"),
  path.join(".well-known", "security.txt"),
  path.join("checkout", "sandbox", "index.html"),
  path.join("checkout", "return", "index.html"),
  path.join("checkout", "cancel", "index.html"),
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

function exportedFileForCanonical(url) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, productionOrigin);
  assert.equal(parsed.pathname.startsWith(`${productionBasePath}/`), true);
  const pathname = parsed.pathname.slice(productionBasePath.length);
  const relativePath = pathname.endsWith("/")
    ? `${pathname}index.html`
    : pathname;
  return path.resolve(exportDirectory, `.${relativePath}`);
}

function readJpegDimensions(buffer) {
  assert.equal(buffer[0], 0xff);
  assert.equal(buffer[1], 0xd8);

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  throw new Error("social-preview.jpg does not contain JPEG dimensions.");
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
        url === "/SewnCovers" || url.startsWith("/SewnCovers/"),
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
const accountHtml = await readFile(
  path.join(exportDirectory, "account", "index.html"),
  "utf8",
);
const projectsHtml = await readFile(
  path.join(exportDirectory, "projects", "index.html"),
  "utf8",
);
const commerceHtml = await readFile(path.join(exportDirectory, "commerce", "index.html"), "utf8");
const caseStudyHtml = await readFile(path.join(exportDirectory, "case-study", "index.html"), "utf8");
const ordersHtml = await readFile(path.join(exportDirectory, "orders", "index.html"), "utf8");
const adminHtml = await readFile(path.join(exportDirectory, "admin", "index.html"), "utf8");
const legalHtml = await readFile(path.join(exportDirectory, "legal", "index.html"), "utf8");
const trustHtml = await readFile(path.join(exportDirectory, "trust", "index.html"), "utf8");
const cartHtml = await readFile(path.join(exportDirectory, "cart", "index.html"), "utf8");
const checkoutSandboxHtml = await readFile(path.join(exportDirectory, "checkout", "sandbox", "index.html"), "utf8");
const checkoutReturnHtml = await readFile(path.join(exportDirectory, "checkout", "return", "index.html"), "utf8");
const checkoutCancelHtml = await readFile(path.join(exportDirectory, "checkout", "cancel", "index.html"), "utf8");
const notFoundHtml = await readFile(path.join(exportDirectory, "404.html"), "utf8");

const publicPages = new Map([
  [homeHtml, ["SewnCovers | Cushion-cover design prototype", productionSiteUrl]],
  [configureHtml, ["Configure a cushion | SewnCovers", `${productionSiteUrl}configure/`]],
  [commerceHtml, ["Prototype pricing | SewnCovers", `${productionSiteUrl}commerce/`]],
  [trustHtml, ["Trust and implementation boundaries | SewnCovers", `${productionSiteUrl}trust/`]],
  [legalHtml, ["Legal and consent information | SewnCovers", `${productionSiteUrl}legal/`]],
  [caseStudyHtml, ["Case study | SewnCovers", `${productionSiteUrl}case-study/`]],
]);

for (const [html, [title, canonical]] of publicPages) {
  assert.match(html, new RegExp(`<title>${title.replace(/[|]/g, "\\|")}<\\/title>`));
  assert.match(html, /<meta name="description" content="[^"]+"\/>/);
  assert.match(html, /<meta name="robots" content="index, follow"\/>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}"\\/>`));
  assert.match(html, new RegExp(`<meta property="og:title" content="${title.replace(/[|]/g, "\\|")}"\\/>`));
  assert.match(html, /<meta property="og:description" content="[^"]+"\/>/);
  assert.match(html, new RegExp(`<meta property="og:url" content="${canonical}"\\/>`));
  assert.match(html, /<meta property="og:site_name" content="SewnCovers"\/>/);
  assert.match(html, new RegExp(`<meta property="og:image" content="${socialImageUrl}"\\/>`));
  assert.match(html, /<meta property="og:image:type" content="image\/jpeg"\/>/);
  assert.match(html, /<meta property="og:image:width" content="1200"\/>/);
  assert.match(html, /<meta property="og:image:height" content="630"\/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"\/>/);
  assert.match(html, new RegExp(`<meta name="twitter:image" content="${socialImageUrl}"\\/>`));
  assert.doesNotMatch(canonical, /localhost|[?#]/);
}

const privatePages = [
  accountHtml,
  projectsHtml,
  cartHtml,
  ordersHtml,
  adminHtml,
  checkoutSandboxHtml,
  checkoutReturnHtml,
  checkoutCancelHtml,
];
for (const html of privatePages) {
  assert.match(html, /<meta name="robots" content="noindex, nofollow, nocache"\/>/);
  assert.match(html, /<meta name="googlebot" content="noindex, nofollow, noimageindex"\/>/);
  assert.doesNotMatch(html, /<link rel="canonical" href="[^"]*[?#][^"]*"\/>/);
}

assert.match(homeHtml, /<meta property="og:description" content="Explore a portfolio prototype/);
assert.match(homeHtml, /<meta name="twitter:description" content="Explore a portfolio prototype/);
assert.match(
  configureHtml,
  /<title>Configure a cushion \| SewnCovers<\/title>/,
);
assert.match(accountHtml, /<title>Account \| SewnCovers<\/title>/);
assert.match(projectsHtml, /<title>My projects \| SewnCovers<\/title>/);
assert.match(commerceHtml, /<title>Prototype pricing \| SewnCovers<\/title>/);
assert.match(commerceHtml, /How demonstration prices work/);
assert.match(commerceHtml, /Everyday square cushion/);
assert.match(commerceHtml, /\$75\.25 CAD/);
assert.match(
  commerceHtml,
  new RegExp(`href="${(basePath || "").replace(/\//g, "\\/")}\\/configure\\/"[^>]*>Start configuring<\\/a>`),
);
assert.match(commerceHtml, /returnTo=pricing/);
assert.match(ordersHtml, /<title>Demonstration orders \| SewnCovers<\/title>/);
assert.match(adminHtml, /<title>Demonstration administration \| SewnCovers<\/title>/);
assert.match(legalHtml, /<title>Legal and consent information \| SewnCovers<\/title>/);
assert.match(trustHtml, /<title>Trust and implementation boundaries \| SewnCovers<\/title>/);
assert.match(caseStudyHtml, /<h1[^>]*>A measured path from cushion dimensions to a reviewable cover idea\.<\/h1>/);
for (const heading of [
  "Planning starts before a product exists.",
  "Configure, preview, review, then choose whether to save.",
  "Boundaries are part of the experience.",
  "Static public delivery with API-owned authority.",
  "Quality is checked at several boundaries.",
  "Demonstrated behavior is not commercial readiness.",
  "Explore the work",
]) {
  assert.equal(caseStudyHtml.includes(heading), true, `Missing case-study section: ${heading}`);
}
assert.match(caseStudyHtml, /href="https:\/\/github\.com\/nicolasfrechette91\/SewnCovers" target="_blank" rel="noopener noreferrer"/);
assert.match(caseStudyHtml, /View source repository/);
assert.match(caseStudyHtml, /"@type":"WebApplication"/);
const jsonLd = caseStudyHtml.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
assert.ok(jsonLd, "The case study must export JSON-LD.");
assert.equal(JSON.parse(jsonLd).url, productionSiteUrl);
assert.match(trustHtml, new RegExp(`href="${basePath.replace(/\//g, "\\/")}\\/case-study\\/"[^>]*>SewnCovers case study<\\/a>`));
assert.match(homeHtml, new RegExp(`href="${basePath.replace(/\//g, "\\/")}\\/case-study\\/"[^>]*>Read the case study<\\/a>`));
assert.match(homeHtml, new RegExp(`href="${basePath.replace(/\//g, "\\/")}\\/case-study\\/"[^>]*>Case study<\\/a>`));
assert.match(homeHtml, new RegExp(`href="${basePath || ""}\\/"`));
assert.match(
  homeHtml,
  new RegExp(
    `href="${(basePath || "").replace(/\//g, "\\/")}\\/configure\\/"[^>]*>Start configuring<\\/a>`,
  ),
);
assert.match(
  homeHtml,
  new RegExp(
    `href="${(basePath || "").replace(/\//g, "\\/")}\\/trust\\/"[^>]*>View prototype details<\\/a>`,
  ),
);
assert.match(configureHtml, new RegExp(`href="${basePath || ""}\\/"`));

assert.match(notFoundHtml, /<meta name="robots" content="noindex"\/>/);
assert.doesNotMatch(notFoundHtml, /<link rel="canonical"/);

const robotsText = await readFile(path.join(exportDirectory, "robots.txt"), "utf8");
assert.equal(
  robotsText.replaceAll("\r\n", "\n"),
  `User-Agent: *\nAllow: /SewnCovers/\n\nSitemap: ${productionSiteUrl}sitemap.xml\n`,
);
assert.doesNotMatch(robotsText, /account|admin|checkout|projects|orders|cart/i);

const sitemapText = await readFile(path.join(exportDirectory, "sitemap.xml"), "utf8");
const sitemapUrls = Array.from(sitemapText.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1]);
const expectedSitemapUrls = Array.from(publicPages.values(), ([, canonical]) => canonical);
assert.deepEqual(sitemapUrls, expectedSitemapUrls);
assert.doesNotMatch(sitemapText, /lastmod|account|admin|checkout|projects|orders|cart/i);
for (const url of sitemapUrls) {
  const targetStat = await stat(exportedFileForCanonical(url)).catch(() => undefined);
  assert.equal(targetStat?.isFile(), true, `${url} does not resolve within the export.`);
}

const socialImage = await readFile(path.join(exportDirectory, "social-preview.jpg"));
assert.deepEqual(readJpegDimensions(socialImage), { height: 630, width: 1200 });
assert.equal(socialImage.length < 500_000, true, "The social preview should remain below 500 KB.");

const manifest = JSON.parse(await readFile(path.join(exportDirectory, "site.webmanifest"), "utf8"));
assert.equal(manifest.start_url, productionSiteUrl);
assert.equal(manifest.icons[0].src, `${productionSiteUrl}favicon.ico`);
assert.equal(manifest.icons[0].sizes, "256x256");
assert.equal(manifest.icons[0].type, "image/x-icon");

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

if (isPagesExport) {
  for (const forbiddenApiUrl of [
    "http://localhost:8000",
    "https://sewncovers-api.onrender.com.example",
    "http://sewncovers-api.onrender.com",
  ]) {
    assert.equal(
      textBundle.includes(forbiddenApiUrl),
      false,
      `The Pages export contains an unapproved API URL: ${forbiddenApiUrl}`,
    );
  }
}

console.log(
  `Verified ${isPagesExport ? "GitHub Pages" : "ordinary"} static export (${files.length} files, ${htmlFiles.length} HTML routes).`,
);
