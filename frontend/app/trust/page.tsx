import type { Metadata } from "next";

const rows = [
  ["Implemented locally", "Hashed bearer sessions and shares, private projects, immutable configuration and commerce records, private-asset authorization, verified webhooks, encrypted shipping, administrator roles and audit history, consent-gated analytics, production work, and readiness checks."],
  ["Verified deterministically", "Ordinary and GitHub Pages exports, migrations, authorization boundaries, sandbox commerce, analytics consent and suppression, production transitions and packets, account export and deletion, responsive layouts, keyboard paths, and configurator behavior."],
  ["Configured, not live-verified", "Stripe Checkout, S3-compatible private object storage, and external moderation. No live request was made for this task."],
  ["Not implemented", "Live factory/ERP/carrier/tax/support integration, production monitoring, uptime guarantees, penetration testing, certification, or commercial deployment."],
  ["Professional or operational review required", "Legal content, contacts, retention operations, incident response, manual accessibility, threat modeling, and manufacturing rules."],
] as const;

export const metadata: Metadata = {
  title: "Trust and implementation boundaries | SewnCovers",
  description:
    "Evidence-bounded architecture, privacy, security, accessibility, dependency, and deployment status for the SewnCovers portfolio.",
};

export default function TrustPage() {
  return (
    <div className="bg-page py-section">
      <div className="mx-auto w-full max-w-5xl px-gutter">
        <header className="max-w-4xl">
          <p className="text-label font-control text-accent-strong">
            Public portfolio evidence
          </p>
          <h1 className="mt-2 font-display text-page-title font-heading">
            Trust, boundaries, and readiness
          </h1>
          <p className="mt-component text-text-muted">
            This page distinguishes implementation from deterministic tests,
            configured-only providers, omissions, and review requirements. It
            is not a certification, security audit, legal approval, compliance
            statement, penetration test, uptime promise, or deployment approval.
          </p>
        </header>
        <dl className="mt-layout grid gap-4">
          {rows.map(([label, value]) => (
            <div className="rounded-panel border border-border bg-surface p-card" key={label}>
              <dt className="font-display text-section-title font-heading">{label}</dt>
              <dd className="mt-2 text-text-muted">{value}</dd>
            </div>
          ))}
        </dl>
        <section className="mt-layout rounded-panel border border-border bg-surface p-card">
          <h2 className="font-display text-section-title font-heading">Architecture and authority</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-text-muted">
            <li>The exported Next.js client holds public configuration and transient bearer access only. FastAPI owns accounts, session verification, authorization, persistence, pricing, payment state, production state, and private assets.</li>
            <li>Account sessions and project-share tokens are stored as hashes by the API. Browser sessions stay tab-scoped; private project reads remain owner-authorized, while share URLs grant revocable read-only access to one saved version.</li>
            <li>Saved project versions and public designs are immutable configuration snapshots. Opening an earlier project version creates an editing basis; saving appends a new version instead of rewriting history.</li>
            <li>Public guest designs support built-in patterns only. Private custom-pattern versions remain account-scoped or available through an explicit project share.</li>
          </ul>
        </section>
        <section className="mt-layout rounded-panel border border-border bg-surface p-card">
          <h2 className="font-display text-section-title font-heading">Private assets, commerce, and analytics</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-text-muted">
            <li>Approved custom derivatives are accessed through short-lived private-asset grants. The advanced preview fetches a derivative into an isolated object URL and revokes it during cleanup; private originals are never rendered.</li>
            <li>Pricing derives amounts and CAD currency from an owner-authorized saved version. Browser-supplied totals are not accepted, quotes and pending orders are immutable records, and quantity changes create replacement quotes.</li>
            <li>Checkout redirects are informational. Verified raw-body webhook processing owns payment state, asset promotion, paid-order creation, and production-work derivation; the local sandbox exercises the same authority boundary without charging money.</li>
            <li>Optional analytics use a strict event schema and affirmative versioned consent. Account context is server-derived; guest pseudonyms rotate without fingerprinting, and suppressed aggregates hide small cohorts.</li>
          </ul>
        </section>
        <section className="mt-layout rounded-panel border border-border bg-surface p-card">
          <h2 className="font-display text-section-title font-heading">Testing and readiness evidence</h2>
          <p className="mt-3 text-text-muted">
            Automated configuration, service, component, export, and browser
            tests cover the implemented boundaries listed above. These checks
            are deterministic repository evidence, not live-provider
            verification, a penetration test, an accessibility conformance
            claim, or production approval.
          </p>
          <p className="mt-3 text-text-muted">
            Readiness checks are implemented to expose missing or unsafe
            configuration and redact secrets from reports. They do not replace
            operational monitoring, incident response, threat modeling, or
            professional review.
          </p>
        </section>
        <section className="mt-layout rounded-panel border border-border bg-surface p-card">
          <h2 className="font-display text-section-title font-heading">Hosting and dependency boundaries</h2>
          <p className="mt-3 text-text-muted">
            FastAPI emits CSP, referrer, permissions, framing, content-type,
            and private no-store controls. GitHub Pages cannot apply
            repository-defined response headers; the exported HTML meta CSP is
            a partial document policy, not an equivalent hosting control.
          </p>
          <p className="mt-3 text-text-muted">
            The documented reporting audit currently contains unresolved high
            findings. Nothing on this page describes them as remediated.
          </p>
          <p className="mt-3 text-text-muted">
            Placeholder vulnerability path:
            security-contact@example.invalid. This non-routable address must be
            replaced and operated before production use.
          </p>
        </section>
      </div>
    </div>
  );
}
