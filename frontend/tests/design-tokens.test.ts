import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Components and pages style themselves only through the SewnCovers tokens in
// app/globals.css. Default Tailwind scales are reset there, so a stray default
// utility would silently render unstyled; these checks catch that early.

// npm test runs from the frontend directory.
const root = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

const files = [...sourceFiles("app"), ...sourceFiles("components")].map(
  (file) => ({ file, source: readFileSync(path.join(root, file), "utf8") }),
);

function offenders(pattern: RegExp) {
  return files.flatMap(({ file, source }) =>
    [...source.matchAll(pattern)].map((match) => `${file}: ${match[0]}`),
  );
}

test("uses no default Tailwind palette colours", () => {
  assert.deepEqual(
    offenders(
      /\b(?:bg|text|border|ring|fill|stroke|outline|decoration|accent|from|via|to|divide|placeholder|caret|shadow)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/g,
    ),
    [],
  );
});

test("uses only the tokenized type, radius and shadow scales", () => {
  assert.deepEqual(
    offenders(/(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g),
    [],
  );
  assert.deepEqual(
    offenders(
      /(?<![\w-])rounded(?:-[trblsexy]{1,2})?-(?:xs|sm|md|lg|xl|[2-4]xl)\b/g,
    ),
    [],
  );
  assert.deepEqual(
    offenders(/(?<![\w-])shadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)\b/g),
    [],
  );
});

test("uses no arbitrary colour values in class names", () => {
  assert.deepEqual(
    offenders(/-\[(?:#|rgba?\(|hsla?\(|oklch\(|color-mix\()/g),
    [],
  );
});

// Hex literals are checked in design-system-guard.test.ts, which can name the
// few lines of copy that show a colour code.
test("keeps rgb() colour literals out of components", () => {
  assert.deepEqual(offenders(/\brgba?\(\s*\d/g), []);
});
