import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import {
  AuthReturnFocus,
  RouteAwareSiteFooter,
  RouteAwareSiteHeader,
} from "@/components/layout/route-aware-site-layout";
import { parsePublicApiOrigin } from "@/config/environment";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  exportedAssetPath,
  SITE_NAME,
  SOCIAL_IMAGE,
  siteUrl,
  THEME_COLOR,
} from "@/config/site-metadata";
import { AuthProvider } from "@/context/auth";
import { ConfigurationProvider } from "@/context/configuration";

import "./globals.css";

const publicApiOrigin = parsePublicApiOrigin(
  process.env.NEXT_PUBLIC_API_URL,
);
const publicApiConnectSource = publicApiOrigin ? ` ${publicApiOrigin}` : "";

// Self-hosted OFL fonts (see app/fonts/README.md). Local files keep builds
// offline-safe and serve fonts from /_next/static/media under the base path.
const fraunces = localFont({
  adjustFontFallback: "Times New Roman",
  display: "swap",
  fallback: ["Iowan Old Style", "Georgia", "serif"],
  src: "./fonts/fraunces-latin-opsz-wght.woff2",
  variable: "--font-fraunces",
  weight: "100 900",
});

const geist = localFont({
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  src: "./fonts/geist-latin-wght.woff2",
  variable: "--font-geist",
  weight: "100 900",
});

const geistMono = localFont({
  adjustFontFallback: false,
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  preload: false,
  src: "./fonts/geist-mono-latin-wght.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: THEME_COLOR,
};

export const metadata: Metadata = {
  applicationName: SITE_NAME,
  description: DEFAULT_DESCRIPTION,
  manifest: exportedAssetPath("/site.webmanifest"),
  metadataBase: new URL(siteUrl()),
  openGraph: {
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        alt: SOCIAL_IMAGE.alt,
        height: SOCIAL_IMAGE.height,
        type: SOCIAL_IMAGE.type,
        url: siteUrl(SOCIAL_IMAGE.path),
        width: SOCIAL_IMAGE.width,
      },
    ],
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    type: "website",
  },
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  twitter: {
    card: "summary_large_image",
    description: DEFAULT_DESCRIPTION,
    images: [{ alt: SOCIAL_IMAGE.alt, url: siteUrl(SOCIAL_IMAGE.path) }],
    title: DEFAULT_TITLE,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content={`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'${publicApiConnectSource}; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`}
        />
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only rounded-control bg-brand text-button font-control text-on-brand focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:px-control-x focus:py-control-y focus:not-sr-only"
        >
          Skip to main content
        </a>
        <AuthProvider>
          <RouteAwareSiteHeader
            primaryItems={[
              { asButton: true, href: "/configure/", label: "Configure" },
              { href: "/commerce/", label: "Pricing" },
            ]}
            utilityItems={[
              { href: "/projects/", label: "My projects", requiresAccount: true },
              { href: "/cart/", label: "Cart", requiresAccount: true },
              { href: "/account/", label: "Account" },
            ]}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex min-w-0 flex-1 flex-col"
          >
            <ConfigurationProvider>{children}</ConfigurationProvider>
          </main>
          <RouteAwareSiteFooter
            navigationItems={[
              { href: "/legal/", label: "Legal and privacy" },
            ]}
          />
          <AuthReturnFocus />
        </AuthProvider>
      </body>
    </html>
  );
}
