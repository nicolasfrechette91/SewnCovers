import type { Metadata } from "next";

export const SITE_NAME = "SewnCovers";
export const DEFAULT_TITLE =
  "SewnCovers | Cushion-cover design prototype";
export const DEFAULT_DESCRIPTION =
  "Explore a portfolio prototype for planning a replacement cushion cover around an existing cushion's shape, measurements, and fabric direction.";
export const PRODUCTION_ORIGIN = "https://nicolasfrechette91.github.io";
export const PRODUCTION_BASE_PATH = "/SewnCovers";
export const REPOSITORY_URL =
  "https://github.com/nicolasfrechette91/SewnCovers";

export const SOCIAL_IMAGE = Object.freeze({
  alt: "SewnCovers portfolio prototype: a measured approach to cushion-cover design.",
  height: 630,
  path: "/social-preview.jpg",
  type: "image/jpeg",
  width: 1200,
});

export const PUBLIC_INDEXABLE_PATHS = Object.freeze([
  "/",
  "/configure/",
  "/commerce/",
  "/legal/",
] as const);

export function siteUrl(path = "/"): string {
  const relativePath = path.replace(/^\/+/, "");
  const base = `${PRODUCTION_ORIGIN}${PRODUCTION_BASE_PATH}/`;
  return new URL(relativePath, base).toString();
}

export function exportedAssetPath(path: string): string {
  const relativePath = path.replace(/^\/+/, "");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${basePath}/${relativePath}`;
}

type PageMetadataOptions = Readonly<{
  description: string;
  index?: boolean;
  isHome?: boolean;
  path: string;
  title: string;
}>;

export function createPageMetadata({
  description,
  index = true,
  isHome = false,
  path,
  title,
}: PageMetadataOptions): Metadata {
  const canonical = siteUrl(path);
  const socialTitle = isHome ? DEFAULT_TITLE : `${title} | ${SITE_NAME}`;
  const image = {
    alt: SOCIAL_IMAGE.alt,
    height: SOCIAL_IMAGE.height,
    type: SOCIAL_IMAGE.type,
    url: siteUrl(SOCIAL_IMAGE.path),
    width: SOCIAL_IMAGE.width,
  };

  return {
    alternates: { canonical },
    description,
    openGraph: {
      description,
      images: [image],
      siteName: SITE_NAME,
      title: socialTitle,
      type: "website",
      url: canonical,
    },
    robots: index
      ? { follow: true, index: true }
      : {
          follow: false,
          googleBot: {
            follow: false,
            index: false,
            noimageindex: true,
          },
          index: false,
          nocache: true,
        },
    title: isHome ? { absolute: DEFAULT_TITLE } : title,
    twitter: {
      card: "summary_large_image",
      description,
      images: [{ alt: SOCIAL_IMAGE.alt, url: siteUrl(SOCIAL_IMAGE.path) }],
      title: socialTitle,
    },
  };
}
