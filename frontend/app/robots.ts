import type { MetadataRoute } from "next";

import { siteUrl } from "@/config/site-metadata";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/SewnCovers/",
      userAgent: "*",
    },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
