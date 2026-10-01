"use client";

import Link from "next/link";
import {
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from "react";

import { buttonClasses } from "../ui/button-styles";
import { classNames } from "../ui/class-names";
import {
  isCurrentNavigationPath,
  type SiteNavigationItem,
} from "./navigation";

export interface SiteHeaderProps
  extends Omit<ComponentPropsWithoutRef<"header">, "children"> {
  currentHref?: string;
  primaryItems?: readonly SiteNavigationItem[];
  utilityItems?: readonly SiteNavigationItem[];
}

export function SiteHeader({
  className,
  currentHref = "/",
  primaryItems = [],
  utilityItems = [],
  ...headerProps
}: SiteHeaderProps) {
  const navigationItems = [...primaryItems, ...utilityItems];
  const destinations = new Set(navigationItems.map((item) => item.href));
  if (destinations.size !== navigationItems.length) {
    throw new RangeError("SiteHeader navigation destinations must be unique.");
  }
  const [openHref, setOpenHref] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuIsOpen = openHref === currentHref;
  const brandIsCurrent = isCurrentNavigationPath(currentHref, "/");

  const closeMenu = () => setOpenHref(null);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !menuIsOpen) return;
    event.preventDefault();
    closeMenu();
    menuButtonRef.current?.focus();
  };

  const renderItems = (
    items: readonly SiteNavigationItem[],
    groupLabel: string,
    listClassName: string,
  ) => (
    <ul aria-label={groupLabel} className={listClassName}>
      {items.map((item) => {
        const isCurrent = isCurrentNavigationPath(currentHref, item.href);

        return (
          <li key={item.href} className="min-w-0">
            <Link
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              onClick={closeMenu}
              className={
                item.asButton
                  ? buttonClasses({
                      className: classNames(
                        "w-full md:w-auto",
                        isCurrent && "underline decoration-2 underline-offset-4",
                      ),
                      element: "link",
                      size: "compact",
                    })
                  : classNames(
                      "inline-flex min-h-11 max-w-full items-center rounded-control px-3 py-2 text-button font-emphasis break-words text-text-primary underline-offset-8 transition-colors duration-(--duration-fast) hover:text-brand hover:underline hover:decoration-dashed hover:decoration-accent active:text-brand-active motion-reduce:transition-none",
                      isCurrent
                        ? "font-control text-brand underline decoration-brand decoration-2"
                        : "no-underline",
                    )
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <header
      {...headerProps}
      className={classNames(
        "min-w-0 border-b border-border bg-surface shadow-hairline",
        className,
      )}
    >
      <nav
        aria-label="Primary navigation"
        onKeyDown={handleKeyDown}
        className="mx-auto w-full max-w-page min-w-0 px-gutter py-3 md:flex md:items-center md:justify-between md:gap-component"
      >
        <div className="flex min-w-0 items-center justify-between gap-3 md:contents">
          <Link
            href="/"
            aria-label="SewnCovers home"
            aria-current={brandIsCurrent ? "page" : undefined}
            onClick={closeMenu}
            className={classNames(
              "inline-flex min-h-11 max-w-full items-center rounded-control px-1 font-display text-section-title font-heading tracking-heading text-brand underline-offset-8 transition-colors duration-(--duration-fast) hover:text-brand-hover hover:underline hover:decoration-dashed hover:decoration-accent active:text-brand-active motion-reduce:transition-none",
              brandIsCurrent
                ? "underline decoration-accent decoration-dashed decoration-2"
                : "no-underline",
            )}
          >
            <span className="break-words">SewnCovers</span>
          </Link>
          {navigationItems.length > 0 ? (
            <button
              ref={menuButtonRef}
              type="button"
              aria-expanded={menuIsOpen}
              aria-controls="site-navigation-menu"
              onClick={() => setOpenHref(menuIsOpen ? null : currentHref)}
              className={buttonClasses({
                className: "shrink-0 md:hidden",
                size: "compact",
                variant: "secondary",
              })}
            >
              Menu
            </button>
          ) : null}
        </div>

        {navigationItems.length > 0 ? (
          <div
            id="site-navigation-menu"
            className={classNames(
              "mt-2 min-w-0 border-t border-dashed border-border-strong pt-2 md:mt-0 md:block md:w-auto md:border-0 md:pt-0",
              menuIsOpen ? "block" : "hidden",
            )}
          >
            <div className="min-w-0 md:flex md:items-center md:justify-end">
              {renderItems(
                primaryItems,
                "Primary destinations",
                "flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:justify-end",
              )}
              {utilityItems.length > 0
                ? renderItems(
                    utilityItems,
                    "Shopping and account",
                    "mt-2 flex min-w-0 flex-col gap-1 border-t border-dashed border-border-strong pt-2 md:ml-2 md:mt-0 md:flex-row md:items-center md:border-t-0 md:border-l md:pt-0 md:pl-2",
                  )
                : null}
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
