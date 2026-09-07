export function DemoBanner() {
  return (
    <aside className="rounded-card border-2 border-accent-strong bg-error-surface p-4" aria-label="Demonstration commerce notice">
      <p className="text-label font-control uppercase tracking-label text-error-text">Sandbox demonstration</p>
      <p className="mt-1 text-supporting text-error-text">Fictional CAD prices and payment events only. No live charge, tax, shipment, or production service is available.</p>
    </aside>
  );
}

export function SignInForCommerce() {
  return (
    <div className="space-y-component">
      <DemoBanner />
      <section className="rounded-panel border border-border bg-surface p-card">
        <h2 className="font-display text-section-title font-heading">Sign in for demonstration commerce</h2>
        <p className="mt-2 text-text-muted">The configurator and public sharing remain available to guests. An account is required only to keep fictional quotes, a cart, and orders private.</p>
        <a href="../account/" className="mt-4 inline-flex min-h-12 items-center rounded-control bg-brand px-control-x text-button font-control text-on-brand no-underline">Sign in or register</a>
      </section>
    </div>
  );
}

export function CommerceError({ message }: Readonly<{ message: string }>) {
  return <p className="rounded-card border border-error-border bg-error-surface p-3 text-error-text" role="alert">{message}</p>;
}
