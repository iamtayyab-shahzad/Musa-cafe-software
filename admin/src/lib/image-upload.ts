/** Compress locally, then upload to Cloudinary via the API. Store the URL only. */

import { API_URL, TOKEN_KEY } from "@/lib/utils";

export const IMAGE_MAX_EDGE_PX = 1200;
export const IMAGE_MAX_OUTPUT_BYTES = 400 * 1024; // ~400KB after compress
export const IMAGE_MAX_INPUT_BYTES = 8 * 1024 * 1024;

export type PreparedImage = {
  url: string;
  width: number;
  height: number;
  bytesApprox: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Image compress failed"));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

async function compressToBlob(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPG, PNG, or WebP)");
  }
  if (file.size > IMAGE_MAX_INPUT_BYTES) {
    throw new Error("Image is too large (max 8MB). Choose a smaller photo.");
  }

  const img = await loadImage(file);
  const scale = Math.min(
    1,
    IMAGE_MAX_EDGE_PX / Math.max(img.width, img.height, 1),
  );
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser cannot process images");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const types = ["image/webp", "image/jpeg"];
  let best: Blob | null = null;
  for (const type of types) {
    for (const quality of [0.82, 0.72, 0.62, 0.5]) {
      try {
        const blob = await canvasToBlob(canvas, type, quality);
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= IMAGE_MAX_OUTPUT_BYTES) {
          return { blob, width, height };
        }
      } catch {
        /* try next */
      }
    }
  }

  if (best && best.size <= IMAGE_MAX_OUTPUT_BYTES * 1.25) {
    return { blob: best, width, height };
  }

  throw new Error(
    "Image is still too heavy after compress. Use a clearer, smaller photo.",
  );
}

async function uploadToCloudinary(blob: Blob): Promise<string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) {
    throw new Error("Please sign in again before uploading images.");
  }
  const fd = new FormData();
  const name = blob.type === "image/webp" ? "photo.webp" : "photo.jpg";
  fd.append("file", blob, name);
  const res = await fetch(`${API_URL}/uploads/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: { url?: string };
  } | null;
  if (!res.ok || !json?.success || !json.data?.url) {
    throw new Error(
      json?.message ||
        "Cloudinary upload failed. Set CLOUDINARY_* on the API and try again.",
    );
  }
  return json.data.url;
}

/**
 * Rejects leftover base64 data-URLs. Product records must store a URL or path.
 */
export function assertImageFieldSafe(image: string): void {
  const value = (image || "").trim();
  if (!value) return;
  if (value.startsWith("data:")) {
    throw new Error(
      "Upload the photo instead of pasting a data URL. Images are hosted on Cloudinary.",
    );
  }
  if (value.length > 2000) {
    throw new Error("Image URL is too long.");
  }
}

/**
 * Resize + compress, then upload to Cloudinary. Returns the hosted URL.
 */
export async function prepareProductImage(file: File): Promise<PreparedImage> {
  const { blob, width, height } = await compressToBlob(file);
  const url = await uploadToCloudinary(blob);
  return { url, width, height, bytesApprox: blob.size };
}
