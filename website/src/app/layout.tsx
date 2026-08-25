import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Noto_Nastaliq_Urdu, Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/providers";
import { JsonLd } from "@/components/seo/json-ld";
import {
  FAVICON_VERSION,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_URL,
} from "@/lib/constants";
import { storageKey } from "@/lib/shop";
import {
  DEFAULT_HOME_DESCRIPTION,
  DEFAULT_HOME_TITLE,
  canonicalUrl,
} from "@/lib/seo";
import "./globals.css";

const display = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  preload: true,
});

const body = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  preload: true,
});

/** Clear, high-legibility Urdu for menu chrome / labels. */
const urdu = Noto_Nastaliq_Urdu({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-urdu",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_HOME_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_HOME_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: canonicalUrl("/"),
  },
  icons: {
    // Google prefers a stable /favicon.ico (≥48px). Also expose PNG icons.
    icon: [
      {
        url: `/favicon.ico?v=${FAVICON_VERSION}`,
        sizes: "48x48",
        type: "image/x-icon",
      },
      {
        url: `/favicon.png?v=${FAVICON_VERSION}`,
        sizes: "48x48",
        type: "image/png",
      },
      {
        url: `/icon.png?v=${FAVICON_VERSION}`,
        sizes: "48x48",
        type: "image/png",
      },
      {
        url: `/icons/icon-32.png?v=${FAVICON_VERSION}`,
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: `/icons/icon-48.png?v=${FAVICON_VERSION}`,
        sizes: "48x48",
        type: "image/png",
      },
      {
        url: `/icons/icon-192.png?v=${FAVICON_VERSION}`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: `/icons/icon-512.png?v=${FAVICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: `/apple-touch-icon.png?v=${FAVICON_VERSION}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: `/favicon.ico?v=${FAVICON_VERSION}`,
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_PK",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_HOME_TITLE,
    description: SITE_DESCRIPTION,
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
    title: DEFAULT_HOME_TITLE,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  category: "food",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#f97316" },
  ],
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${urdu.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem("${storageKey("locale")}");if(l==="ur"){document.documentElement.lang="ur";document.documentElement.dir="rtl";document.documentElement.dataset.locale="ur";}var t=localStorage.getItem("${storageKey("site_theme")}");if(t==="dim"||t==="light"||t==="warm"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="flex min-h-full flex-col bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <JsonLd />
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
