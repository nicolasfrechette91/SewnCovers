import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import ts from "typescript";

// components/ui/ holds the primitives, so everywhere else the app builds its
// forms, panels and lists from them instead of from raw markup. Four rules
// look for the hand-built alternative:
//
//   raw-control  an <input>, <select> or <textarea> (other than type="hidden")
//   raw-dl       a <dl> (use SpecList)
//   panel-frame  a class string that pairs a panel or card radius with a border
//                width (use Surface or surfaceClasses)
//   hex-literal  a #rrggbb colour (use a token from app/globals.css)
//
// A legitimate exception goes in `allowlist` with its file, a pattern that
// picks out that one element, and a one-line reason. The test fails when
// something is flagged and not listed, and when a listed exception no longer
// matches exactly `count` (default 1) violations, so entries cannot go stale
// or quietly widen to cover new code. `match` is tested against the element's
// opening tag, the class string, or the source line, depending on the rule.

// npm test runs from the frontend directory.
const root = process.cwd();

type Rule = "raw-control" | "raw-dl" | "panel-frame" | "hex-literal";

interface Violation {
  rule: Rule;
  file: string;
  line: number;
  excerpt: string;
}

interface Exception {
  rule: Rule;
  file: string;
  match: RegExp;
  count?: number;
  reason: string;
}

const allowlist: readonly Exception[] = [
  // Selection-card radios and chips: the card or chip is the visible control.
  {
    rule: "raw-control",
    file: "components/configurator/cover-details-step.tsx",
    match: /className="cover-option-input /,
    reason:
      "Radio inside a cover-option card; the Checkbox primitive has no radio form.",
  },
  {
    rule: "raw-control",
    file: "components/configurator/pattern-card.tsx",
    match: /className="pattern-card-input /,
    reason:
      "Visually hidden radio of a pattern card; the card's label is the visible control.",
  },
  {
    rule: "raw-control",
    file: "components/configurator/pattern-filter.tsx",
    match: /className="pattern-filter-input /,
    reason:
      "Visually hidden radio or checkbox of a filter chip; the chip's label is the visible control.",
  },
  {
    rule: "raw-control",
    file: "components/configurator/shape-selection-step.tsx",
    match: /className="shape-option-input /,
    reason:
      "Visually hidden radio of a shape card; the card's label is the visible control.",
  },
  {
    rule: "raw-control",
    file: "components/configurator/your-patterns.tsx",
    match: /name="cushion-pattern"/,
    reason:
      "Radio that selects an uploaded pattern in the custom-pattern list.",
  },
  // Colour, range and file inputs: native widgets with no primitive.
  {
    rule: "raw-control",
    file: "components/configurator/pattern-step.tsx",
    match: /type="color"/,
    reason: "Native colour picker; there is no colour-input primitive.",
  },
  {
    rule: "raw-control",
    file: "components/configurator/preview-step.tsx",
    match: /type="range"/,
    reason: "Native range slider for the pattern scale; no slider primitive.",
  },
  {
    rule: "raw-control",
    file: "components/configurator/your-patterns.tsx",
    match: /type="file"/,
    reason:
      "Native file input styled through file: variants; no file primitive.",
  },

  // Bespoke description lists whose rows are not SpecList rows.
  {
    rule: "raw-dl",
    file: "components/commerce/pricing-quotes-screen.tsx",
    match: /^<dl className="mt-4 grid gap-2 sm:grid-cols-2">/,
    reason: "Price breakdown: each row is its own shaded card in a grid.",
  },
  {
    rule: "raw-dl",
    file: "components/configurator/configuration-summary.tsx",
    match: /^<dl className="mt-component divide-y divide-dashed /,
    reason:
      "Summary rows on a 2fr/3fr grid with right-aligned values and a swatch.",
  },
  {
    rule: "raw-dl",
    file: "components/configurator/current-selections.tsx",
    match: /^<dl className="flex flex-wrap gap-x-5 /,
    reason: "Current-selections ticket: inline rows that stack at lg.",
  },
  {
    rule: "raw-dl",
    file: "components/projects/configuration-readonly.tsx",
    match: /^<dl className="grid min-w-0 gap-x-component sm:grid-cols-2">/,
    reason: "Read-only rows with a dashed rule under each and a colour swatch.",
  },

  // Boxes that are not Surface panels: dashed, interactive, or media frames.
  {
    rule: "panel-frame",
    file: "components/account/account-screen.tsx",
    match:
      /rounded-panel border border-dashed border-border-strong bg-surface-subtle p-card/,
    reason: "Dashed guest-account card; Surface has no dashed tone.",
  },
  {
    rule: "panel-frame",
    file: "components/account/inline-sign-in.tsx",
    match:
      /rounded-card border border-dashed border-border-strong bg-surface-subtle p-card/,
    reason: "Dashed inline sign-in panel; Surface has no dashed tone.",
  },
  {
    rule: "panel-frame",
    file: "components/assurance/production-operations-screen.tsx",
    match:
      /min-h-24 w-full rounded-card border border-border-strong bg-surface p-4 text-left/,
    reason:
      "A clickable work-item card on a <button>; Surface is not interactive.",
  },
  {
    rule: "panel-frame",
    file: "components/commerce/admin-screen.tsx",
    match: /rounded-card border border-error-border bg-error-surface p-4/,
    reason:
      "Refund confirmation holding buttons; ErrorMessage is a live region and would announce them.",
  },
  {
    rule: "panel-frame",
    file: "components/configurator/cushion-preview.tsx",
    match: /h-20 w-28 rounded-panel border border-dashed/,
    reason: "Decorative empty-preview placeholder tile, not a panel.",
  },
  {
    rule: "panel-frame",
    file: "components/configurator/draft-session.tsx",
    match:
      /rounded-card border border-dashed border-border-strong bg-surface-subtle/,
    reason: "Dashed clear-draft confirmation bar; Surface has no dashed tone.",
  },
  {
    rule: "panel-frame",
    file: "components/configurator/fabric-preview.tsx",
    match:
      /fabric-preview cutting-mat min-w-0 rounded-card border border-border p-3/,
    reason: "Frame on the cutting-mat backdrop, which supplies its own fill.",
  },
  {
    rule: "panel-frame",
    file: "components/configurator/measurement-step.tsx",
    match:
      /rounded-card border border-dashed border-border-strong bg-page px-4 py-2/,
    reason: "Dashed measuring-tips <details>; Surface cannot render a details.",
  },
  {
    rule: "panel-frame",
    file: "components/configurator/pattern-card.tsx",
    match:
      /block h-3\/5 w-4\/5 rounded-panel border border-border-strong bg-surface/,
    reason: "Swatch thumbnail inside a pattern card, not a panel.",
  },
  {
    rule: "panel-frame",
    file: "components/configurator/pattern-step.tsx",
    match:
      /fabric-swatch cushion-preview-solid block h-3\/5 w-4\/5 rounded-panel/,
    reason: "Solid-colour swatch tile in the pattern step, not a panel.",
  },
  {
    rule: "panel-frame",
    file: "components/configurator/your-patterns.tsx",
    match:
      /cutting-mat mt-4 rounded-card border border-dashed border-border-strong p-4/,
    reason: "Dashed file drop zone on the cutting-mat backdrop.",
  },
  {
    rule: "panel-frame",
    file: "components/configurator/your-patterns.tsx",
    match:
      /mt-2 aspect-square max-w-64 rounded-card border border-border-strong shadow-card/,
    reason:
      "Framed repeating-pattern image tile drawn by an inline background.",
  },
  {
    rule: "panel-frame",
    file: "components/projects/configuration-readonly.tsx",
    match:
      /h-2\/3 w-3\/4 rounded-panel border-2 border-border-strong shadow-raised/,
    count: 3,
    reason:
      "The custom-image, solid-colour and pattern swatches in the read-only summary.",
  },

  // Colour codes that appear in copy, not in styling.
  {
    rule: "hex-literal",
    file: "components/configurator/pattern-step.tsx",
    match: /Enter a six-digit colour code, such as #B8AFA3\./,
    reason: "Error copy that shows the six-digit format to the user.",
  },
  {
    rule: "hex-literal",
    file: "components/configurator/pattern-step.tsx",
    match: /For an exact shade, type its six-digit code, such as #B8AFA3\./,
    reason: "Help copy that shows the six-digit format to the user.",
  },
];

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relative = path.posix.join(
      directory.replaceAll("\\", "/"),
      entry.name,
    );
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const hexLiteral =
  /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;
const rawControls = new Set(["input", "select", "textarea"]);

// Every class-like token in every string literal, with where it came from.
interface ClassToken {
  file: string;
  line: number;
  token: string;
}

const violations: Violation[] = [];
const classTokens: ClassToken[] = [];

for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
  const source = readFileSync(path.join(root, file), "utf8");
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const inPrimitives = file.startsWith("components/ui/");
  const lineOf = (node: ts.Node) =>
    tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;

  const visit = (node: ts.Node) => {
    if (
      !inPrimitives &&
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
    ) {
      const tag = node.tagName.getText(tree);
      const hidden = node.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(tree) === "type" &&
          attribute.initializer !== undefined &&
          ts.isStringLiteral(attribute.initializer) &&
          attribute.initializer.text === "hidden",
      );
      if (rawControls.has(tag) && !hidden) {
        violations.push({
          rule: "raw-control",
          file,
          line: lineOf(node),
          excerpt: squash(node.getText(tree)),
        });
      } else if (tag === "dl") {
        violations.push({
          rule: "raw-dl",
          file,
          line: lineOf(node),
          excerpt: squash(node.getText(tree)),
        });
      }
    }

    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const tokens = node.text.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        classTokens.push({ file, line: lineOf(node), token });
      }
      const radius = tokens.some((token) =>
        /^rounded-(?:panel|card)$/.test(token),
      );
      const border = tokens.some((token) => /^border(?:-\d+)?$/.test(token));
      if (!inPrimitives && radius && border) {
        violations.push({
          rule: "panel-frame",
          file,
          line: lineOf(node),
          excerpt: squash(node.text),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);

  if (!inPrimitives) {
    source.split(/\r?\n/).forEach((text, index) => {
      if (hexLiteral.test(text)) {
        violations.push({
          rule: "hex-literal",
          file,
          line: index + 1,
          excerpt: text.trim(),
        });
      }
    });
  }
}

const locate = ({ file, line, excerpt }: Violation) =>
  `${file}:${line}: ${excerpt.slice(0, 160)}`;
const covers = (entry: Exception, violation: Violation) =>
  entry.file === violation.file && entry.match.test(violation.excerpt);

function assertExplained(rule: Rule, fix: string) {
  const found = violations.filter((violation) => violation.rule === rule);
  const entries = allowlist.filter((entry) => entry.rule === rule);

  assert.deepEqual(
    found
      .filter((violation) => !entries.some((entry) => covers(entry, violation)))
      .map(locate),
    [],
    fix,
  );
  assert.deepEqual(
    entries.flatMap((entry) => {
      const matched = found.filter((violation) => covers(entry, violation));
      const expected = entry.count ?? 1;
      return matched.length === expected
        ? []
        : [
            `${entry.file} /${entry.match.source}/ matches ${matched.length}, expected ${expected}`,
          ];
    }),
    [],
    "An allowlist entry no longer matches its element. Remove it or update it.",
  );
}

test("builds form controls from the ui primitives", () => {
  assertExplained(
    "raw-control",
    "Use TextInput, Select, Textarea, Checkbox or NumberInput, or allowlist the element with a reason.",
  );
});

test("builds description lists from SpecList", () => {
  assertExplained(
    "raw-dl",
    "Use SpecList, or allowlist the list with a reason.",
  );
});

test("builds panels from Surface", () => {
  assertExplained(
    "panel-frame",
    "Use Surface or surfaceClasses, or allowlist the element with a reason.",
  );
});

test("keeps raw colour literals out of components", () => {
  assertExplained(
    "hex-literal",
    "Use a colour token from app/globals.css, or allowlist the line with a reason.",
  );
});

test("keeps every exception specific, explained and unique", () => {
  const seen = new Set<string>();
  for (const entry of allowlist) {
    const id = `${entry.rule} ${entry.file} ${entry.match.source}`;
    assert.ok(!seen.has(id), `duplicate exception: ${id}`);
    seen.add(id);
    assert.match(entry.file, /^(?:app|components)\/.+\.tsx?$/, id);
    assert.ok(!entry.file.startsWith("components/ui/"), id);
    assert.ok(!entry.match.global && !entry.match.sticky, id);
    assert.ok(
      entry.reason.trim() !== "" && !/[\r\n]/.test(entry.reason),
      `needs a one-line reason: ${id}`,
    );
    assert.ok((entry.count ?? 1) >= 1, id);
  }
});

// Spacing: 4 px steps up to 96 px (see docs/design.md). Named steps such as
// px-card are not numeric, so only the Tailwind number scale is checked.
const spacingUtility =
  /^-?(?:[pm][trblxyse]?|gap(?:-[xy])?|space-[xy]|scroll-[pm][trblxy]?)-(\d+(?:\.\d+)?|px)$/;
const ladder = new Set([
  "0",
  "px",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "8",
  "12",
  "16",
  "24",
]);

test("keeps spacing utilities on the documented ladder", () => {
  assert.deepEqual(
    classTokens
      .filter(({ token }) => {
        const match = spacingUtility.exec(token.split(":").pop() ?? "");
        return match !== null && !ladder.has(match[1]);
      })
      .map(({ file, line, token }) => `${file}:${line}: ${token}`),
    [],
    "Use a step on the ladder (1, 2, 3, 4, 5, 6, 8, 12, 16, 24), or the named steps and mt-nudge.",
  );
});

test("uses max-w-reading for the 48rem measure", () => {
  assert.deepEqual(
    classTokens
      .filter(({ token }) => token.split(":").pop() === "max-w-3xl")
      .map(({ file, line, token }) => `${file}:${line}: ${token}`),
    [],
    "max-w-3xl is 48rem; use max-w-reading.",
  );
});
