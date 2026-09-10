import { AccountRequired } from "@/components/account";
import type { AuthenticationReturnTarget } from "@/services/auth-navigation";

export function DemoBanner() {
  return (
    <aside className="rounded-card border-2 border-accent-strong bg-error-surface p-4" aria-label="Demonstration commerce notice">
      <p className="text-label font-control uppercase tracking-label text-error-text">Sandbox demonstration</p>
      <p className="mt-1 text-supporting text-error-text">Fictional CAD prices and payment events only. No live charge, tax, shipment, or production service is available.</p>
    </aside>
  );
}

type CommerceAccessContext = "administrator" | "cart" | "checkout" | "orders" | "pricing";

const ACCESS_COPY: Readonly<Record<CommerceAccessContext, {
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
  cart: {
    title: "Sign in to view your demonstration cart",
    description: "The cart is private because it contains fictional quotes saved to one account.",
    unlocks: "Signing in opens the cart associated with your account. Creating an account starts a new, empty private cart.",
    returnTo: "cart",
    guestDescription: "A cart is not needed to configure or publicly share a design with a built-in pattern.",
    guestLabel: "Return to the configurator",
  },
  checkout: {
    title: "Sign in to check your demonstration order",
    description: "Checkout return details are private because they refer to an account-owned fictional order.",
    unlocks: "Signing in opens your demonstration order history, where you can check the latest simulated payment and fulfilment state.",
    returnTo: "orders",
    guestDescription: "You can still configure and publicly share a design without viewing private checkout or order records.",
    guestLabel: "Return to the configurator",
  },
  orders: {
    title: "Sign in to view demonstration orders",
    description: "Fictional order records and fulfilment timelines are private to the account that created them.",
    unlocks: "Signing in opens your account's demonstration order history. Creating an account starts with no orders.",
    returnTo: "orders",
    guestDescription: "Orders are optional; guest configuration and public sharing with built-in patterns remain available.",
    guestLabel: "Start a guest design",
  },
  pricing: {
    title: "Sign in to create an owned demonstration quote",
    description: "Owned demonstration estimates and quotes use account-owned saved project versions, keeping quote history private.",
    unlocks: "Signing in opens eligible private project versions and your fictional quote history. Creating an account starts a new private workspace without prices or saved projects.",
    returnTo: "pricing",
    guestDescription: "The public examples above remain available, and configuring does not require an account or create a quote.",
    guestLabel: "Start configuring",
  },
};

export function SignInForCommerce({
  context = "pricing",
  sessionNotice,
}: Readonly<{
  context?: CommerceAccessContext;
  sessionNotice?: string;
}>) {
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
  return <p className="rounded-card border border-error-border bg-error-surface p-3 text-error-text" role="alert">{message}</p>;
}
