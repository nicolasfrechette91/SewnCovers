import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import ts from "typescript";

// Screens load server data through services/use-resource.ts (or
// useAccountResource), and every request goes through services/http.ts. Three
// rules keep the hand-written alternatives from coming back:
//
//   hooks-disable    an eslint-disable comment for a react-hooks rule
//   fetch-call       a fetch() call outside the few modules that own one
//   deferral-timer   setTimeout(..., 0) or queueMicrotask() in components/ or
//                    context/: the old way to move a setState out of an
//                    effect body (load through the resource hook instead)
//
// A legitimate exception goes in `allowlist` with its file, a pattern that
// picks out that one call in its source text, and a one-line reason. The test
// fails when something is flagged and not listed, and when a listed exception
// no longer matches exactly `count` (default 1) violations, so entries cannot
// go stale or quietly widen. hooks-disable has no exceptions.

// npm test runs from the frontend directory.
const root = process.cwd();
const scanned = ["app", "components", "context", "services"] as const;

type Rule = "hooks-disable" | "fetch-call" | "deferral-timer";

interface Violation {
  rule: Rule;
  file: string;
  line: number;
  excerpt: string;
}

interface Exception {
  rule: Exclude<Rule, "hooks-disable">;
  file: string;
  match: RegExp;
  count?: number;
  reason: string;
}

const allowlist: readonly Exception[] = [
  {
    rule: "fetch-call",
    file: "services/http.ts",
    match: /^globalThis\.fetch\(url,/,
    reason: "The transport itself: every API request is sent here.",
  },
  {
    rule: "fetch-call",
    file: "services/pattern-image.ts",
    match: /^fetch\(url, \{/,
    reason:
      "A custom pattern's tile from its short-lived URL, read as a blob for the preview; not an API request.",
  },
  {
    rule: "fetch-call",
    file: "services/account-api.ts",
    match: /^fetch\(target, \{/,
    reason:
      "performUpload: the multipart or PUT transfer to the presigned upload target; no JSON, no token, no time limit.",
  },
  {
    rule: "deferral-timer",
    file: "components/assurance/production-operations-screen.tsx",
    match: /detailHeading\.current\?\.focus\(\)/,
    reason: "Focus the work heading once the panel it belongs to has rendered.",
  },
  {
    rule: "deferral-timer",
    file: "components/configurator/private-project-panel.tsx",
    match: /setSignInFor\(null\);\s+void run\(/,
    reason:
      "Resumes a taken pending action; deliberately not cancelled on cleanup so it always runs once.",
  },
  {
    rule: "deferral-timer",
    file: "components/configurator/summary-output-actions.tsx",
    match: /URL\.revokeObjectURL\(objectUrl\)/,
    reason: "Revoke the download's object URL after the browser has taken it.",
  },
  {
    rule: "deferral-timer",
    file: "components/projects/projects-screen.tsx",
    match: /shareRef\.current\?\.focus\(\);\s+shareRef\.current\?\.select\(\);/,
    reason: "Focus and select the new share URL once its field has rendered.",
  },
];

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(relative);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)
        ? [relative]
        : [];
    })
    .sort();
}

const TIMER_CALLEES = new Set([
  "setTimeout",
  "globalThis.setTimeout",
  "window.setTimeout",
]);
const FETCH_CALLEES = new Set(["fetch", "globalThis.fetch", "window.fetch"]);

function isZero(node: ts.Expression | undefined): boolean {
  return node === undefined || (ts.isNumericLiteral(node) && node.text === "0");
}

function violationsIn(file: string): Violation[] {
  const text = readFileSync(path.join(root, file), "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: Violation[] = [];
  const lineOf = (position: number) =>
    source.getLineAndCharacterOfPosition(position).line + 1;
  const add = (rule: Rule, node: ts.Node) =>
    found.push({
      rule,
      file,
      line: lineOf(node.getStart(source)),
      excerpt: node.getText(source).replace(/\s+/g, " "),
    });

  for (const match of text.matchAll(
    /eslint-disable(?:-next-line|-line)?[^\n]*react-hooks\//g,
  )) {
    found.push({
      rule: "hooks-disable",
      file,
      line: lineOf(match.index),
      excerpt: match[0],
    });
  }

  const inComponentsOrContext = /^(components|context)\//.test(file);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (FETCH_CALLEES.has(callee)) add("fetch-call", node);
      if (
        inComponentsOrContext &&
        ((TIMER_CALLEES.has(callee) && isZero(node.arguments[1])) ||
          callee === "queueMicrotask")
      ) {
        add("deferral-timer", node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const violations = scanned.flatMap((directory) =>
  sourceFiles(directory).flatMap(violationsIn),
);

function matchesFor(exception: Exception): Violation[] {
  return violations.filter(
    (violation) =>
      violation.rule === exception.rule &&
      violation.file === exception.file &&
      exception.match.test(violation.excerpt),
  );
}

test("no react-hooks rule is disabled anywhere in the app", () => {
  assert.deepEqual(
    violations.filter(({ rule }) => rule === "hooks-disable"),
    [],
  );
});

test("requests and deferral timers appear only where the allowlist says why", () => {
  const unlisted = violations.filter(
    (violation) =>
      violation.rule !== "hooks-disable" &&
      !allowlist.some(
        (exception) =>
          exception.rule === violation.rule &&
          exception.file === violation.file &&
          exception.match.test(violation.excerpt),
      ),
  );
  assert.deepEqual(
    unlisted.map(
      ({ rule, file, line, excerpt }) =>
        `${rule} ${file}:${line} ${excerpt.slice(0, 100)}`,
    ),
    [],
  );
});

test("every allowlist entry matches exactly the calls it names", () => {
  for (const exception of allowlist) {
    assert.equal(
      matchesFor(exception).length,
      exception.count ?? 1,
      `${exception.rule} ${exception.file} ${exception.match}`,
    );
  }
});

test("the scan finds the calls it is meant to find", () => {
  // Guards the guard: if the AST walk stopped seeing calls, the rules above
  // would pass vacuously.
  assert.equal(
    violations.filter(({ rule }) => rule === "fetch-call").length,
    3,
  );
  assert.ok(
    violations.some(
      ({ rule, file }) =>
        rule === "deferral-timer" &&
        file === "components/projects/projects-screen.tsx",
    ),
  );
});
