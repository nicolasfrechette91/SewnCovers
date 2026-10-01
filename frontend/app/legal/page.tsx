import type { Metadata } from "next";

import {
  PageHeader,
  PageShell,
  sectionTitleClasses,
} from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

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
      "The local API stores account credentials as password hashes, session tokens as hashes, private project versions, upload processing records, and immutable commerce records. Shipping fields are encrypted separately.",
      "Your design in progress is kept in this browser's local storage so a reload or a later visit can pick it up. It holds only your configurator choices (shape, measurements, cover details, pattern and the stage you reached) and, once you save it to a private project or the demonstration cart, that project's and quote's identifiers. Nothing is sent to the API until you create a public link or save a private project. Choose Start a new design, or clear this site's data in your browser, to remove it; signing out removes a draft saved to your account. Anyone using this browser profile can see it. Sign-in tokens stay in session storage and end when the tab closes. On your first page view in a tab, the site also sends one request that carries no design or personal data to wake the hosted API, and notes that in session storage so it asks only once.",
      "An authorized export includes account, project, custom-pattern metadata, retained order data, and legal acknowledgements. Account deletion removes private workspace data unless an active paid order must first be fulfilled or reviewed; retained completed-order records are detached and shipping fields are removed.",
      "No guaranteed deletion timeline or jurisdictional legal basis is claimed. Operational retention enforcement and qualified privacy review remain required before production use.",
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
      "The repository includes semantic form controls, visible focus, keyboard workflows, status announcements, reduced-motion handling, forced-colors treatment for HTML controls, and responsive checks.",
      "The illustrative 2D cushion preview has an equivalent textual configuration summary, but forced-colors mode may hide pattern colors and motifs. Automated checks do not establish WCAG conformance.",
      "Manual screen-reader, browser, touch-device, zoom, and assistive-technology verification remains required before production use.",
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

export const metadata: Metadata = createPageMetadata({
  title: "Legal information",
  description:
    "Versioned portfolio-demonstration terms, privacy, upload, commerce, accessibility, and security information.",
  path: "/legal/",
});

export default function LegalPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Versioned demonstration documents"
        title="Legal information"
      />
      <div className="grid min-w-0 gap-layout lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <nav className="min-w-0 lg:sticky lg:top-6" aria-label="Legal documents">
          <ol className="divide-y divide-dashed divide-border-strong border-y border-dashed border-border-strong">
            {documents.map((document, index) => (
              <li key={document.type}>
                <a
                  className="flex min-h-11 items-baseline gap-3 rounded-control-small py-2.5 text-supporting font-emphasis text-brand underline-offset-4 transition-colors duration-(--duration-fast) hover:text-brand-hover hover:underline motion-reduce:transition-none"
                  href={"#" + document.type}
                >
                  <span
                    aria-hidden="true"
                    className="font-mono text-eyebrow tabular-nums text-text-muted"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">{document.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 max-w-reading space-y-component">
          {documents.map((document) => (
            <article
              id={document.type}
              key={document.type}
              className="scroll-mt-layout rounded-panel border border-border bg-surface p-card shadow-hairline"
            >
              <h2 className={sectionTitleClasses}>{document.title}</h2>
              {document.body.map((paragraph) => (
                <p className="mt-3 text-body text-text-muted" key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
          <section className="rounded-panel border border-border bg-surface p-card shadow-hairline">
            <h2 className={sectionTitleClasses}>
              Third-party processing categories and retention map
            </h2>
            <p id="retention-scroll-help" className="mt-3 text-supporting text-text-muted">Scroll horizontally to read all columns when needed.</p>
            <div role="region" aria-label="Processing categories and retention" aria-describedby="retention-scroll-help" tabIndex={0} className="mt-4 overflow-x-auto rounded-card border border-border">
              <table className="w-full min-w-[36rem] border-collapse text-left text-supporting">
                <thead className="bg-surface-subtle"><tr><th scope="col" className="border-b border-border-strong px-4 py-3 font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">Category</th><th scope="col" className="border-b border-border-strong px-4 py-3 font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">Configured boundary</th><th scope="col" className="border-b border-border-strong px-4 py-3 font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">Portfolio retention</th></tr></thead>
                <tbody className="divide-y divide-dashed divide-border-strong">
                  <tr><th scope="row" className="px-4 py-3 align-top font-control text-text-primary">Payments</th><td className="px-4 py-3 align-top text-text-muted">Stripe configured-only; sandbox local</td><td className="px-4 py-3 align-top text-text-muted">No raw payment payload; immutable order and verified-event digest retained</td></tr>
                  <tr><th scope="row" className="px-4 py-3 align-top font-control text-text-primary">Uploads</th><td className="px-4 py-3 align-top text-text-muted">Private S3-compatible storage and external moderation configured-only</td><td className="px-4 py-3 align-top text-text-muted">Private objects deleted on account/upload deletion except protected paid-order derivatives</td></tr>
                  <tr><th scope="row" className="px-4 py-3 align-top font-control text-text-primary">Browser storage</th><td className="px-4 py-3 align-top text-text-muted">Design in progress in local storage; sign-in token and a one-time API wake-up marker in session storage</td><td className="px-4 py-3 align-top text-text-muted">Draft kept until you start a new design, sign out of the account it was saved to, or clear site data; sign-in ends when the tab closes</td></tr>
                  <tr><th scope="row" className="px-4 py-3 align-top font-control text-text-primary">Shipping</th><td className="px-4 py-3 align-top text-text-muted">Encrypted database fields; allowlisted fictional carriers</td><td className="px-4 py-3 align-top text-text-muted">Removed when a retained order is detached on account deletion</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
