/**
 * Restyle cold-drink product shots onto warm restaurant backgrounds
 * (matches pizza/shake aesthetic) and write mineral water small + large.
 */
const fs = require("fs");
const path = require("path");
const sharp = require(path.join(__dirname, "..", "website", "node_modules", "sharp"));

const assets =
  "C:/Users/admin/.cursor/projects/c-Users-admin-Desktop-summer-work-krunchies-full-setup/assets";

const SIZE = 800;

/** Source PNGs in assets folder */
const sources = {
  "category.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_1.5litercoca-f974426e-51f1-4e60-9096-67cd0a6cfac0.png",
  "regular-drink.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_softdrink-88965e51-59e9-42fa-aa27-a39bfe333be5.png",
  "500ml-drink.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_1litersprite-3b2351c8-88e5-4825-9ff4-7c4bbce1ecc8.png",
  "1-liter-drink.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_literfanta-ec42361a-4ba9-4cbc-808f-230a77c7e687.png",
  "1.5-liter-drink.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_1.5litercoca-f974426e-51f1-4e60-9096-67cd0a6cfac0.png",
  "2.25-liter-drink.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_2.25litercoca-b2b65c8f-02aa-4188-a01c-0bc89060c35c.png",
  "tin.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_softdrink1-a526acbe-9350-4f9e-9fbe-3f9075da8e1b.png",
  "sting.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_softdrink-88965e51-59e9-42fa-aa27-a39bfe333be5.png",
  "sprite-1.5l.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_1.5litersprite-256018dc-89f7-423d-9b0e-62369ca81952.png",
  "fanta-1l.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_1literfanta-a35ae4b0-f6b9-4028-ada0-b1b031dcb150.png",
  "fanta-1.5l.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_1.5literfanta-a8769a28-c633-48cd-9e0c-6e689bfe65d5.png",
  "fanta-2.25l.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_2.25literfanta-87b2795e-6311-440e-be73-6eb5ae3a0716.png",
  "sprite-2.25l.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_2.25litersprite-4a8e8e45-69df-4c82-ad65-343df1f3c957.png",
  // New uploads: Nestlé 500ml = small, Aquafina = large
  "mineral-water-small.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_images-9fc4ea03-858d-4b30-b9f4-6fbadaad96ac.png",
  "mineral-water-large.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_mineralwater-4f13d14e-1029-42b2-a421-2da678f08f8c.png",
};

/** Soft glow tint per product (warm restaurant feel) */
const tints = {
  "category.webp": { light: "#5a2828", mid: "#2a1814", dark: "#120c0a" },
  "regular-drink.webp": { light: "#2f4a32", mid: "#1a2418", dark: "#0c100c" },
  "500ml-drink.webp": { light: "#2a4a38", mid: "#16241c", dark: "#0a100e" },
  "1-liter-drink.webp": { light: "#6a3a18", mid: "#2e1c10", dark: "#120c08" },
  "1.5-liter-drink.webp": { light: "#5a2828", mid: "#2a1814", dark: "#120c0a" },
  "2.25-liter-drink.webp": { light: "#5a2828", mid: "#2a1814", dark: "#120c0a" },
  "tin.webp": { light: "#2f4a32", mid: "#1a2418", dark: "#0c100c" },
  "sting.webp": { light: "#3a2a48", mid: "#1c1424", dark: "#0c0a10" },
  "sprite-1.5l.webp": { light: "#2a4a38", mid: "#16241c", dark: "#0a100e" },
  "fanta-1l.webp": { light: "#6a3a18", mid: "#2e1c10", dark: "#120c08" },
  "fanta-1.5l.webp": { light: "#6a3a18", mid: "#2e1c10", dark: "#120c08" },
  "fanta-2.25l.webp": { light: "#6a3a18", mid: "#2e1c10", dark: "#120c08" },
  "sprite-2.25l.webp": { light: "#2a4a38", mid: "#16241c", dark: "#0a100e" },
  "mineral-water-small.webp": {
    light: "#2a3848",
    mid: "#141c28",
    dark: "#080c12",
  },
  "mineral-water-large.webp": {
    light: "#2a3848",
    mid: "#141c28",
    dark: "#080c12",
  },
};

const outs = [
  path.join(__dirname, "..", "website/public/products/cold-drinks"),
  path.join(__dirname, "..", "pos/public/products/cold-drinks"),
  path.join(__dirname, "..", "admin/public/products/cold-drinks"),
];

function sampleCornerAvg(data, w, h) {
  const pts = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
    [Math.floor(w / 2), 2],
    [2, Math.floor(h / 2)],
  ];
  let r = 0,
    g = 0,
    b = 0;
  for (const [x, y] of pts) {
    const i = (y * w + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = pts.length;
  return { r: r / n, g: g / n, b: b / n, lum: (r + g + b) / (3 * n) };
}

/** Make studio white/black backgrounds transparent; keep the bottle/can. */
function cutoutRgba(data, w, h) {
  const bg = sampleCornerAvg(data, w, h);
  const darkBg = bg.lum < 45;
  const out = Buffer.from(data);

  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const lum = (r + g + b) / 3;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc - minc;

    let alpha = 255;
    if (darkBg) {
      // Black studio: remove dark, low-saturation pixels
      if (lum < 28 && sat < 28) alpha = 0;
      else if (lum < 42 && sat < 22) alpha = Math.round(((lum - 28) / 14) * 255);
    } else {
      // White / light studio: remove bright, low-saturation pixels
      if (lum > 242 && sat < 18) alpha = 0;
      else if (lum > 228 && sat < 28)
        alpha = Math.round(((255 - lum) / 27) * 255);
      else if (r > 235 && g > 235 && b > 235 && sat < 12) alpha = 0;
    }
    out[i + 3] = Math.min(out[i + 3], Math.max(0, Math.min(255, alpha)));
  }
  return out;
}

async function makeBackdrop(tint) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="40%" r="68%">
      <stop offset="0%" stop-color="${tint.light}" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="${tint.mid}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${tint.dark}" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect width="100%" height="100%" fill="url(#floor)"/>
  <rect width="100%" height="100%" fill="url(#vignette)"/>
  <!-- subtle warm speckles for texture -->
  <circle cx="120" cy="160" r="2" fill="#ffffff" opacity="0.04"/>
  <circle cx="640" cy="220" r="1.5" fill="#ffffff" opacity="0.05"/>
  <circle cx="200" cy="620" r="2" fill="#ffffff" opacity="0.03"/>
  <circle cx="700" cy="540" r="1.5" fill="#ffffff" opacity="0.04"/>
  <circle cx="420" cy="100" r="1" fill="#ffffff" opacity="0.06"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function makeShadow(width, height) {
  const sw = Math.round(width * 0.72);
  const sh = Math.round(height * 0.12);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}">
  <defs>
    <radialGradient id="s" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="#000000" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${sw / 2}" cy="${sh / 2}" rx="${sw / 2}" ry="${sh / 2}" fill="url(#s)"/>
</svg>`;
  return { buf: await sharp(Buffer.from(svg)).png().toBuffer(), sw, sh };
}

async function styleProduct(srcPath, tint) {
  const meta = await sharp(srcPath).rotate().metadata();
  const prep = await sharp(srcPath)
    .rotate()
    .ensureAlpha()
    .resize(Math.min(meta.width || SIZE, 1400), Math.min(meta.height || SIZE, 1400), {
      fit: "inside",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cut = cutoutRgba(prep.data, prep.info.width, prep.info.height);
  let product = await sharp(cut, {
    raw: {
      width: prep.info.width,
      height: prep.info.height,
      channels: 4,
    },
  })
    .trim({ threshold: 12 })
    .resize(Math.round(SIZE * 0.72), Math.round(SIZE * 0.82), {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const pw = product.info.width;
  const ph = product.info.height;
  const left = Math.round((SIZE - pw) / 2);
  const top = Math.round((SIZE - ph) / 2) - 18;

  const backdrop = await makeBackdrop(tint);
  const shadow = await makeShadow(pw, ph);
  const shadowLeft = Math.round((SIZE - shadow.sw) / 2);
  const shadowTop = Math.min(SIZE - shadow.sh - 24, top + ph - Math.round(shadow.sh * 0.35));

  return sharp(backdrop)
    .composite([
      { input: shadow.buf, left: shadowLeft, top: shadowTop },
      { input: product.data, left: Math.max(0, left), top: Math.max(0, top) },
    ])
    .webp({ quality: 84 })
    .toBuffer();
}

(async () => {
  for (const d of outs) fs.mkdirSync(d, { recursive: true });

  for (const [outName, srcName] of Object.entries(sources)) {
    const src = path.join(assets, srcName);
    if (!fs.existsSync(src)) {
      console.error("MISSING", srcName);
      continue;
    }
    const tint = tints[outName] || tints["regular-drink.webp"];
    const buf = await styleProduct(src, tint);
    for (const d of outs) {
      fs.writeFileSync(path.join(d, outName), buf);
    }
    console.log("wrote", outName, Math.round(buf.length / 1024) + "KB");
  }

  // Keep legacy mineral-water.webp pointing at large (backward compatible)
  for (const d of outs) {
    fs.copyFileSync(
      path.join(d, "mineral-water-large.webp"),
      path.join(d, "mineral-water.webp"),
    );
    fs.copyFileSync(
      path.join(d, "regular-drink.webp"),
      path.join(d, "soft-drink.webp"),
    );
  }
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
