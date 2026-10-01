export type AuthenticationMode = "login" | "register";

export type AuthenticationReturnTarget =
  | "cart"
  | "configure"
  | "home"
  | "legal"
  | "orders"
  | "pricing"
  | "projects";

const RETURN_PATHS: Readonly<Record<AuthenticationReturnTarget, string>> = {
  cart: "/cart/",
  configure: "/configure/",
  home: "/",
  legal: "/legal/",
  orders: "/orders/",
  pricing: "/commerce/",
  projects: "/projects/",
};

export function parseAuthenticationMode(value: string | null): AuthenticationMode {
  return value === "register" ? "register" : "login";
}

export function parseAuthenticationReturnTarget(
  value: string | null,
): AuthenticationReturnTarget | null {
  return value !== null && Object.hasOwn(RETURN_PATHS, value)
    ? (value as AuthenticationReturnTarget)
    : null;
}

export function buildAccountHref(
  mode: AuthenticationMode,
  returnTo?: AuthenticationReturnTarget | null,
): string {
  const parameters = new URLSearchParams({ mode });
  if (returnTo) parameters.set("returnTo", returnTo);
  return `/account/?${parameters.toString()}`;
}

/** The allowlisted return target for the page a sign-in link appears on. */
export function returnTargetForPath(
  pathname: string,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
): AuthenticationReturnTarget | null {
  const base = basePath.replace(/\/+$/, "");
  const path = (base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname)
    .split(/[?#]/, 1)[0]
    .replace(/\/*$/, "/");
  if (path.startsWith("/checkout/")) return "orders";
  const entry = Object.entries(RETURN_PATHS).find(([, target]) => target === path);
  return entry ? (entry[0] as AuthenticationReturnTarget) : null;
}

/** The in-app path (without the base path) for client-side navigation. */
export function resolveAuthenticationReturnPath(
  value: string | null,
): string | null {
  const target = parseAuthenticationReturnTarget(value);
  return target ? RETURN_PATHS[target] : null;
}

export function resolveAuthenticationReturnDestination(
  value: string | null,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
): string | null {
  const target = parseAuthenticationReturnTarget(value);
  if (!target) return null;

  const normalizedBasePath = basePath.replace(/\/+$/, "");
  const safeBasePath = normalizedBasePath === "/SewnCovers" ? normalizedBasePath : "";
  return `${safeBasePath}${RETURN_PATHS[target]}`;
}
