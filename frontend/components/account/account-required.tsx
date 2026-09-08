import Link from "next/link";

import { ErrorMessage } from "@/components/ui";
import { classNames } from "@/components/ui/class-names";
import {
  buildAccountHref,
  type AuthenticationReturnTarget,
} from "@/services/auth-navigation";

interface GuestAlternative {
  readonly description: string;
  readonly href: "/configure/";
  readonly label: string;
}

export interface AccountRequiredProps {
  readonly className?: string;
  readonly description: string;
  readonly guestAlternative?: GuestAlternative;
  readonly headingLevel?: "h2" | "h3" | "h4";
  readonly returnTo?: AuthenticationReturnTarget;
  readonly sessionNotice?: string;
  readonly title: string;
  readonly unlocks: string;
}

export function AccountRequired({
  className,
  description,
  guestAlternative,
  headingLevel = "h2",
  returnTo,
  sessionNotice,
  title,
  unlocks,
}: AccountRequiredProps) {
  const Heading = headingLevel;

  return (
    <section
      className={classNames(
        "min-w-0 rounded-panel border border-border bg-surface p-card",
        className,
      )}
    >
      <Heading className="break-words font-display text-section-title font-heading">
        {title}
      </Heading>
      <p className="mt-2 max-w-3xl break-words text-body text-text-muted">
        {description}
      </p>
      <p className="mt-3 max-w-3xl break-words text-supporting text-text-primary">
        {unlocks}
      </p>
      {sessionNotice ? (
        <ErrorMessage className="mt-3" role="status" aria-live="polite">
          {sessionNotice}
        </ErrorMessage>
      ) : null}
      <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href={buildAccountHref("login", returnTo)}
          className="inline-flex min-h-12 max-w-full items-center justify-center rounded-control bg-brand px-control-x py-control-y text-center text-button font-control break-words text-on-brand no-underline"
        >
          Sign in
        </Link>
        <Link
          href={buildAccountHref("register", returnTo)}
          className="inline-flex min-h-12 max-w-full items-center justify-center rounded-control border border-border-strong bg-surface px-control-x py-control-y text-center text-button font-control break-words text-text-primary no-underline"
        >
          Create account
        </Link>
      </div>
      {guestAlternative ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="max-w-3xl break-words text-supporting text-text-muted">
            {guestAlternative.description}
          </p>
          <Link
            href={guestAlternative.href}
            className="mt-2 inline-flex min-h-11 max-w-full items-center text-button font-control break-words text-brand underline"
          >
            {guestAlternative.label}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
