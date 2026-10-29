import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/kiosk", "/cart", "/checkout", "/account", "/wishlist", "/order-confirmation", "/search"] }],
    sitemap: `${env().SITE_URL}/sitemap.xml`,
  };
}
