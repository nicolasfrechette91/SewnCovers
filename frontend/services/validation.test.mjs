import assert from "node:assert/strict";
import { test } from "node:test";

import { importFresh } from "../tests/fresh-import.mjs";

const {
  anyRecord,
  flag,
  integer,
  knownOrUnknown,
  listOf,
  literal,
  matching,
  numeric,
  oneOf,
  orNull,
  recordOf,
  text,
  textOrNull,
  wholeNumber,
} = await importFresh("./validation.ts", import.meta.url);

const readItem = recordOf({
  id: text,
  count: wholeNumber,
  note: textOrNull,
  tags: listOf(text),
});

test("recordOf keeps exactly the listed fields, in the listed order", () => {
  const item = readItem({
    tags: ["a"],
    extra: { nested: true },
    note: null,
    count: 2,
    id: "first",
  });

  assert.deepEqual(item, { id: "first", count: 2, note: null, tags: ["a"] });
  assert.deepEqual(Object.keys(item), ["id", "count", "note", "tags"]);
});

test("recordOf rejects a missing or wrong field, and anything not a record", () => {
  const valid = { id: "first", count: 2, note: "n", tags: [] };

  for (const field of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[field];
    assert.equal(readItem(missing), undefined, `without ${field}`);
  }
  assert.equal(readItem({ ...valid, count: -1 }), undefined);
  assert.equal(readItem({ ...valid, note: 3 }), undefined);
  assert.equal(readItem({ ...valid, tags: ["a", 1] }), undefined);
  for (const value of [null, undefined, "text", 1, [valid]]) {
    assert.equal(readItem(value), undefined);
  }
});

test("recordOf passes each field through its own reader", () => {
  const readOuter = recordOf({ inner: readItem, when: text });
  const outer = readOuter({
    inner: { id: "i", count: 0, note: null, tags: [], added: 1 },
    when: "now",
  });

  assert.deepEqual(outer, {
    inner: { id: "i", count: 0, note: null, tags: [] },
    when: "now",
  });
});

test("value readers accept their type and nothing else", () => {
  assert.equal(text(""), "");
  assert.equal(text(1), undefined);
  assert.equal(flag(false), false);
  assert.equal(flag("false"), undefined);
  assert.equal(numeric(-1.5), -1.5);
  assert.equal(numeric("1"), undefined);
  assert.equal(integer(-3), -3);
  assert.equal(integer(1.5), undefined);
  assert.equal(integer(2 ** 53), undefined);
  assert.equal(wholeNumber(0), 0);
  assert.equal(wholeNumber(-1), undefined);
  assert.equal(wholeNumber(1.5), undefined);
  assert.equal(literal("CAD")("CAD"), "CAD");
  assert.equal(literal("CAD")("USD"), undefined);
  assert.equal(literal(true)(true), true);
  assert.equal(literal(true)("true"), undefined);
  assert.equal(matching(/^#[0-9A-F]{6}$/)("#A1B2C3"), "#A1B2C3");
  assert.equal(matching(/^#[0-9A-F]{6}$/)("#a1b2c3"), undefined);
  assert.equal(matching(/^#[0-9A-F]{6}$/)(1), undefined);
});

test("anyRecord keeps a free-form record whole", () => {
  const record = { anything: [1, { deep: true }] };

  assert.equal(anyRecord(record), record);
  assert.equal(anyRecord([record]), undefined);
  assert.equal(anyRecord(null), undefined);
});

test("orNull accepts null and otherwise defers to its reader", () => {
  const readCount = orNull(wholeNumber);

  assert.equal(readCount(null), null);
  assert.equal(readCount(3), 3);
  assert.equal(readCount(undefined), undefined);
  assert.equal(readCount(-3), undefined);
});

test("listOf rejects a value that is not a list, or any unreadable item", () => {
  const readCounts = listOf(wholeNumber);

  assert.deepEqual(readCounts([]), []);
  assert.deepEqual(readCounts([0, 1]), [0, 1]);
  assert.equal(readCounts([0, -1]), undefined);
  assert.equal(readCounts({ 0: 0, length: 1 }), undefined);
});

test("logic values reject unknown strings; shown values read them as unknown", () => {
  const states = ["open", "closed"];
  const strict = oneOf(states);
  const shown = knownOrUnknown(states);

  assert.equal(strict("open"), "open");
  assert.equal(strict("archived"), undefined);
  assert.equal(shown("open"), "open");
  assert.equal(shown("archived"), "unknown");
  for (const value of [null, undefined, 1, ["open"]]) {
    assert.equal(strict(value), undefined);
    assert.equal(shown(value), undefined);
  }
});
