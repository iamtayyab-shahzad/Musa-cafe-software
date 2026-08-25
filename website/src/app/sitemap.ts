import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

type Entry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

const PUBLIC_ROUTES: Entry[] = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/menu", changeFrequency: "daily", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.7 },
  { path: "/cart", changeFrequency: "weekly", priority: 0.4 },
  { path: "/checkout", changeFrequency: "weekly", priority: 0.5 },
  { path: "/checkout/guest", changeFrequency: "weekly", priority: 0.5 },
  { path: "/login", changeFrequency: "monthly", priority: 0.3 },
  { path: "/register", changeFrequency: "monthly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
