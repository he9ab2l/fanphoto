"""Deterministic synthetic fixtures for browser tests. No personal photographs.

Dependencies: pillow, piexif (pip install pillow piexif)
"""
from pathlib import Path
from PIL import Image, ImageDraw
import piexif

root = Path(__file__).resolve().parents[1]
out = root / 'tests/fixtures'
out.mkdir(parents=True, exist_ok=True)

image = Image.new('RGB', (480, 320))
draw = ImageDraw.Draw(image)
for y in range(320):
    draw.line((0, y, 480, y), fill=(30 + y // 3, 80 + y // 3, 160 - y // 4))
draw.rectangle((90, 80, 210, 230), fill='#dfb875')
draw.ellipse((250, 60, 390, 200), fill='#d8e8da')

# Standard IFD layout: Make/Model in IFD0; camera tags in the Exif sub-IFD.
exif = {
    '0th': {0x010F: b'Test Fixture', 0x0110: b'Browser Camera', 0x0131: b'fixture-maker 1.0'},
    'Exif': {
        0x9000: b'0230',
        0x8827: 200,              # ISOSpeedRatings
        0x829A: (1, 125),         # ExposureTime
        0x829D: (28, 10),         # FNumber = 2.8
        0x920A: (50, 1),          # FocalLength
        0x9003: b'2020:01:02 12:34:56',  # DateTimeOriginal
        0xA002: 480,
        0xA003: 320,
    },
    'GPS': {},
    '1st': {},
    'thumbnail': None,
}
image.save(out / 'camera.jpg', quality=90, exif=piexif.dump(exif))
image.save(out / 'sample.tiff', compression='tiff_lzw')
alpha = image.convert('RGBA')
alpha.putalpha(Image.new('L', image.size, 180))
alpha.save(out / 'alpha.png')
print('Created synthetic JPEG (standard EXIF), TIFF and transparent PNG fixtures.')
