import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/analyze", "/compare", "/pricing", "/privacy", "/terms"],
      disallow: ["/result/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
