// Loads TypeScript source for unit tests, with its own copy of every project
// module it imports. Use it when a module reads process.env when it is first
// evaluated, as config/environment.ts does, or keeps state between calls, so a
// test can load it again after changing the environment.
//
// Run the tests with tsx (the npm test scripts do); tsx resolves extensionless
// imports and path aliases. Modules that need no fresh copy can be imported
// normally.

import { register } from "node:module";

register("./fresh-import-hooks.mjs", import.meta.url);

let scope = 0;

function load(specifiers, parentUrl) {
  scope += 1;
  return Promise.all(
    specifiers.map((specifier) => {
      const url = new URL(specifier, parentUrl);
      url.searchParams.set("fresh", String(scope));
      return import(url.href);
    }),
  );
}

/**
 * @param {string} specifier Path of the module, relative to parentUrl.
 * @param {string} parentUrl Usually import.meta.url of the calling test.
 */
export async function importFresh(specifier, parentUrl) {
  const [module] = await load([specifier], parentUrl);
  return module;
}

/**
 * Like importFresh for several modules that must share one private copy of
 * their common dependencies. Resolves to the modules in the order given.
 *
 * @param {string[]} specifiers
 * @param {string} parentUrl
 */
export function importFreshTogether(specifiers, parentUrl) {
  return load(specifiers, parentUrl);
}
