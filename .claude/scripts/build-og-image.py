"""Build the 1200x630 social card from the portrait + tagline.

One-shot generator. Output: assets/og-image.jpg
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets", "rabbi-goldstein.jpg")
OUT = os.path.join(ROOT, "assets", "og-image.jpg")

W, H = 1200, 630

# Palette (matches css/styles.css)
SAND = (241, 229, 207)
SAND_LIGHT = (245, 235, 217)
SAND_DEEP = (231, 216, 184)
INK = (26, 22, 20)
INK_SOFT = (63, 53, 48)
INK_MUTED = (107, 95, 85)
TERRACOTTA = (184, 92, 31)
GOLD = (169, 138, 75)

# Canvas: warm sand background
card = Image.new("RGB", (W, H), SAND_LIGHT)
draw = ImageDraw.Draw(card)

# Subtle vertical gradient on background (sand-light -> sand)
for y in range(H):
    t = y / H
    r = int(SAND_LIGHT[0] * (1 - t) + SAND[0] * t)
    g = int(SAND_LIGHT[1] * (1 - t) + SAND[1] * t)
    b = int(SAND_LIGHT[2] * (1 - t) + SAND[2] * t)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Portrait panel: left half, full bleed
portrait_w = 500
portrait = Image.open(SRC).convert("RGB")
# Crop the portrait to a tall ratio that keeps the face
pw, ph = portrait.size
target_ratio = portrait_w / H  # ~0.794
src_ratio = pw / ph
if src_ratio > target_ratio:
    # too wide — crop sides
    new_w = int(ph * target_ratio)
    left = (pw - new_w) // 2
    portrait = portrait.crop((left, 0, left + new_w, ph))
else:
    # too tall — crop bottom (keep face area at top)
    new_h = int(pw / target_ratio)
    # bias toward top so face stays in frame
    top = int((ph - new_h) * 0.15)
    portrait = portrait.crop((0, top, pw, top + new_h))
portrait = portrait.resize((portrait_w, H), Image.LANCZOS)
card.paste(portrait, (0, 0))

# Terracotta vertical accent stripe between portrait and copy
stripe_x = portrait_w
stripe_w = 8
draw.rectangle([stripe_x, 0, stripe_x + stripe_w, H], fill=TERRACOTTA)

# Soft sand panel shadow to the right of the portrait
shadow = Image.new("RGBA", (40, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
for x in range(40):
    a = int(40 * (1 - x / 40))
    sd.line([(x, 0), (x, H)], fill=(0, 0, 0, a))
card.paste(shadow, (stripe_x + stripe_w, 0), shadow)

# Right-side copy area
text_x = portrait_w + 60
text_w = W - text_x - 60


def load_font(candidates, size):
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


WIN_FONTS = "C:/Windows/Fonts"
serif_bold = load_font([
    f"{WIN_FONTS}/georgiab.ttf",
    f"{WIN_FONTS}/timesbd.ttf",
], 64)
serif_reg = load_font([
    f"{WIN_FONTS}/georgia.ttf",
    f"{WIN_FONTS}/times.ttf",
], 28)
sans_caps = load_font([
    f"{WIN_FONTS}/segoeuib.ttf",
    f"{WIN_FONTS}/arialbd.ttf",
], 18)
sans_small = load_font([
    f"{WIN_FONTS}/segoeui.ttf",
    f"{WIN_FONTS}/arial.ttf",
], 22)

# Eyebrow (small caps, terracotta)
eyebrow = "TORAH-BASED COACHING  ·  CLEVELAND, OH"
# Letter-spacing approximation
spaced = "  ".join(list(eyebrow))  # too aggressive; use simple spacing instead
draw.text((text_x, 110), eyebrow, font=sans_caps, fill=TERRACOTTA)

# Gold rule under eyebrow
draw.rectangle([text_x, 145, text_x + 60, 148], fill=GOLD)

# Headline: name
draw.text((text_x, 175), "Rabbi Shmuel", font=serif_bold, fill=INK)
draw.text((text_x, 245), "Goldstein", font=serif_bold, fill=INK)

# Tagline (serif regular, ink-soft) — wrap manually
tagline_lines = [
    "Honest conversation, practical tools,",
    "and Torah-rooted guidance.",
]
ty = 345
for line in tagline_lines:
    draw.text((text_x, ty), line, font=serif_reg, fill=INK_SOFT)
    ty += 40

# Footer URL
draw.text((text_x, H - 80), "shmuelgoldstein.com", font=sans_small, fill=INK_MUTED)

# Save as high-quality JPEG
card.save(OUT, "JPEG", quality=88, optimize=True, progressive=True)
print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
