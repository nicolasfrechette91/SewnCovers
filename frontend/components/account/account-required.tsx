import {
  ButtonLink,
  cardTitleClasses,
  ErrorMessage,
  sectionTitleClasses,
  StitchDivider,
  surfaceClasses,
  TextLink,
} from "@/components/ui";
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
    <section className={surfaceClasses({ className })}>
      <Heading
        className={headingLevel === "h2" ? sectionTitleClasses : cardTitleClasses}
      >
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
      <div className="mt-component flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
        <ButtonLink href={buildAccountHref("login", returnTo)}>Sign in</ButtonLink>
        <ButtonLink
          href={buildAccountHref("register", returnTo)}
          variant="secondary"
        >
          Create account
        </ButtonLink>
      </div>
      {guestAlternative ? (
        <div className="mt-component">
          <StitchDivider />
          <p className="mt-4 max-w-3xl break-words text-supporting text-text-muted">
            {guestAlternative.description}
          </p>
          <TextLink href={guestAlternative.href} className="mt-1">
            {guestAlternative.label}
          </TextLink>
        </div>
      ) : null}
    </section>
  );
}
