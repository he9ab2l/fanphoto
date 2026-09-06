"""Create a contact sheet of repository demo photos (output is gitignored)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
root = Path(__file__).resolve().parents[1]
photos = sorted((root / "test-photo/scenic").glob("*.jpg"))
sheet = Image.new("RGB", (7 * 180, ((len(photos) + 6) // 7) * 140), "#f5f3ee")
draw = ImageDraw.Draw(sheet)
for index, path in enumerate(photos):
    with Image.open(path) as source:
        image = ImageOps.contain(ImageOps.exif_transpose(source).convert("RGB"), (172, 112))
    x, y = (index % 7) * 180, (index // 7) * 140
    sheet.paste(image, (x + (180 - image.width) // 2, y))
    draw.text((x + 6, y + 116), path.stem, fill="#302c26")
(root / "artifacts").mkdir(exist_ok=True)
sheet.save(root / "artifacts/contact-sheet.jpg", quality=85)
print(root / "artifacts/contact-sheet.jpg")
