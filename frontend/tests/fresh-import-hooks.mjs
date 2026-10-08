// Module hooks behind importFresh() in ./fresh-import.mjs.
//
// An entry imported as "file.ts?fresh=3" is a different module from "file.ts",
// and resolve() passes the same query on to every project file it imports,
// directly or not, so the whole graph is a private copy. Built-ins and
// node_modules packages stay shared.
//
// load() compiles those modules to ES modules itself. Node caches CommonJS
// modules by file path and ignores the query, and tsx loads .ts files in this
// package (no "type" field) as CommonJS, so without it every "fresh" import
// would return the first copy.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const SCOPE_PARAMETER = "fresh";

function scopeOf(url) {
  return url ? new URL(url).searchParams.get(SCOPE_PARAMETER) : null;
}

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  // The entry carries the scope in its own specifier; everything it imports
  // inherits it from the importing module.
  const scope =
    (specifier.startsWith("file:") ? scopeOf(specifier) : null) ??
    scopeOf(context.parentURL);

  if (
    scope === null ||
    !resolved.url.startsWith("file:") ||
    resolved.url.includes("/node_modules/")
  ) {
    return resolved;
  }

  const url = new URL(resolved.url);
  url.searchParams.set(SCOPE_PARAMETER, scope);
  return { ...resolved, url: url.href };
}

export async function load(url, context, nextLoad) {
  if (scopeOf(url) === null || !new URL(url).pathname.endsWith(".ts")) {
    return nextLoad(url, context);
  }

  const { outputText, diagnostics } = ts.transpileModule(
    await readFile(fileURLToPath(url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    },
  );

  if (diagnostics.length > 0) {
    throw new Error(
      `Cannot compile ${fileURLToPath(url)}: ` +
        diagnostics
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
          .join("; "),
    );
  }

  return { format: "module", shortCircuit: true, source: outputText };
}
