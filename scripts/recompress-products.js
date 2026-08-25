const sharp = require("../.sharp-tmp/node_modules/sharp");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join("website", "public", "products");
let before = 0;
let after = 0;
let n = 0;

async function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(p);
      continue;
    }
    if (!/\.webp$/i.test(ent.name)) continue;
    const buf = fs.readFileSync(p);
    before += buf.length;
    const out = await sharp(buf)
      .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72, effort: 4 })
      .toBuffer();
    if (out.length < buf.length * 0.98) {
      fs.writeFileSync(p, out);
      after += out.length;
      n += 1;
    } else {
      after += buf.length;
    }
  }
}

(async () => {
  await walk(root);
  console.log("recompressed", n, "files");
  console.log("before_kb", Math.round(before / 1024), "after_kb", Math.round(after / 1024));
  for (const dest of ["admin", "pos"]) {
    execSync(
      `robocopy "website\\public\\products" "${dest}\\public\\products" /MIR /NFL /NDL /NJH /NJS /nc /ns /np`,
      { stdio: "inherit" },
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
