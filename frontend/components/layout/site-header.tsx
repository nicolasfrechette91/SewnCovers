import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "../ui/class-names";
import type { SiteNavigationItem } from "./navigation";

export interface SiteHeaderProps
  extends Omit<ComponentPropsWithoutRef<"header">, "children"> {
  currentHref?: string;
  navigationItems?: readonly SiteNavigationItem[];
}

export function SiteHeader({
  className,
  currentHref,
  navigationItems = [],
  ...headerProps
}: SiteHeaderProps) {
  const destinations = new Set(navigationItems.map((item) => item.href));
  if (destinations.size !== navigationItems.length) {
    throw new RangeError("SiteHeader navigation destinations must be unique.");
  }

  return (
    <header
      {...headerProps}
      className={classNames(
        "min-w-0 border-b border-border bg-surface shadow-card",
        className,
      )}
    >
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-3 px-gutter py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <Link
          href="/"
          aria-label="SewnCovers home"
          className="inline-flex min-h-11 max-w-full items-center self-start rounded-control px-1 font-display text-section-title font-heading tracking-heading text-brand no-underline hover:text-brand-hover active:text-brand-active"
        >
          <span className="break-words">SewnCovers</span>
        </Link>

        {navigationItems.length > 0 ? (
          <ul className="flex min-w-0 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {navigationItems.map((item) => {
              const isCurrent = currentHref === item.href;

              return (
                <li key={item.href} className="min-w-0">
                  <Link
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={classNames(
                      "inline-flex min-h-11 max-w-full items-center rounded-control px-3 py-2 text-button font-emphasis break-words text-text-primary underline-offset-4 hover:text-brand hover:underline active:text-brand-active",
                      isCurrent
                        ? "font-control text-brand underline decoration-2"
                        : "no-underline",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </nav>
    </header>
  );
}
