"use client";

import Link from "next/link";

import examples from "@/data/public-pricing-examples.json";
import { useAuth } from "@/context/auth";
import { buildAccountHref } from "@/services/auth-navigation";

export function formatPublicCad(amountMinor: number): string {
  const amount = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amountMinor / 100);
  return `$${amount} CAD`;
}

const linkBase =
  "inline-flex min-h-12 max-w-full items-center justify-center rounded-control px-control-x py-control-y text-center text-button font-control break-words no-underline";

export function PublicPricingOverview() {
  const { state } = useAuth();
  const showAccountActions = state.status !== "authenticated";

  return (
    <div className="space-y-component">
      <section className="rounded-panel border border-border bg-surface p-card" aria-labelledby="public-pricing-heading">
        <p className="text-label font-control uppercase tracking-label text-accent-strong">Public illustrative pricing</p>
        <h2 id="public-pricing-heading" className="mt-2 font-display text-section-title font-heading">How demonstration prices work</h2>
        <p className="mt-2 max-w-3xl text-text-muted">
          SewnCovers applies a fictional Canadian-dollar model to a cushion’s size, construction, material, and pattern source. These examples explain the model without creating a quote, cart, or account record.
        </p>
        <div className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link href="/configure/" className={`${linkBase} bg-brand text-on-brand shadow-raised`}>
            Start configuring
          </Link>
          {showAccountActions ? (
            <>
              <Link href={buildAccountHref("login", "pricing")} className={`${linkBase} border border-border-strong bg-surface text-text-primary shadow-card`}>
                Sign in for an owned demo quote
              </Link>
              <Link href={buildAccountHref("register", "pricing")} className={`${linkBase} text-brand underline`}>
                Create an account
              </Link>
            </>
          ) : null}
        </div>
        <p className="mt-3 text-supporting text-text-muted">Starting a configuration does not create a quote.</p>
      </section>

      <section aria-labelledby="examples-heading">
        <div className="max-w-3xl">
          <h2 id="examples-heading" className="font-display text-section-title font-heading">Illustrative examples</h2>
          <p className="mt-2 text-text-muted">One cover each, calculated from demonstration price book v{examples.priceBookVersion}. Fictional tax and shipping are excluded and would be calculated only in the authenticated sandbox checkout.</p>
        </div>
        <ul className="mt-4 grid min-w-0 gap-component lg:grid-cols-3">
          {examples.examples.map((example) => (
            <li key={example.id} className="min-w-0 rounded-panel border border-border bg-surface p-card">
              <article aria-labelledby={`${example.id}-heading`}>
                <p className="text-label font-control uppercase tracking-label text-accent-strong">Fictional example · not a quote</p>
                <h3 id={`${example.id}-heading`} className="mt-2 font-display text-section-title font-heading">{example.name}</h3>
                <p className="mt-3 font-display text-page-title font-heading">
                  <data value={(example.amountMinor / 100).toFixed(2)} aria-label={`${formatPublicCad(example.amountMinor)} illustrative price`}>
                    {formatPublicCad(example.amountMinor)}
                  </data>
                </p>
                <dl className="mt-4 grid gap-2 text-supporting">
                  <div><dt className="font-control">Shape and size</dt><dd className="text-text-muted">{example.shapeLabel} · {example.dimensionLabel}</dd></div>
                  <div><dt className="font-control">Material and fit</dt><dd className="text-text-muted">{example.materialLabel} · {example.fitLabel}</dd></div>
                  <div><dt className="font-control">Construction</dt><dd className="text-text-muted">{example.closureLabel} · {example.edgeLabel}</dd></div>
                  <div><dt className="font-control">Pattern source</dt><dd className="text-text-muted">{example.patternLabel}</dd></div>
                </dl>
                <p className="mt-4 border-t border-border pt-3 text-supporting text-text-muted">Includes the configured cover only. Excludes fictional tax and shipping.</p>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-component rounded-panel border border-border bg-surface p-card md:grid-cols-2" aria-labelledby="factors-heading">
        <div>
          <h2 id="factors-heading" className="font-display text-section-title font-heading">What changes the demonstration price</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-text-muted">
            <li>Shape, face area, and the configured dimensions</li>
            <li>Material, fit, closure or access, and edge finish</li>
            <li>Built-in versus custom pattern source</li>
            <li>Quantity, which multiplies the per-cover amount in an owned quote</li>
          </ul>
        </div>
        <div>
          <h3 className="font-display text-card-title font-heading">What does not change these examples</h3>
          <p className="mt-3 text-text-muted">The specific built-in artwork and its display scale are visual choices, not price factors. Fictional tax and shipping are excluded here and calculated separately during sandbox checkout.</p>
        </div>
      </section>

      <aside className="rounded-card border-2 border-accent-strong bg-error-surface p-4" aria-label="Prototype pricing limitations">
        <h2 className="font-control text-error-text">Prototype pricing only</h2>
        <p className="mt-1 text-supporting text-error-text">
          All prices are fictional demonstration values. Public examples are illustrative, are not saved quotes, and may differ from an owned quote when its configuration or fictional rules differ. An account is required for private demonstration quotes and commerce records. SewnCovers cannot charge real money: no real order, manufacturing, shipment, tax transaction, or fulfilment occurs. This prototype makes no commercial offer or price guarantee.
        </p>
      </aside>
    </div>
  );
}
