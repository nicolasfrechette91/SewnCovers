"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/context/auth";
import { AUTH_CHANGED_EVENT, readSessionToken } from "@/services/account-api";
import {
  buildAccountHref,
  returnTargetForPath,
} from "@/services/auth-navigation";
import {
  peekAuthReturnHint,
  takeAuthReturnHint,
} from "@/services/configurator-draft";

import { isCurrentNavigationPath, type SiteNavigationItem } from "./navigation";
import { SiteFooter, type SiteFooterProps } from "./site-footer";
import { SiteHeader, type SiteHeaderProps } from "./site-header";

const ACCOUNT_HREF = "/account/";

function subscribeToStoredSession(listener: () => void): () => void {
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
}

function hasStoredSession(): boolean {
  try {
    return readSessionToken() !== null;
  } catch {
    return false;
  }
}

/**
 * Guests see a quiet "Sign in" link that returns them to this page and none
 * of the links that would only ask them to sign in; a stored or verified
 * session keeps every link, including "Account".
 */
export function RouteAwareSiteHeader({
  primaryItems,
  utilityItems,
  ...props
}: Omit<SiteHeaderProps, "currentHref">) {
  const pathname = usePathname() ?? "/";
  const { state } = useAuth();
  const storedSession = useSyncExternalStore(
    subscribeToStoredSession,
    hasStoredSession,
    () => false,
  );
  const signedIn =
    state.status === "authenticated" ||
    (state.status === "initializing" && storedSession);
  const forVisitor = (items?: readonly SiteNavigationItem[]) =>
    signedIn
      ? items
      : items
          ?.filter((item) => !item.requiresAccount)
          .map((item) =>
            item.href === ACCOUNT_HREF
              ? {
                  href: buildAccountHref("login", returnTargetForPath(pathname)),
                  label: "Sign in",
                }
              : item,
          );

  return (
    <SiteHeader
      {...props}
      currentHref={pathname}
      primaryItems={forVisitor(primaryItems)}
      utilityItems={forVisitor(utilityItems)}
    />
  );
}

/**
 * After signing in, the account page returns with a client-side navigation,
 * which leaves focus on the body. Move it to the main landmark instead. The
 * configurator handles its own return and focuses the stage.
 */
export function AuthReturnFocus() {
  const pathname = usePathname();

  useEffect(() => {
    const hint = peekAuthReturnHint();
    // The configurator consumes its own hint when it mounts.
    if (!hint || hint === "configure" || !takeAuthReturnHint(hint)) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById("main-content")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}

/** The home page states the prototype disclaimer once, in its own notice. */
export function RouteAwareSiteFooter({
  navigationItems,
  ...props
}: Omit<
  SiteFooterProps,
  "currentHref" | "navigationItems" | "showPrototypeNote"
> & {
  navigationItems?: readonly SiteNavigationItem[];
}) {
  const pathname = usePathname() ?? "/";

  return (
    <SiteFooter
      {...props}
      currentHref={pathname}
      navigationItems={navigationItems}
      showPrototypeNote={!isCurrentNavigationPath(pathname, "/")}
    />
  );
}
