"""Pick a ratio-diverse, high-resolution subset of gallery-dl downloads.

Scans artifacts/gdl-flickr-* for images and copies the selected files into
test-photo/scenic as photo-001.jpg ... photo-100.jpg, ready for
tools/prepare-demo.py.
"""

from pathlib import Path
from PIL import Image
import collections
import shutil

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[1]
SOURCES = [ROOT / "artifacts" / "gdl-flickr-batch", ROOT / "artifacts" / "gdl-flickr-portrait"]
OUT = ROOT / "test-photo" / "scenic"
TARGET = 100
QUOTAS = {
    "portrait": 22,
    "square": 12,
    "landscape": 40,
    "wide": 26,
}
MIN_SIDE = 800
MIN_LONG = 1400
MIN_BYTES = 80_000


def bucket(ratio: float) -> str:
    if ratio < 0.82:
        return "portrait"
    if ratio <= 1.25:
        return "square"
    if ratio <= 1.9:
        return "landscape"
    return "wide"


def main() -> None:
    candidates: dict[str, list[tuple[Path, int, int, float]]] = collections.defaultdict(list)
    for folder in SOURCES:
        for path in folder.glob("*"):
            try:
                with Image.open(path) as image:
                    width, height = image.size
            except Exception:
                continue
            ratio = width / height
            if (
                min(width, height) < MIN_SIDE
                or max(width, height) < MIN_LONG
                or path.stat().st_size < MIN_BYTES
            ):
                continue
            candidates[bucket(ratio)].append((path, width, height, ratio))

    for pool in candidates.values():
        pool.sort(key=lambda item: item[1] * item[2], reverse=True)

    chosen: dict[str, list[tuple[Path, int, int, float]]] = collections.defaultdict(list)
    for name in ("portrait", "square", "landscape", "wide"):
        chosen[name] = candidates[name][: QUOTAS[name]]

    if sum(len(pool) for pool in chosen.values()) < TARGET:
        # Top up from whatever remains, highest resolution first.
        seen = {path for pool in chosen.values() for path, _, _, _ in pool}
        rest = sorted(
            (item for folder in SOURCES for item in candidates.values() if False),
            key=lambda item: item[1] * item[2],
            reverse=True,
        )
        # rest is intentionally empty; fall back to scanning again below.
        del rest
        rest = []
        for folder in SOURCES:
            for path in folder.glob("*"):
                try:
                    with Image.open(path) as image:
                        width, height = image.size
                except Exception:
                    continue
                if path in seen or min(width, height) < MIN_SIDE:
                    continue
                rest.append((path, width, height, width / height))
        rest.sort(key=lambda item: item[1] * item[2], reverse=True)
        for item in rest:
            if sum(len(pool) for pool in chosen.values()) >= TARGET:
                break
            chosen[bucket(item[3])].append(item)

    order = []
    names = ("portrait", "square", "landscape", "wide")
    cursor = 0
    while len(order) < TARGET:
        advanced = False
        for name in names:
            pool = chosen[name]
            if cursor < len(pool):
                order.append(pool[cursor])
                advanced = True
        if not advanced:
            break
        cursor += 1
    order = order[:TARGET]

    OUT.mkdir(parents=True, exist_ok=True)
    for index, (path, width, height, ratio) in enumerate(order, 1):
        shutil.copy2(path, OUT / f"photo-{index:03d}.jpg")

    counts = collections.Counter(bucket(ratio) for _, _, _, ratio in order)
    print(f"Copied {len(order)} photos to {OUT}")
    print("Buckets:", dict(counts))
    dimensions = [(width, height) for _, width, height, _ in order]
    print(
        "Size range:",
        f"{min(w for w, _ in dimensions)}x{min(h for _, h in dimensions)}",
        "to",
        f"{max(w for w, _ in dimensions)}x{max(h for _, h in dimensions)}",
    )


if __name__ == "__main__":
    main()
