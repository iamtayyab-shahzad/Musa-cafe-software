/** Cloudinary (and local) image URLs with optional on-the-fly resize. */

export const PLACEHOLDER_IMAGE = "/products/placeholder.svg";

type MediaOpts = {
  /** Requested display width in CSS pixels. Defaults to 800 for Cloudinary URLs. */
  width?: number;
};

/**
 * Injects Cloudinary URL transforms for list/grid thumbnails.
 * Always requests auto format (WebP/AVIF) and auto quality so images stay small.
 * Local paths, data URLs, and non-Cloudinary hosts are returned unchanged.
 */
export function mediaUrl(
  src: string | undefined | null,
  opts: MediaOpts = {},
): string {
  const value = (src || "").trim();
  if (!value) return PLACEHOLDER_IMAGE;
  if (!value.includes("res.cloudinary.com") || !value.includes("/upload/")) {
    return value;
  }
  const width = opts.width && opts.width > 0 ? Math.round(opts.width) : 800;
  const transform = `f_auto,q_auto,c_fill,g_auto,w_${width}`;
  if (value.includes("/upload/f_auto") || /\/upload\/[^/]*w_/.test(value)) {
    return value;
  }
  return value.replace("/upload/", `/upload/${transform}/`);
}
