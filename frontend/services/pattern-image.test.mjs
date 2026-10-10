import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { importFresh } from "../tests/fresh-import.mjs";

const { fetchPatternImage } = await importFresh(
  "./pattern-image.ts",
  import.meta.url,
);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetches the authorised tile without credentials or caching, cancellably", async () => {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ init, url: String(url) });
    return new Response("image-bytes", {
      headers: { "Content-Type": "image/png" },
    });
  };
  const controller = new AbortController();

  const blob = await fetchPatternImage(
    "https://assets.example.test/tile?grant=short-lived",
    controller.signal,
  );

  assert.equal(await blob.text(), "image-bytes");
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "https://assets.example.test/tile?grant=short-lived",
  );
  assert.equal(requests[0].init.credentials, "omit");
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal(requests[0].init.signal, controller.signal);
  assert.equal(requests[0].init.headers, undefined);
});

test("a refused tile rejects instead of resolving to an error page", async () => {
  globalThis.fetch = async () => new Response("denied", { status: 403 });

  await assert.rejects(
    fetchPatternImage("https://assets.example.test/tile"),
    /Pattern unavailable/,
  );
});
