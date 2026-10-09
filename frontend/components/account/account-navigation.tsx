"use client";

import Link from "next/link";

import { classNames } from "@/components/ui/class-names";
import { isCurrentNavigationPath } from "@/components/layout";
import { useAuth } from "@/context/auth";

const accountDestinations = [
  { href: "/account/", label: "Account settings" },
  { href: "/orders/", label: "Orders" },
] as const;

export function AccountNavigation({
  currentHref,
}: Readonly<{ currentHref: string }>) {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;

  const destinations =
    state.account.role === "administrator"
      ? [...accountDestinations, { href: "/admin/", label: "Administration" }]
      : accountDestinations;

  return (
    <nav
      aria-label="Account navigation"
      className="mb-layout rounded-control border border-border-strong bg-surface-subtle p-1"
    >
      <ul className="flex min-w-0 flex-wrap gap-1">
        {destinations.map((item) => {
          const isCurrent = isCurrentNavigationPath(currentHref, item.href);

          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={classNames(
                  "inline-flex min-h-11 max-w-full items-center rounded-control-small px-3 py-2 text-button font-emphasis break-words text-text-primary transition-colors duration-(--duration-fast) hover:bg-surface hover:text-brand active:text-brand-active motion-reduce:transition-none",
                  isCurrent
                    ? "bg-surface font-control text-brand shadow-card"
                    : "",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
