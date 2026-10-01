import { AccountRequired } from "@/components/account/account-required";
import { GuestEmptyState } from "@/components/account/guest-empty-state";
import { noticeClasses, noticeTitleClasses } from "@/components/ui";
import type { AuthenticationReturnTarget } from "@/services/auth-navigation";

export function DemoBanner() {
  return (
    <aside className={noticeClasses("sandbox")} aria-label="Demonstration commerce notice">
      <p className={noticeTitleClasses("sandbox")}>Sandbox demonstration</p>
      <p className="mt-1 text-supporting text-notice-text">Fictional CAD prices and payment events only. No live charge, tax, shipment, or production service is available.</p>
    </aside>
  );
}

type CommerceAccessContext = "administrator" | "cart" | "checkout" | "orders" | "pricing";

const ACCESS_COPY: Readonly<Record<"administrator" | "checkout", {
  description: string;
  guestDescription?: string;
  guestLabel?: string;
  returnTo?: AuthenticationReturnTarget;
  title: string;
  unlocks: string;
}>> = {
  administrator: {
    title: "Sign in to check administrator access",
    description: "Administration requires a current session whose server-verified role is administrator.",
    unlocks: "Signing in checks that existing role. Creating an account creates a customer account and cannot grant administrator access.",
  },
  checkout: {
    title: "Sign in to check your demonstration order",
    description: "Checkout return details are private because they refer to an account-owned fictional order.",
    unlocks: "Signing in opens your demonstration order history, where you can check the latest simulated payment and fulfilment state.",
    returnTo: "orders",
    guestDescription: "You can still configure and publicly share a design without viewing private checkout or order records.",
    guestLabel: "Return to the configurator",
  },
};

// Guests reach the cart, orders and quotes pages from the header and pricing
// page, so they get a calm explanation rather than a sign-in wall.
const GUEST_COPY = {
  cart: {
    title: "Your demonstration cart is empty",
    description: "In this sandbox a cart holds fictional quotes for designs saved to My projects, so it belongs to an account. Add a design from its Review stage; you’ll be asked to sign in then.",
    signInLabel: "Sign in to see your cart",
    titleAs: "h2",
  },
  orders: {
    title: "No demonstration orders to show",
    description: "Fictional orders come from a signed-in demonstration cart and stay private to that account.",
    signInLabel: "Sign in to see your orders",
    titleAs: "h2",
  },
  pricing: {
    title: "No quotes yet",
    description: "Owned quotes are priced from designs saved to My projects. Save a design, or add it to the cart, from its Review stage; you’ll be asked to sign in then.",
    signInLabel: "Sign in to see your quotes",
    titleAs: "h3",
  },
} as const;

export function SignInForCommerce({
  context = "pricing",
  sessionNotice,
}: Readonly<{
  context?: CommerceAccessContext;
  sessionNotice?: string;
}>) {
  if (context === "cart" || context === "orders" || context === "pricing") {
    const guest = GUEST_COPY[context];
    return (
      <div className="space-y-component">
        <DemoBanner />
        <GuestEmptyState
          title={guest.title}
          titleAs={guest.titleAs}
          description={<p>{guest.description}</p>}
          returnTo={context}
          signInLabel={guest.signInLabel}
        />
      </div>
    );
  }
  const copy = ACCESS_COPY[context];
  return (
    <div className="space-y-component">
      <DemoBanner />
      <AccountRequired
        title={copy.title}
        description={copy.description}
        unlocks={copy.unlocks}
        returnTo={copy.returnTo}
        sessionNotice={sessionNotice}
        guestAlternative={copy.guestDescription && copy.guestLabel ? {
          href: "/configure/",
          description: copy.guestDescription,
          label: copy.guestLabel,
        } : undefined}
      />
    </div>
  );
}

export function CommerceError({ message }: Readonly<{ message: string }>) {
  return <p className="wrap-anywhere rounded-card border border-error-border bg-error-surface px-5 py-3 text-supporting text-error-text" role="alert">{message}</p>;
}
