"""Select ratio-diverse, high-resolution landscape photo URLs from Wikimedia Commons.

Writes one direct image URL per line, intended as gallery-dl input:
    gallery-dl --input-file artifacts/commons-urls.txt -D test-photo/scenic
"""

from collections import defaultdict
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
import random

API = "https://commons.wikimedia.org/w/api.php"
CATEGORY = "Category:Quality images of landscapes"
TARGET = 100
THUMB_WIDTH = 2400
OUT = Path(__file__).resolve().parents[1] / "artifacts" / "commons-urls.txt"
ALLOWED_MIME = ("image/jpeg", "image/png", "image/webp")
QUOTAS = {
    "portrait": 20,  # taller than wide
    "square": 16,    # roughly square
    "landscape": 34, # classic 3:2-ish
    "wide": 30,      # panorama
}


def api(params: dict) -> dict:
    params.update({"format": "json", "action": "query"})
    request = Request(
        API + "?" + urlencode(params),
        headers={"User-Agent": "FanphotoDemo/1.0 (test image downloader; python-urllib)"},
    )
    with urlopen(request) as response:
        return json.load(response)


def fetch_images() -> list[dict]:
    images = []
    continuation: dict = {}
    while True:
        params = {
            "generator": "categorymembers",
            "gcmtitle": CATEGORY,
            "gcmtype": "file",
            "gcmlimit": "200",
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "iiurlwidth": str(THUMB_WIDTH),
        }
        params.update(continuation)
        data = api(params)
        for page in data.get("query", {}).get("pages", {}).values():
            info = page.get("imageinfo", [{}])[0]
            if info.get("mime", "").lower() in ALLOWED_MIME:
                images.append(info)
        if "continue" not in data:
            break
        continuation = data["continue"]
    return images


def bucket(ratio: float) -> str:
    if ratio < 0.82:
        return "portrait"
    if ratio <= 1.25:
        return "square"
    if ratio <= 1.9:
        return "landscape"
    return "wide"


def main() -> None:
    images = fetch_images()
    candidates: dict[str, list[dict]] = defaultdict(list)
    for info in images:
        width = info.get("width") or 0
        height = info.get("height") or 0
        if min(width, height) < 800 or max(width, height) < 1600:
            continue
        candidates[bucket(width / height)].append(info)

    randomizer = random.Random(20260906)
    chosen: list[dict] = []
    for name in ("portrait", "square", "landscape", "wide"):
        pool = candidates[name]
        randomizer.shuffle(pool)
        chosen.extend(pool[: QUOTAS[name]])

    # Fill any shortfall from whatever remains, still prioritizing real photos.
    if len(chosen) < TARGET:
        seen = {id(info) for info in chosen}
        rest = [info for info in images if id(info) not in seen]
        rest.sort(
            key=lambda info: (info.get("width") or 0) * (info.get("height") or 0),
            reverse=True,
        )
        for info in rest:
            if len(chosen) >= TARGET:
                break
            width = info.get("width") or 0
            height = info.get("height") or 0
            if min(width, height) < 800:
                continue
            chosen.append(info)

    chosen = chosen[:TARGET]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as handle:
        for info in chosen:
            handle.write((info.get("thumburl") or info["url"]) + "\n")

    counts = defaultdict(int)
    for info in chosen:
        width = info.get("width") or 0
        height = info.get("height") or 0
        counts[bucket(width / height)] += 1
    print(f"Wrote {len(chosen)} URLs to {OUT}")
    print("Buckets:", dict(counts))
    dimensions = [(info.get("width") or 0, info.get("height") or 0) for info in chosen]
    print(
        "Size range:",
        f"{min(w for w, _ in dimensions)}x{min(h for _, h in dimensions)}",
        "to",
        f"{max(w for w, _ in dimensions)}x{max(h for _, h in dimensions)}",
    )


if __name__ == "__main__":
    main()
