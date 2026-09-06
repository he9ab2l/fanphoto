"""Deterministic synthetic images for browser tests. No personal photographs."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
out = root / 'tests/fixtures'
out.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (480, 320))
draw = ImageDraw.Draw(image)
for y in range(320):
    draw.line((0, y, 480, y), fill=(30 + y // 3, 80 + y // 3, 160 - y // 4))
draw.rectangle((90, 80, 210, 230), fill='#dfb875')
draw.ellipse((250, 60, 390, 200), fill='#d8e8da')
exif = Image.Exif()
exif[271] = 'Test Fixture'
exif[272] = 'Browser Camera'
exif[36867] = '2020:01:02 12:00:00'
exif[34855] = 200
exif[33437] = 2.8
exif[37386] = 35.0
image.save(out / 'camera.jpg', quality=88, exif=exif)
image.save(out / 'sample.tiff', compression='tiff_lzw')
alpha = image.convert('RGBA')
alpha.putalpha(Image.new('L', image.size, 180))
alpha.save(out / 'alpha.png')
print('Created synthetic JPEG (EXIF), TIFF and transparent PNG fixtures.')
