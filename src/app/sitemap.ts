import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Only the public landing page; app screens depend on a watched address and session. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: new URL("/", siteUrl()).toString(), changeFrequency: "monthly", priority: 1 }];
}
