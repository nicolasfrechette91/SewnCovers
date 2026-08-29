import type { Metadata } from "next";

const documents = [
  {
    type: "terms",
    title: "Terms of use",
    body: [
      "This portfolio demonstration lets guests configure cushions anonymously and lets registered users save private projects. Do not use it for unlawful, harmful, or rights-infringing material.",
      "Accounts use opaque bearer sessions stored in this browser. Anyone with an active bearer token or an unrevoked project-share token may exercise the access it grants.",
      "The demonstration is provided without commercial availability, uptime, manufacturing, pricing, delivery, or fitness guarantees.",
    ],
  },
  {
    type: "privacy",
    title: "Privacy notice",
    body: [
      "The local API stores account credentials as password hashes, session tokens as hashes, private project versions, upload processing records, consent decisions, and immutable commerce records. Shipping fields are encrypted separately.",
      "An authorized export includes account, project, custom-pattern metadata, retained order data, legal acknowledgements, and analytics-consent history. Account deletion removes private workspace data unless an active paid order must first be fulfilled or reviewed; retained completed-order records are detached and shipping fields are removed.",
      "No guaranteed deletion timeline or jurisdictional legal basis is claimed. Operational retention enforcement and qualified privacy review remain required before production use.",
    ],
  },
  {
    type: "tracking",
    title: "Cookie and analytics notice",
    body: [
      "Strictly necessary browser storage keeps the current bearer session, rotating guest analytics pseudonym, and analytics preference. The configurator remains fully usable when optional analytics are rejected.",
      "Optional first-party analytics are disabled until affirmative consent and stop after rejection or withdrawal. Global Privacy Control keeps optional collection off. Allowlisted events exclude contact details, full measurements, filenames, private asset identities, share tokens, order references, URLs, and uploaded bytes.",
      "Raw optional events have a documented 30-day local retention target; aggregates suppress cohorts below three. Withdrawal cannot retroactively alter aggregates that were already irreversibly anonymized. No third-party analytics request occurs by default.",
    ],
  },
  {
    type: "uploads",
    title: "Custom upload and moderation notice",
    body: [
      "Upload only an image you have permission to use. A configured external moderation provider may process it; automated moderation does not guarantee safety or legality, and approval does not establish copyright ownership.",
      "Private originals are never used as public preview URLs. Approved derivatives use short-lived access. Deleted, expired, rejected, revoked, or unauthorized assets stop rendering in projects and advanced previews.",
      "After verified payment, a protected production derivative copy may be retained with the immutable order even when the account upload is later deleted. This portfolio behavior requires professional and operational review.",
    ],
  },
  {
    type: "commerce",
    title: "Demonstration commerce and fulfilment notice",
    body: [
      "CAD prices, quotes, cart totals, checkout, tax, shipping, refunds, production, quality control, and fulfilment are fictional sandbox workflows unless a production adapter is explicitly and completely configured.",
      "The server owns amounts, currency, immutable configuration snapshots, webhook state, production specifications, and transition authority. Redirects do not prove payment.",
      "Approximate previews and production packets do not supply seam allowances, cutting instructions, tolerances, manufacturing accuracy, delivery estimates, or guarantees.",
    ],
  },
  {
    type: "accessibility",
    title: "Accessibility statement",
    body: [
      "The repository includes semantic form controls, visible focus, keyboard workflows, status announcements, reduced-motion handling, forced-colors treatment for HTML controls, responsive checks, and a complete non-canvas 2D fallback.",
      "The WebGL canvas has an equivalent textual configuration summary but cannot fully reproduce forced-colors output. Automated checks do not establish WCAG conformance.",
      "Manual screen-reader, browser, touch-device, GPU, zoom, and assistive-technology verification remains required before production use.",
    ],
  },
  {
    type: "security",
    title: "Security and vulnerability reporting",
    body: [
      "Implemented controls include hashed bearer sessions and shares, owner and administrator authorization, private asset grants, verified webhook processing, encrypted shipping fields, cache restrictions, security headers on API responses, append-only audit history, and secret-redacting readiness checks.",
      "No penetration test, formal threat-model review, security certification, compliance status, guaranteed incident response, or production monitoring is claimed.",
      "The placeholder reporting address is security-contact@example.invalid. It is deliberately non-routable and must be replaced with an operated channel before production use.",
    ],
  },
] as const;

export const metadata: Metadata = {
  title: "Legal and consent information | SewnCovers",
  description:
    "Versioned portfolio-demonstration terms, privacy, analytics, upload, commerce, accessibility, and security information.",
};

export default function LegalPage() {
  return (
    <div className="bg-page py-section">
      <div className="mx-auto w-full max-w-4xl px-gutter">
        <header>
          <p className="text-label font-control text-accent-strong">
            Versioned demonstration documents
          </p>
          <h1 className="mt-2 font-display text-page-title font-heading">
            Legal and consent information
          </h1>
          <p className="mt-component rounded-card border border-error-border bg-error-surface p-4">
            Portfolio demonstration content, version 1, draft review date
            August 29, 2026. It has not been approved by a lawyer and must
            receive qualified legal, privacy, accessibility, security, and
            operational review before production use.
          </p>
        </header>
        <nav className="mt-layout" aria-label="Legal documents">
          <ul className="flex flex-wrap gap-2">
            {documents.map((document) => (
              <li key={document.type}>
                <a
                  className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-3 text-brand underline"
                  href={"#" + document.type}
                >
                  {document.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-layout space-y-layout">
          {documents.map((document) => (
            <article
              id={document.type}
              key={document.type}
              className="scroll-mt-layout rounded-panel border border-border bg-surface p-card shadow-card"
            >
              <p className="text-label font-control text-accent-strong">
                Document type: {document.type} · Version 1 · Draft review
                date: August 29, 2026
              </p>
              <h2 className="mt-2 font-display text-section-title font-heading">
                {document.title}
              </h2>
              {document.body.map((paragraph) => (
                <p className="mt-3 text-text-muted" key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>
        <section className="mt-layout rounded-panel border border-border bg-surface p-card">
          <h2 className="font-display text-section-title font-heading">
            Third-party processing categories and retention map
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-supporting">
              <thead><tr><th className="border border-border p-2">Category</th><th className="border border-border p-2">Configured boundary</th><th className="border border-border p-2">Portfolio retention</th></tr></thead>
              <tbody>
                <tr><th className="border border-border p-2">Payments</th><td className="border border-border p-2">Stripe configured-only; sandbox local</td><td className="border border-border p-2">No raw payment payload; immutable order and verified-event digest retained</td></tr>
                <tr><th className="border border-border p-2">Uploads</th><td className="border border-border p-2">Private S3-compatible storage and external moderation configured-only</td><td className="border border-border p-2">Private objects deleted on account/upload deletion except protected paid-order derivatives</td></tr>
                <tr><th className="border border-border p-2">Analytics</th><td className="border border-border p-2">First-party local adapter only</td><td className="border border-border p-2">Raw optional events: documented 30-day target; suppressed aggregates may persist</td></tr>
                <tr><th className="border border-border p-2">Shipping</th><td className="border border-border p-2">Encrypted database fields; allowlisted fictional carriers</td><td className="border border-border p-2">Removed when a retained order is detached on account deletion</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
