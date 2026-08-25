import type { MetadataRoute } from "next";
import { FAVICON_VERSION, SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { shop } from "@/lib/shop";

export default function manifest(): MetadataRoute.Manifest {
  const v = FAVICON_VERSION;
  return {
    name: SITE_NAME,
    short_name: shop.shortName,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#f97316",
    lang: "en-PK",
    icons: [
      {
        src: `/favicon.ico?v=${v}`,
        sizes: "48x48",
        type: "image/x-icon",
        purpose: "any",
      },
      {
        src: `/icon.png?v=${v}`,
        sizes: "48x48",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icons/icon-192.png?v=${v}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icons/icon-512.png?v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icons/icon-512.png?v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
