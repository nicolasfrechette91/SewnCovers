export interface SiteNavigationItem {
  href: string;
  label: string;
}

function normalizeBasePath(basePath: string): string {
  const value = basePath.trim().replace(/^\/+|\/+$/g, "");
  return value ? `/${value}` : "";
}

export function normalizeNavigationPath(
  value: string,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
): string {
  const path = (value.split(/[?#]/, 1)[0] || "/").replace(/\/{2,}/g, "/");
  const normalizedBasePath = normalizeBasePath(basePath);
  const withoutBasePath =
    normalizedBasePath &&
    (path === normalizedBasePath || path.startsWith(`${normalizedBasePath}/`))
      ? path.slice(normalizedBasePath.length) || "/"
      : path;
  const segments = withoutBasePath.replace(/^\/+|\/+$/g, "");

  return segments ? `/${segments}/` : "/";
}

export function isCurrentNavigationPath(
  currentHref: string,
  destinationHref: string,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
): boolean {
  return (
    normalizeNavigationPath(currentHref, basePath) ===
    normalizeNavigationPath(destinationHref, basePath)
  );
}
