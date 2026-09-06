"""Write a small local MingCute subset used by the web bundle."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "apps"
    / "web"
    / "node_modules"
    / "@iconify-json"
    / "mingcute"
    / "icons.json"
)
OUT = ROOT / "apps" / "web" / "src" / "lib" / "mingcute-subset.json"
USED = [
    "grid-2-line",
    "photo-album-line",
    "map-line",
    "information-line",
    "search-2-line",
    "settings-4-line",
    "user-2-line",
    "zoom-in-line",
    "zoom-out-line",
    "refresh-2-line",
    "flashlight-line",
    "layout-grid-line",
    "close-line",
    "arrow-left-line",
    "arrow-right-line",
    "pause-line",
    "play-line",
    "fullscreen-line",
    "share-forward-line",
    "download-2-line",
    "map-pin-line",
    "plus-line",
]

data = json.loads(SOURCE.read_text(encoding="utf-8"))
subset = {
    "prefix": data["prefix"],
    "width": data["width"],
    "height": data["height"],
    "icons": {name: data["icons"][name] for name in USED if name in data["icons"]},
}
OUT.write_text(json.dumps(subset, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Wrote {len(subset['icons'])} icons to {OUT}")
