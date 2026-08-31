"use client";

import { usePathname } from "next/navigation";

import type { SiteNavigationItem } from "./navigation";
import { SiteFooter, type SiteFooterProps } from "./site-footer";
import { SiteHeader, type SiteHeaderProps } from "./site-header";

export function RouteAwareSiteHeader(
  props: Omit<SiteHeaderProps, "currentHref">,
) {
  return <SiteHeader {...props} currentHref={usePathname()} />;
}

export function RouteAwareSiteFooter({
  navigationItems,
  ...props
}: Omit<SiteFooterProps, "currentHref" | "navigationItems"> & {
  navigationItems?: readonly SiteNavigationItem[];
}) {
  return (
    <SiteFooter
      {...props}
      currentHref={usePathname()}
      navigationItems={navigationItems}
    />
  );
}
