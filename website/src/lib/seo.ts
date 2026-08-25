import type { Metadata } from "next";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_URL,
} from "@/lib/constants";

/** Absolute canonical URL for a public path (e.g. "/" or "/menu"). */
export function canonicalUrl(path: string): string {
  if (!path || path === "/") return SITE_URL;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

type PageSeoInput = {
  /** Browser tab / OG title (use absoluteTitle when it should not use the root template). */
  title: string;
  description: string;
  /** Path only, e.g. "/menu" or "/". */
  path: string;
  /** When true, title is used as-is (no site-name template). */
  absoluteTitle?: boolean;
};

/** Shared Metadata for public pages — canonical + OG + Twitter, zero extra JS. */
export function pageSeo({
  title,
  description,
  path,
  absoluteTitle = false,
}: PageSeoInput): Metadata {
  const url = canonicalUrl(path);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      locale: "en_PK",
      url,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: SITE_OG_IMAGE,
          width: 512,
          height: 512,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [SITE_OG_IMAGE],
    },
  };
}

export const DEFAULT_HOME_TITLE = `${SITE_NAME} | Pizza, Burgers & Fast Food`;

export const DEFAULT_HOME_DESCRIPTION = SITE_DESCRIPTION;
