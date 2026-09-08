export type AuthenticationMode = "login" | "register";

export type AuthenticationReturnTarget =
  | "cart"
  | "configure"
  | "orders"
  | "pricing"
  | "projects";

const RETURN_PATHS: Readonly<Record<AuthenticationReturnTarget, string>> = {
  cart: "/cart/",
  configure: "/configure/",
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
