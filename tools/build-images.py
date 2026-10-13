#!/usr/bin/env python3
"""Render the PWA icons and the social preview card with Pillow.

Usage: python3 tools/build-images.py   (run from the repo root)
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ACCENT = (212, 165, 116)
INK = (26, 26, 26)
BG = (20, 20, 20)
TILE = (244, 236, 216)
SERIF_BI = '/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf'
SERIF_I = '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf'
SERIF = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
SANS = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'


def icon(size, maskable=False):
    scale = 4  # supersample for smooth edges
    S = size * scale
    img = Image.new('RGBA', (S, S), ACCENT + (255,) if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not maskable:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.16), fill=ACCENT)
    # Maskable icons keep the glyph inside the central 80% safe zone.
    font = ImageFont.truetype(SERIF_BI, int(S * (0.56 if maskable else 0.66)))
    d.text((S / 2, S * 0.53), 'T', font=font, fill=INK, anchor='mm')
    return img.resize((size, size), Image.LANCZOS)


def tile(d, x, y, word, font, pad=22, h=72):
    w = d.textlength(word, font=font) + pad * 2
    d.rounded_rectangle([x, y, x + w, y + h], radius=5, fill=TILE)
    d.text((x + w / 2, y + h / 2 + 2), word, font=font, fill=INK, anchor='mm')
    return w


def og_image():
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 36):
        d.line([(x, 0), (x, H)], fill=(30, 30, 30))
    for y in range(0, H, 36):
        d.line([(0, y), (W, y)], fill=(30, 30, 30))

    # Soft shadows under the tiles
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    word_font = ImageFont.truetype(SERIF, 44)
    rows = [(['every', 'word', 'a', 'tile'], 300), (['every', 'poem', 'a', 'mosaic'], 392)]
    boxes = []
    for words, y in rows:
        x = 90
        for w in words:
            width = d.textlength(w, font=word_font) + 44
            boxes.append((x, y, w))
            sd.rounded_rectangle([x + 2, y + 8, x + width + 2, y + 80], radius=6, fill=(0, 0, 0, 170))
            x += width + 16
    img.paste(shadow.filter(ImageFilter.GaussianBlur(8)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(img)
    for x, y, w in boxes:
        tile(d, x, y, w, word_font)

    d.text((90, 120), 'Tessera', font=ImageFont.truetype(SERIF_I, 112), fill=ACCENT, anchor='ls')
    d.text((92, 190), 'Break any text into word tiles. Rearrange them into poetry.',
           font=ImageFont.truetype(SANS, 30), fill=(200, 200, 200), anchor='ls')
    d.rectangle([90, 540, 138, 544], fill=ACCENT)
    d.text((90, 585), 'Live syllables, rhyme and 100+ poetic forms  ·  free, in your browser',
           font=ImageFont.truetype(SANS, 24), fill=(150, 150, 150), anchor='ls')
    return img


if __name__ == '__main__':
    icon(192).save('icons/icon-192.png', optimize=True)
    icon(512).save('icons/icon-512.png', optimize=True)
    icon(512, maskable=True).save('icons/icon-maskable-512.png', optimize=True)
    og_image().save('og-image.png', optimize=True)
    print('wrote icons/*.png and og-image.png')
