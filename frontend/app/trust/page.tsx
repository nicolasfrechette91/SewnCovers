import type { Metadata } from "next";

const rows = [
  ["Implemented locally", "Hashed bearer sessions/shares, private projects, custom-asset authorization, immutable commerce, verified webhooks, encrypted shipping, administrator roles/audit, consent-gated analytics, production work, and readiness checks."],
  ["Verified deterministically", "Root and Pages export, migration, authorization, sandbox commerce, analytics consent/allowlist/suppression, production transitions/packets, export/deletion, responsive and keyboard paths."],
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
            <li>The static Next.js client holds only public configuration and transient bearer access; FastAPI owns accounts, authorization, persistence, pricing, payments, production, and private assets.</li>
            <li>Public immutable designs contain built-in patterns only. Private versions and bearer shares remain owner-scoped and revocable.</li>
            <li>Approved custom derivatives are accessed through short-lived grants. The advanced preview fetches a private derivative into an isolated object URL and revokes it on cleanup; private originals are never rendered.</li>
            <li>Payment redirects are informational. Verified raw-body webhooks own payment state, asset promotion, paid-order creation, and production-work derivation.</li>
            <li>Optional analytics use a strict schema and affirmative versioned consent. Account context is server-derived; guest pseudonyms rotate without fingerprinting.</li>
          </ul>
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
