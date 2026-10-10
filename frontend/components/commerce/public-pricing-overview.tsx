"use client";

import {
  ButtonLink,
  noticeClasses,
  noticeTitleClasses,
  Surface,
  SectionHeader,
  SpecList,
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
      <Surface as="section" aria-labelledby="public-pricing-heading">
        <SectionHeader
          eyebrow="Public illustrative pricing"
          title="How demonstration prices work"
          titleId="public-pricing-heading"
        />
        <p className="mt-2 max-w-reading text-body text-text-muted">
          SewnCovers applies a fictional Canadian-dollar model to a cushion’s
          size, construction, material, and pattern source. These examples
          explain the model without creating a quote, cart, or account record.
        </p>
        <div className="mt-component flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ButtonLink href="/configure/">Start configuring</ButtonLink>
        </div>
        <p className="mt-3 text-supporting text-text-muted">
          Starting a configuration does not create a quote.
        </p>
      </Surface>

      <section aria-labelledby="examples-heading">
        <div className="max-w-reading">
          <SectionHeader
            title="Illustrative examples"
            titleId="examples-heading"
          />
          <p className="mt-2 text-body text-text-muted">
            One cover each, calculated from demonstration price book v
            {examples.priceBookVersion}. Fictional tax and shipping are excluded
            and would be calculated only in the authenticated sandbox checkout.
          </p>
        </div>
        <ul className="mt-component grid min-w-0 gap-component lg:grid-cols-3">
          {examples.examples.map((example) => (
            <Surface
              as="li"
              padding="none"
              key={example.id}
              className="flex flex-col"
            >
              <article
                aria-labelledby={`${example.id}-heading`}
                className="flex flex-1 flex-col p-card"
              >
                <SectionHeader
                  level={3}
                  size="card"
                  eyebrow="Fictional example · not a quote"
                  title={example.name}
                  titleId={`${example.id}-heading`}
                />
                <p className="mt-4 border-y border-dashed border-border-strong py-3 font-display text-section-title font-heading tabular-nums text-brand">
                  <data value={(example.amountMinor / 100).toFixed(2)}>
                    {formatPublicCad(example.amountMinor)}
                  </data>
                  <span className="sr-only"> illustrative price</span>
                </p>
                <SpecList
                  className="mt-4"
                  columns={1}
                  items={[
                    {
                      label: "Shape and size",
                      value: (
                        <>
                          {example.shapeLabel} · {example.dimensionLabel}
                        </>
                      ),
                      valueClassName:
                        "text-supporting break-words text-text-primary",
                    },
                    {
                      label: "Material and fit",
                      value: (
                        <>
                          {example.materialLabel} · {example.fitLabel}
                        </>
                      ),
                      valueClassName:
                        "text-supporting break-words text-text-primary",
                    },
                    {
                      label: "Construction",
                      value: (
                        <>
                          {example.closureLabel} · {example.edgeLabel}
                        </>
                      ),
                      valueClassName:
                        "text-supporting break-words text-text-primary",
                    },
                    {
                      label: "Pattern source",
                      value: example.patternLabel,
                      valueClassName:
                        "text-supporting break-words text-text-primary",
                    },
                  ]}
                />
                <p className="mt-auto pt-component text-supporting text-text-muted">
                  Includes the configured cover only. Excludes fictional tax and
                  shipping.
                </p>
              </article>
            </Surface>
          ))}
        </ul>
      </section>

      <Surface
        as="section"
        tone="subtle"
        elevation="flat"
        className="grid gap-component md:grid-cols-2"
        aria-labelledby="factors-heading"
      >
        <div>
          <SectionHeader
            title="What changes the demonstration price"
            titleId="factors-heading"
          />
          <ul className="mt-3 list-disc space-y-2 pl-5 text-body text-text-muted marker:text-accent">
            <li>Shape, face area, and the configured dimensions</li>
            <li>Material, fit, closure or access, and edge finish</li>
            <li>Built-in versus custom pattern source</li>
            <li>
              Quantity, which multiplies the per-cover amount in an owned quote
            </li>
          </ul>
        </div>
        <div>
          <SectionHeader
            level={3}
            size="card"
            title="What does not change these examples"
          />
          <p className="mt-3 text-body text-text-muted">
            The specific built-in artwork and its display scale are visual
            choices, not price factors. Fictional tax and shipping are excluded
            here and calculated separately during sandbox checkout.
          </p>
        </div>
      </Surface>

      <aside
        className={noticeClasses("prototype")}
        aria-label="Prototype pricing limitations"
      >
        <h2 className={noticeTitleClasses("prototype")}>
          Prototype pricing only
        </h2>
        <p className="mt-2 text-supporting text-notice-text">
          All prices are fictional demonstration values. Public examples are
          illustrative, are not saved quotes, and may differ from an owned quote
          when its configuration or fictional rules differ. An account is
          required for private demonstration quotes and commerce records.
          SewnCovers cannot charge real money: no real order, manufacturing,
          shipment, tax transaction, or fulfilment occurs. This prototype makes
          no commercial offer or price guarantee.
        </p>
      </aside>
    </div>
  );
}
