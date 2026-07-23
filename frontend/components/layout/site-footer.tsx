import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "../ui/class-names";
import type { SiteNavigationItem } from "./navigation";

export interface SiteFooterProps
  extends Omit<ComponentPropsWithoutRef<"footer">, "children"> {
  navigationItems?: readonly SiteNavigationItem[];
  year?: number;
}

export function SiteFooter({
  className,
  navigationItems = [],
  year = new Date().getFullYear(),
  ...footerProps
}: SiteFooterProps) {
  const destinations = new Set(navigationItems.map((item) => item.href));
  if (destinations.size !== navigationItems.length) {
    throw new RangeError("SiteFooter navigation destinations must be unique.");
  }

  return (
    <footer
      {...footerProps}
      className={classNames(
        "min-w-0 border-t border-border bg-surface-subtle text-text-primary",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-component px-gutter py-layout sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-display text-section-title font-heading tracking-heading text-brand">
            SewnCovers
          </p>
          <p className="mt-2 max-w-md break-words text-supporting text-text-muted">
            A portfolio prototype for custom cushion covers.
          </p>
        </div>

        {navigationItems.length > 0 ? (
          <nav aria-label="Footer navigation" className="min-w-0">
            <ul className="flex min-w-0 flex-wrap gap-x-component gap-y-2">
              {navigationItems.map((item) => (
                <li key={item.href} className="min-w-0">
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 max-w-full items-center rounded-control text-supporting font-emphasis break-words text-text-primary underline decoration-1 underline-offset-4 hover:text-brand active:text-brand-active"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <p className="break-words text-supporting text-text-muted">
          © {year} SewnCovers. Portfolio prototype.
        </p>
      </div>
    </footer>
  );
}
