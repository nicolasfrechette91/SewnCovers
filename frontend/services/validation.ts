// Runtime checks shared by the API clients and the browser-draft readers.
//
// Responses are read with a "tolerant reader, strict values" policy (see
// docs/architecture.md): each reader builds a new object from the fields this
// build knows, so a field the API adds later is ignored and never reaches the
// UI, the draft or a fingerprint; every known field is still checked, and a
// missing or wrong one makes the response malformed.

/** A plain object: not null and not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One of `values` (a const tuple of the known values). */
export function isOneOf<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === "string" && values.includes(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** At most `places` decimals, also for values printed in exponent form. */
export function hasAtMostDecimalPlaces(value: number, places: number): boolean {
  if (!Number.isFinite(value)) return false;
  const [coefficient, rawExponent = "0"] = value
    .toString()
    .toLowerCase()
    .split("e");
  const [, fraction = ""] = coefficient.split(".");
  const exponent = Number(rawExponent);
  return Math.max(0, fraction.length - exponent) <= places;
}

/**
 * Reads every item of a list with `read`; undefined when the value is not an
 * array or any item is unreadable.
 */
export function readList<Item>(
  value: unknown,
  read: (item: unknown) => Item | undefined,
): readonly Item[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: Item[] = [];
  for (const item of value) {
    const parsed = read(item);
    if (parsed === undefined) return undefined;
    items.push(parsed);
  }
  return items;
}

// Readers. A reader returns the value it accepts as the app will keep it, or
// undefined when the value is not acceptable. Response readers are built from
// a table of field readers with `recordOf`, so each field is named once.

/** Reads a value; undefined when it is not acceptable. */
export type Reader<T> = (value: unknown) => T | undefined;

/** One reader for every field of `T`. */
export type FieldReaders<T> = { readonly [Key in keyof T]-?: Reader<T[Key]> };

/**
 * Reads a record field by field: the result holds exactly the listed fields,
 * in the listed order, each as its reader returned it. A field the API adds
 * later is dropped; one its reader rejects makes the record unreadable.
 */
export function recordOf<T>(readers: FieldReaders<T>): Reader<T> {
  const fields = Object.entries(readers) as [string, Reader<unknown>][];
  return (value) => {
    if (!isRecord(value)) return undefined;
    const result: Record<string, unknown> = {};
    for (const [key, read] of fields) {
      const field = read(value[key]);
      if (field === undefined) return undefined;
      result[key] = field;
    }
    return result as T;
  };
}

export const text: Reader<string> = (value) =>
  typeof value === "string" ? value : undefined;

export const flag: Reader<boolean> = (value) =>
  typeof value === "boolean" ? value : undefined;

export const numeric: Reader<number> = (value) =>
  typeof value === "number" ? value : undefined;

export const integer: Reader<number> = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;

export const wholeNumber: Reader<number> = (value) =>
  isNonnegativeInteger(value) ? value : undefined;

/** A free-form record the screens read defensively: kept whole, as sent. */
export const anyRecord: Reader<Readonly<Record<string, unknown>>> = (value) =>
  isRecord(value) ? value : undefined;

/** Exactly `expected`. */
export function literal<const Value extends string | boolean>(
  expected: Value,
): Reader<Value> {
  return (value) => (value === expected ? expected : undefined);
}

/** A string that matches `pattern`. */
export function matching(pattern: RegExp): Reader<string> {
  return (value) =>
    typeof value === "string" && pattern.test(value) ? value : undefined;
}

/** One of `values`, for values that drive logic: any other is rejected. */
export function oneOf<const Values extends readonly string[]>(
  values: Values,
): Reader<Values[number]> {
  return (value) => (isOneOf(values, value) ? value : undefined);
}

/**
 * One of `values`, for values that are only shown: any other string reads
 * as "unknown" (shown with a neutral label); a value that is not a string is
 * rejected.
 */
export function knownOrUnknown<const Values extends readonly string[]>(
  values: Values,
): Reader<Values[number] | "unknown"> {
  return (value) => {
    if (typeof value !== "string") return undefined;
    return isOneOf(values, value) ? value : "unknown";
  };
}

/** Null, or a value `read` accepts. */
export function orNull<T>(read: Reader<T>): Reader<T | null> {
  return (value) => (value === null ? null : read(value));
}

export const textOrNull = orNull(text);

/** A list whose every item `read` accepts. */
export function listOf<Item>(read: Reader<Item>): Reader<readonly Item[]> {
  return (value) => readList(value, read);
}
