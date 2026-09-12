import type { MetadataRoute } from "next";

import {
  PUBLIC_INDEXABLE_PATHS,
  siteUrl,
} from "@/config/site-metadata";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_INDEXABLE_PATHS.map((path) => ({ url: siteUrl(path) }));
}
