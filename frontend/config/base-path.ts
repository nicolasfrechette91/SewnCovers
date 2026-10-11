// The site's base path: "" at the domain root, "/SewnCovers" on GitHub Pages
// (next.config.ts sets NEXT_PUBLIC_BASE_PATH). next/link adds it by itself;
// these are for the few URLs built by hand (share links, redirects, assets).

/** The case-sensitive base path of the GitHub Pages deployment. */
export const PRODUCTION_BASE_PATH = "/SewnCovers";

/** Trimmed, one leading slash, no trailing slash; "" for none. */
export function normalizeBasePath(basePath: string): string {
  const value = basePath.trim().replace(/^\/+|\/+$/g, "");
  return value ? `/${value}` : "";
}

/** `path` (from the site root) with the base path in front. */
export function withBasePath(
  path: string,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
): string {
  return `${normalizeBasePath(basePath)}${path.startsWith("/") ? path : `/${path}`}`;
}
