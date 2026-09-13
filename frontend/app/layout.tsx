import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import {
  RouteAwareSiteFooter,
  RouteAwareSiteHeader,
} from "@/components/layout/route-aware-site-layout";
import { ConsentPreferences } from "@/components/assurance/consent-preferences";
import { parsePublicApiOrigin } from "@/config/environment";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  exportedAssetPath,
  SITE_NAME,
  SOCIAL_IMAGE,
  siteUrl,
} from "@/config/site-metadata";
import { AuthProvider } from "@/context/auth";
import { ConfigurationProvider } from "@/context/configuration";

import "./globals.css";

const publicApiOrigin = parsePublicApiOrigin(
  process.env.NEXT_PUBLIC_API_URL,
);
const publicApiConnectSource = publicApiOrigin ? ` ${publicApiOrigin}` : "";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
        <RouteAwareSiteHeader
          primaryItems={[
            { href: "/configure/", label: "Configure" },
            { href: "/projects/", label: "My projects" },
            { href: "/commerce/", label: "Pricing" },
          ]}
          utilityItems={[
            { href: "/cart/", label: "Cart" },
            { href: "/account/", label: "Account" },
          ]}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col"
        >
          <AuthProvider>
            <ConfigurationProvider>{children}</ConfigurationProvider>
            <ConsentPreferences />
          </AuthProvider>
        </main>
        <RouteAwareSiteFooter
          navigationItems={[
            { href: "/legal/", label: "Legal and privacy" },
          ]}
        />
      </body>
    </html>
  );
}
