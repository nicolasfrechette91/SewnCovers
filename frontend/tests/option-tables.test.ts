import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLOSURE_TYPES,
  CUSHION_SHAPES,
  FIT_PREFERENCES,
  MATERIAL_IDS,
  SEAM_STYLES,
} from "../context/configuration/types";
import {
  CARRIER_IDS,
  CARRIERS,
  carrierName,
  safeTrackingUrl,
} from "../data/carriers";
import {
  closureOptions,
  fitOptions,
  materialOptions,
  seamOptions,
} from "../data/cover-options";
import { cushionShapeDefinitions } from "../data/shapes";

// The value lists in context/configuration/types.ts are what the readers
// accept; the tables in data/ are what the configurator offers. They must
// name the same values, so nothing offered is rejected and nothing accepted
// is missing from the screens.

const ids = (table: readonly { readonly id: string }[]) =>
  table.map(({ id }) => id).sort();
const sorted = (values: readonly string[]) => [...values].sort();

test("each option table offers exactly the values the readers accept", () => {
  assert.deepEqual(ids(cushionShapeDefinitions), sorted(CUSHION_SHAPES));
  assert.deepEqual(ids(materialOptions), sorted(MATERIAL_IDS));
  assert.deepEqual(ids(fitOptions), sorted(FIT_PREFERENCES));
  assert.deepEqual(ids(closureOptions), sorted(CLOSURE_TYPES));
  assert.deepEqual(ids(seamOptions), sorted(SEAM_STYLES));
});

test("the carriers table names each carrier as people know it", () => {
  assert.deepEqual(
    CARRIERS.map(({ id, name }) => [id, name]),
    [
      ["canada-post", "Canada Post"],
      ["ups", "UPS"],
      ["fedex", "FedEx"],
      ["purolator", "Purolator"],
    ],
  );
  assert.deepEqual(CARRIER_IDS, ["canada-post", "ups", "fedex", "purolator"]);
  assert.equal(carrierName("ups"), "UPS");
  assert.equal(carrierName("unknown"), "Unknown carrier");
});

test("a tracking link is kept only when it points to a known carrier's site", () => {
  for (const url of [
    "https://www.canadapost-postescanada.ca/track/123",
    "https://www.ups.com/track?tracknum=1",
    "https://www.fedex.com/fedextrack/?trknbr=1",
    "https://www.purolator.com/en/shipping/tracker?pin=1",
  ]) {
    assert.equal(safeTrackingUrl(url), url);
  }
  for (const url of [
    "https://example.test/track",
    "http://www.ups.com/track",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeTrackingUrl(url), null);
  }
});
