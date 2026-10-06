import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// /robots.txt: everything is public except the API (the revalidate hook and the
// article view counter), and search engines are pointed at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
