import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // App root must be `website/` so `public/products` is included in the Vercel
  // deployment. Pointing turbopack at the monorepo parent caused image 404s.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    // Bypass /_next/image optimizer — Next 16 + missing/local source files was
    // returning HTTP 400 for every /products/*.webp. Serve public assets directly.
    unoptimized: true,
    localPatterns: [
      { pathname: "/products/**" },
      { pathname: "/**" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  headers: async () => [
    {
      source: "/products/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      // Favicons must not be immutable forever — Google/browser keep stale icons.
      source: "/favicon.ico",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, must-revalidate",
        },
      ],
    },
    {
      source: "/icons/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, must-revalidate",
        },
      ],
    },
    {
      source: "/apple-touch-icon.png",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, must-revalidate",
        },
      ],
    },
    {
      source: "/(.*)\\.(webp|avif|jpg|jpeg|svg|woff2)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
