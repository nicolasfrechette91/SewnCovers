"use client";

import {
  ButtonLink,
  noticeClasses,
  noticeTitleClasses,
} from "@/components/ui";

import examples from "@/data/public-pricing-examples.json";

export function formatPublicCad(amountMinor: number): string {
  const amount = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amountMinor / 100);
  return `$${amount} CAD`;
}

export function PublicPricingOverview() {
  return (
    <div className="space-y-component">
      <section className="rounded-panel border border-border bg-surface p-card shadow-hairline" aria-labelledby="public-pricing-heading">
        <p className="eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">Public illustrative pricing</p>
        <h2 id="public-pricing-heading" className="mt-3 font-display text-section-title font-heading tracking-heading text-text-primary">How demonstration prices work</h2>
        <p className="mt-2 max-w-3xl text-body text-text-muted">
          SewnCovers applies a fictional Canadian-dollar model to a cushion’s size, construction, material, and pattern source. These examples explain the model without creating a quote, cart, or account record.
        </p>
        <div className="mt-component flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ButtonLink href="/configure/">Start configuring</ButtonLink>
        </div>
        <p className="mt-3 text-supporting text-text-muted">Starting a configuration does not create a quote.</p>
      </section>

      <section aria-labelledby="examples-heading">
        <div className="max-w-3xl">
          <h2 id="examples-heading" className="font-display text-section-title font-heading tracking-heading text-text-primary">Illustrative examples</h2>
          <p className="mt-2 text-body text-text-muted">One cover each, calculated from demonstration price book v{examples.priceBookVersion}. Fictional tax and shipping are excluded and would be calculated only in the authenticated sandbox checkout.</p>
        </div>
        <ul className="mt-component grid min-w-0 gap-component lg:grid-cols-3">
          {examples.examples.map((example) => (
            <li key={example.id} className="flex min-w-0 flex-col rounded-panel border border-border bg-surface shadow-hairline">
              <article aria-labelledby={`${example.id}-heading`} className="flex flex-1 flex-col p-card">
                <p className="eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">Fictional example · not a quote</p>
                <h3 id={`${example.id}-heading`} className="mt-3 font-display text-card-title font-heading tracking-heading text-text-primary">{example.name}</h3>
                <p className="mt-4 border-y border-dashed border-border-strong py-3 font-display text-section-title font-heading tabular-nums text-brand">
                  <data value={(example.amountMinor / 100).toFixed(2)} aria-label={`${formatPublicCad(example.amountMinor)} illustrative price`}>
                    {formatPublicCad(example.amountMinor)}
                  </data>
                </p>
                <dl className="mt-4 grid gap-3 text-supporting">
                  <div><dt className="font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">Shape and size</dt><dd className="mt-0.5 text-text-primary">{example.shapeLabel} · {example.dimensionLabel}</dd></div>
                  <div><dt className="font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">Material and fit</dt><dd className="mt-0.5 text-text-primary">{example.materialLabel} · {example.fitLabel}</dd></div>
                  <div><dt className="font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">Construction</dt><dd className="mt-0.5 text-text-primary">{example.closureLabel} · {example.edgeLabel}</dd></div>
                  <div><dt className="font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">Pattern source</dt><dd className="mt-0.5 text-text-primary">{example.patternLabel}</dd></div>
                </dl>
                <p className="mt-auto pt-component text-supporting text-text-muted">Includes the configured cover only. Excludes fictional tax and shipping.</p>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-component rounded-panel border border-border bg-surface-subtle p-card md:grid-cols-2" aria-labelledby="factors-heading">
        <div>
          <h2 id="factors-heading" className="font-display text-section-title font-heading tracking-heading text-text-primary">What changes the demonstration price</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-body text-text-muted marker:text-accent">
            <li>Shape, face area, and the configured dimensions</li>
            <li>Material, fit, closure or access, and edge finish</li>
            <li>Built-in versus custom pattern source</li>
            <li>Quantity, which multiplies the per-cover amount in an owned quote</li>
          </ul>
        </div>
        <div>
          <h3 className="font-display text-card-title font-heading tracking-heading text-text-primary">What does not change these examples</h3>
          <p className="mt-3 text-body text-text-muted">The specific built-in artwork and its display scale are visual choices, not price factors. Fictional tax and shipping are excluded here and calculated separately during sandbox checkout.</p>
        </div>
      </section>

      <aside className={noticeClasses("prototype")} aria-label="Prototype pricing limitations">
        <h2 className={noticeTitleClasses("prototype")}>Prototype pricing only</h2>
        <p className="mt-2 text-supporting text-notice-text">
          All prices are fictional demonstration values. Public examples are illustrative, are not saved quotes, and may differ from an owned quote when its configuration or fictional rules differ. An account is required for private demonstration quotes and commerce records. SewnCovers cannot charge real money: no real order, manufacturing, shipment, tax transaction, or fulfilment occurs. This prototype makes no commercial offer or price guarantee.
        </p>
      </aside>
    </div>
  );
}
