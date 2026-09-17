#!/usr/bin/env python3
"""Generate optimized brand assets for PYC SmartSMS from the official club logo."""
from PIL import Image, ImageDraw, ImageOps
import os, shutil

SRC = '/home/z/my-project/upload/Logo - Copy.jpeg'
PUB = '/home/z/my-project/public'
DL = '/home/z/my-project/download'
os.makedirs(PUB, exist_ok=True)
os.makedirs(DL, exist_ok=True)

BRAND_BLUE = (20, 37, 127)  # #14257F sampled from the official logo background

im = Image.open(SRC).convert('RGB')
w, h = im.size
print(f'source: {w}x{h}')

def pad_to_square(img, size=None):
    """Place logo on a seamless brand-blue square canvas."""
    s = size or max(img.size)
    canvas = Image.new('RGB', (s, s), BRAND_BLUE)
    # scale logo to fit within 92% of canvas, keep aspect
    inner = int(s * 0.92)
    ratio = min(inner / img.width, inner / img.height)
    nw, nh = int(img.width * ratio), int(img.height * ratio)
    resized = img.resize((nw, nh), Image.LANCZOS)
    canvas.paste(resized, ((s - nw) // 2, (s - nh) // 2))
    return canvas

# 1. Full logo (aspect preserved, PNG optimized) — for login/brand panels
im.save(f'{PUB}/logo.png', optimize=True)

# 2. Square icon (seamless brand-blue padding) — sidebar, splash, headers
icon_src = pad_to_square(im, 560)
icon_src.save(f'{PUB}/logo-icon.png', optimize=True)

# 3. Rounded-corner app icon (192 + 512) — PWA-style
def rounded(img, size, radius_ratio=0.22):
    img = img.resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

rounded(icon_src, 512).save(f'{PUB}/icon-512.png', optimize=True)
rounded(icon_src, 192).save(f'{PUB}/icon-192.png', optimize=True)

# 4. Apple touch icon (180, solid bg, slight rounding)
rounded(icon_src, 180, 0.18).save(f'{PUB}/apple-touch-icon.png', optimize=True)

# 5. favicon.ico (multi-size)
icon_src.resize((64, 64), Image.LANCZOS).save(
    f'{PUB}/favicon.ico', format='ICO',
    sizes=[(16, 16), (32, 32), (48, 48)], optimize=True)

# 6. Copy originals for user download
shutil.copy(SRC, f'{DL}/PYC-Club-official-logo.png')
icon_src.resize((512, 512), Image.LANCZOS).save(f'{DL}/PYC-SmartSMS-app-icon.png', optimize=True)

for f in sorted(os.listdir(PUB)):
    p = os.path.join(PUB, f)
    print(f'{f}: {os.path.getsize(p)//1024} KB')
