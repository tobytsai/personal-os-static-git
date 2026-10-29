#!/usr/bin/env python3
"""Build a verified-by-source Song Feng Ge frame-image catalog for GitHub Pages.

Inputs: original 374-position frame catalog, public product links from the Google
Sheets snapshot, and a small built-in starter map of previously confirmed images.
Output: static JS dataset with images from official Song Feng Ge pages only.

This is a build-time process, not a browser CORS scraper. It never guesses image
filenames from model numbers. If the provider is unavailable, the existing
photos.js input remains a safe fallback.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
from html import unescape
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json
import re
import sys
import time
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
SHEET_JS = DATA / "songfeng-sheet-prices.js"
CATALOG_JS = DATA / "songfeng-frames.js"
PHOTO_JS = DATA / "songfeng-photos.js"
STATUS_JSON = DATA / "songfeng-photo-status.json"

BASE = "https://sfg218.com/admin/goods_pic/"
SIMULATION_URLS = [
    "https://sfg218.com/simulation.php?class=tout&no=158",
    "https://sfg218.com/simulation.php?Clear=Clear&winshow=no&df_pic=yes",
]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.6",
}
IMAGE_RE = re.compile(
    r"(?:https?://(?:www\.)?sfg218\.com)?/?admin/goods_pic/"
    r"(?P<file>[A-Za-z0-9_-]{8,}\.(?:jpe?g|png|webp))",
    re.IGNORECASE,
)
THUMB_RE = re.compile(
    r"(?:https?://(?:www\.)?sfg218\.com)?/?admin/goods_pic/"
    r"(?P<file>[A-Za-z0-9_-]{8,}_s\.(?:jpe?g|png|webp))",
    re.IGNORECASE,
)

def extract_js_value(file: Path, var: str):
    text = file.read_text(encoding="utf-8")
    match = re.search(r"window\." + re.escape(var) + r"=([^\n]+);", text)
    if not match:
        raise ValueError("Missing JS array: " + var)
    return json.loads(match.group(1))

def normalize(text):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(text))).lower()

def official_url(url):
    p = urlparse(str(url or ""))
    return p.scheme == "https" and p.hostname in ("sfg218.com", "www.sfg218.com") and p.path == "/frame_info.php"

def picture_from_path(path):
    match = IMAGE_RE.search(unescape(str(path or "")))
    if not match:
        return None
    file = match.group("file")
    full = re.sub(r"_s(\.(?:jpe?g|png|webp))$", r"\1", file, flags=re.I)
    thumb = re.sub(r"(\.(?:jpe?g|png|webp))$", r"_s\1", full, flags=re.I)
    return {"full": BASE + full, "thumb": BASE + thumb}

def fetch_html(url, timeout=7):
    request = Request(url, headers=HEADERS, method="GET")
    with urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type and "text/plain" not in content_type:
            return None
        raw = response.read(1_700_000)
    for encoding in ("utf-8", "big5", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeError:
            pass
    return raw.decode("utf-8", errors="replace")

def from_detail(args):
    index, url = args
    try:
        html = fetch_html(url)
        if not html:
            return index, None, "empty"
        photo = picture_from_path(html)
        if not photo:
            return index, None, "no-image"
        return index, {**photo, "source": "product"}, None
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        return index, None, type(exc).__name__

def from_simulation(html, frames):
    """Bind each thumbnail to the frame label in its smallest HTML container.

    Never assign by image position alone: the site's ordering can change,
    including duplicate model names and optional materials between groups.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return {}, {"reason": "beautifulsoup4-not-installed"}
    soup = BeautifulSoup(html, "html.parser")
    names = defaultdict(list)
    for index, frame in enumerate(frames):
        names[normalize(frame["name"])].append(index)
    found = {}
    inspected = 0
    image_count = 0
    for img in soup.find_all("img"):
        img_url = img.get("src", "")
        photo = picture_from_path(img_url)
        if not photo:
            # some templates wrap the image in an anchor to the original JPEG
            parent = img.find_parent("a")
            photo = picture_from_path(parent.get("href", "")) if parent else None
        if not photo:
            continue
        image_count += 1
        inspected += 1
        candidate = None
        for parent in list(img.parents)[:6]:
            text = normalize(parent.get_text(" ", strip=True))
            if not text or len(text) > 180:
                continue
            matches = [key for key in names if len(key) >= 4 and key in text and len(names[key]) == 1]
            if matches:
                matches.sort(key=len, reverse=True)
                if len(matches) == 1 or len(matches[0]) > len(matches[1]):
                    candidate = names[matches[0]][0]
                    break
        if candidate is not None and candidate not in found:
            found[candidate] = {**photo, "source": "simulation"}
    return found, {"found": len(found), "images": image_count, "inspected": inspected}

def main():
    records = extract_js_value(SHEET_JS, "SFG_SHEET_FRAME_PRICES")
    frames = extract_js_value(CATALOG_JS, "SFG_CATALOG_ITEMS")
    photos = extract_js_value(PHOTO_JS, "SFG_OFFICIAL_FRAME_PHOTOS")
    if len(records) != 374 or len(frames) != len(records) or len(photos) != 374:
        raise ValueError("374-frame catalog alignment failed")
    for i, (r, f) in enumerate(zip(records, frames)):
        if r["name"] != f["name"]:
            raise ValueError(f"Different frame at position {i}: {r['name']} / {f['name']}")
    before = sum(bool(p) for p in photos)
    simulated = {}
    simulation_details = []
    for url in SIMULATION_URLS:
        try:
            html = fetch_html(url, timeout=9)
            if not html:
                continue
            matches, diag = from_simulation(html, frames)
            simulation_details.append({"url": url, **diag})
            simulated.update(matches)
            if len(simulated) >= 260:
                break
        except (HTTPError, URLError, OSError, TimeoutError, ValueError) as exc:
            simulation_details.append({"url": url, "error": type(exc).__name__})
    for index, photo in simulated.items():
        if not photos[index]:
            photos[index] = photo
    print("Song Feng Ge: existing", before, "simulation-mapped", len(simulated), "total", sum(bool(x) for x in photos), flush=True)

    # Collect missing images directly from each unique, source-mapped product page.
    # Keep concurrency moderate to respect the provider's infrastructure.
    pending = [
        (i, r["url"])
        for i, r in enumerate(records)
        if photos[i] is None and official_url(r.get("url"))
    ]
    errors = defaultdict(int)
    detail_success = 0
    if pending:
        # Probe a few URLs first: if the source blocks CI, do not send hundreds
        # of requests that cannot help.
        probes = pending[:3]
        successful_probe = False
        for index, url in probes:
            j, photo, err = from_detail((index, url))
            if photo:
                photos[j] = photo
                successful_probe = True
                detail_success += 1
            else:
                errors[err or "unknown"] += 1
        if successful_probe:
            rest = pending[3:]
            with ThreadPoolExecutor(max_workers=7) as pool:
                futs = [pool.submit(from_detail, item) for item in rest]
                for f in as_completed(futs):
                    j, photo, err = f.result()
                    if photo:
                        photos[j] = photo
                        detail_success += 1
                    else:
                        errors[err or "unknown"] += 1
            print("Song Feng Ge: direct product images", detail_success, "errors", dict(errors), flush=True)
        else:
            print("Song Feng Ge: product pages unreachable from runner; using trustworthy starter/simulation photos", flush=True)

    # Accept only a fixed class of official URLs from known photo directories.
    for i, photo in enumerate(photos):
        if photo and (not photo.get("full", "").startswith(BASE)
                      or not photo.get("thumb", "").startswith(BASE)):
            photos[i] = None
    total = sum(bool(x) for x in photos)
    meta = {
        "total": len(photos), "count": total, "fallback": len(photos) - total,
        "method": "official-product-pages-and-simulation",
        "simulations": simulation_details,
        "source": "松風閣官網公開相框照片",
    }
    js = (
        "/* 松風閣官網框型圖片（只含與商品相符且來自官網的圖片） */\n"
        "window.SFG_OFFICIAL_PHOTO_META=" + json.dumps({k: v for k, v in meta.items() if k != "simulations"}, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.SFG_OFFICIAL_FRAME_PHOTOS=" + json.dumps(photos, ensure_ascii=False, separators=(",", ":")) + ";\n"
    )
    PHOTO_JS.write_text(js, encoding="utf-8")
    STATUS_JSON.write_text(json.dumps({**meta, "errors": dict(errors), "direct_success": detail_success}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Song Feng Ge: {total}/{len(photos)} official photos available for GitHub Pages", flush=True)

if __name__ == "__main__":
    main()
