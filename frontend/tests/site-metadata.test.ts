import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPageMetadata,
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  exportedAssetPath,
  PUBLIC_INDEXABLE_PATHS,
  SOCIAL_IMAGE,
  siteUrl,
} from "../config/site-metadata";

test("builds stable production URLs with the GitHub Pages base path", () => {
  assert.equal(
    siteUrl(),
    "https://nicolasfrechette91.github.io/SewnCovers/",
  );
  assert.equal(
    siteUrl("/legal/"),
    "https://nicolasfrechette91.github.io/SewnCovers/legal/",
  );
  assert.equal(siteUrl("//configure/"), siteUrl("/configure/"));
  assert.doesNotMatch(siteUrl("/account/"), /localhost|\/\/SewnCovers/);
  assert.equal(exportedAssetPath("/site.webmanifest"), "/site.webmanifest");
});

test("owns default and social metadata without mutable or query-sensitive values", () => {
  assert.equal(DEFAULT_TITLE, "SewnCovers | Cushion-cover design prototype");
  assert.match(DEFAULT_DESCRIPTION, /portfolio prototype/);
  assert.deepEqual(SOCIAL_IMAGE, {
    alt: "SewnCovers portfolio prototype: a measured approach to cushion-cover design.",
    height: 630,
    path: "/social-preview.jpg",
    type: "image/jpeg",
    width: 1200,
  });

  const account = createPageMetadata({
    description: "Private account context.",
    index: false,
    path: "/account/",
    title: "Account",
  });
  assert.equal(
    account.alternates?.canonical,
    "https://nicolasfrechette91.github.io/SewnCovers/account/",
  );
  assert.deepEqual(account.robots, {
    follow: false,
    googleBot: { follow: false, index: false, noimageindex: true },
    index: false,
    nocache: true,
  });
  assert.doesNotMatch(String(account.alternates?.canonical), /[?#]/);
});

test("keeps the sitemap allowlist limited to durable public routes", () => {
  assert.deepEqual(PUBLIC_INDEXABLE_PATHS, [
    "/",
    "/configure/",
    "/commerce/",
    "/legal/",
  ]);
});
