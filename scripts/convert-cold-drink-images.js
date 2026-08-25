const fs = require("fs");
const path = require("path");
const sharp = require(require("path").join(
  __dirname,
  "..",
  "website",
  "node_modules",
  "sharp",
));

const assets =
  "C:/Users/admin/.cursor/projects/c-Users-admin-Desktop-summer-work-krunchies-full-setup/assets";

const files = {
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
  "mineral-water.webp":
    "c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_mineralwater-4b8b8bdb-84ef-4ab5-b4fa-0780e5b67976.png",
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
};

const outs = [
  path.join(__dirname, "..", "website/public/products/cold-drinks"),
  path.join(__dirname, "..", "pos/public/products/cold-drinks"),
  path.join(__dirname, "..", "admin/public/products/cold-drinks"),
];
for (const d of outs) fs.mkdirSync(d, { recursive: true });

(async () => {
  for (const [outName, srcName] of Object.entries(files)) {
    const src = path.join(assets, srcName);
    if (!fs.existsSync(src)) {
      console.error("MISSING", srcName);
      continue;
    }
    const buf = await sharp(src)
      .rotate()
      .resize(800, 800, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .webp({ quality: 82 })
      .toBuffer();
    for (const d of outs) {
      fs.writeFileSync(path.join(d, outName), buf);
    }
    console.log("wrote", outName, buf.length);
  }
  for (const d of outs) {
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
