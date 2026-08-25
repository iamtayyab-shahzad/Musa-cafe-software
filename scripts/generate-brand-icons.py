from PIL import Image
from pathlib import Path

src = Path(
    r"C:\Users\admin\.cursor\projects\c-Users-admin-Desktop-summer-work-krunchies-full-setup\assets\c__Users_admin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ChatGPT_Image_Jul_21__2026__09_01_37_PM-21814488-6584-4317-804f-b1b60c40a2ec.png"
)
root = Path(r"c:\Users\admin\Desktop\summer_work\krunchies-full-setup")
img = Image.open(src).convert("RGBA")


def square_pad(im: Image.Image, size: int, bg=(0, 0, 0, 255)) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    pad = max(1, int(size * 0.06))
    target = size - pad * 2
    copy = im.copy()
    copy.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - copy.width) // 2
    y = (size - copy.height) // 2
    canvas.paste(copy, (x, y), copy)
    return canvas


# Full logos
for dest in [
    root / "website" / "public" / "logo.png",
    root / "pos" / "public" / "logo.png",
]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, format="PNG", optimize=True)
    print("logo", dest)

admin_public = root / "admin" / "public"
if admin_public.exists():
    img.save(admin_public / "logo.png", format="PNG", optimize=True)
    print("logo", admin_public / "logo.png")

png_targets = [
    (root / "website" / "public" / "icons" / "icon-32.png", 32),
    (root / "website" / "public" / "icons" / "icon-192.png", 192),
    (root / "website" / "public" / "icons" / "icon-512.png", 512),
    (root / "website" / "public" / "apple-touch-icon.png", 180),
    (root / "pos" / "public" / "icons" / "icon-192.png", 192),
    (root / "pos" / "public" / "icons" / "icon-512.png", 512),
]

for path, size in png_targets:
    path.parent.mkdir(parents=True, exist_ok=True)
    square_pad(img, size).save(path, format="PNG", optimize=True)
    print("png", path, size)

# Multi-size ICOs
for ico_path in [
    root / "website" / "public" / "favicon.ico",
    root / "pos" / "public" / "favicon.ico",
]:
    sizes = [16, 32, 48]
    icons = [square_pad(img, s) for s in sizes]
    icons[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=icons[1:],
    )
    print("ico", ico_path)

if admin_public.exists():
    sizes = [16, 32, 48]
    icons = [square_pad(img, s) for s in sizes]
    ico_path = admin_public / "favicon.ico"
    icons[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=icons[1:],
    )
    print("ico", ico_path)

print("done")
