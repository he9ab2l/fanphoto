"""Re-encode repository fixtures, never modify originals or invent EXIF/GPS."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
from collections import defaultdict
import json, math, uuid

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts' / 'seed-media'
out.mkdir(parents=True, exist_ok=True)
titles = ['风停在这里', '日光经过', '一小片宁静', '向着远方', '慢慢走', '光的形状', '留白', '沿途', '风景的温度', '时间之外', '山海之间', '某个晴天']
records = []
for index, path in enumerate(sorted((root / 'test-photo/scenic').glob('*.jpg'))):
    photo_id = f'demo-{index + 1:04d}'
    with Image.open(path) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
    image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
    for variant, size in [('original', 2048), ('sm', 400), ('md', 800), ('lg', 1600)]:
        thumb = image.copy()
        thumb.thumbnail((size, size), Image.Resampling.LANCZOS)
        target = out / (f'originals/{photo_id}.webp' if variant == 'original' else f'thumbs/{photo_id}/{variant}.webp')
        target.parent.mkdir(parents=True, exist_ok=True)
        thumb.save(target, 'WEBP', quality=90 if variant == 'original' else 83, method=4)
    sample = image.copy()
    sample.thumbnail((128, 128))
    pixels = list(sample.getdata())
    bins = [0] * 64
    buckets = defaultdict(lambda: [0, 0, 0, 0])
    luminance = []
    for r, g, b in pixels:
        y = .2126 * r + .7152 * g + .0722 * b
        luminance.append(y)
        bins[min(63, int(y / 4))] += 1
        bucket = buckets[(r >> 5, g >> 5, b >> 5)]
        bucket[0] += 1; bucket[1] += r; bucket[2] += g; bucket[3] += b
    colors = ['#' + ''.join(f'{round(c / n):02x}' for c in (r, g, b)) for n, r, g, b in sorted(buckets.values(), reverse=True)[:5]]
    mean = sum(luminance) / len(luminance)
    brightness = mean / 255 * 100
    contrast = min(100, math.sqrt(sum((y - mean) ** 2 for y in luminance) / len(luminance)) / 127.5 * 100)
    records.append({'id': photo_id, 'clientId': str(uuid.uuid5(uuid.NAMESPACE_URL, 'fanphoto-demo/' + path.name)), 'title': f'{titles[index % len(titles)]} · {index + 1:02d}', 'sourceName': path.name, 'width': image.width, 'height': image.height, 'album': min(2, index // 24), 'featured': index in [0, 2, 3, 5, 7, 15, 20, 35], 'tags': [['自然', '远方', '光影'][index % 3]], 'analysis': {'colors': colors, 'histogram': [n / len(pixels) for n in bins], 'brightness': brightness, 'contrast': contrast, 'tone': 'low-key' if brightness < 30 else 'high-key' if brightness > 75 else 'high-contrast' if contrast > 60 else 'balanced'}})
    if (index + 1) % 10 == 0:
        print(f'Prepared {index + 1} photographs', flush=True)
(out / 'manifest.json').write_text(json.dumps(records, ensure_ascii=False), encoding='utf-8')
for size in (192, 512):
    icon = Image.new('RGB', (size, size), '#171e20')
    draw = ImageDraw.Draw(icon)
    scale = size / 64
    for coords in [[24,16,18,16,18,28], [40,16,46,16,46,28], [18,36,18,48,24,48], [46,36,46,48,40,48]]:
        draw.line([round(v * scale) for v in coords], fill='#effbf4', width=round(4 * scale), joint='curve')
    draw.ellipse(tuple(round(v * scale) for v in (24,24,40,40)), outline='#effbf4', width=round(4 * scale))
    icon.save(out / f'icon-{size}.png')
print(f'Prepared {len(records)} photos in {out}', flush=True)
