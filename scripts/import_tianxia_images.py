#!/usr/bin/env python3
"""Persist 天下畫博 Airtable image previews for the user-owned oil painting launcher.

Includes supplemental photos beyond 12 per record and refreshed retry URLs.

Source: temporary preview URLs already recorded in the imported catalog.
Output: public/images/oil/tianxia/*.webp and a detailed import report.
The original Airtable base is never modified.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
import json
import re
import requests
from PIL import Image, ImageOps, UnidentifiedImageError

CATALOG_DIR = Path("public/data/oil/tianxia")
OUTPUT_DIR = Path("public/images/oil/tianxia")
REPORT = Path("public/data/oil/tianxia-image-report.json")
PREFIX = "../../images/oil/tianxia/"
ALLOWED = {"v5.airtableusercontent.com", "airtableusercontent.com", "dl.airtable.com"}
MAX_BYTES = 15_000_000
Image.MAX_IMAGE_PIXELS = 40_000_000

def allowed_url(value):
    try:
        u = urlsplit(value)
        return u.scheme == "https" and u.hostname in ALLOWED
    except (TypeError, ValueError):
        return False

def convert(url):
    if not allowed_url(url):
        raise ValueError("Unsupported attachment host")
    with requests.get(url, timeout=(12, 45), stream=True, allow_redirects=False) as r:
        r.raise_for_status()
        if r.is_redirect:
            raise ValueError("Unexpected redirect")
        data = bytearray()
        for chunk in r.iter_content(chunk_size=65536):
            data.extend(chunk)
            if len(data) > MAX_BYTES:
                raise ValueError("Attachment exceeded 15MB")
    with Image.open(BytesIO(data)) as original:
        image = ImageOps.exif_transpose(original)
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        if image.mode != "RGB":
            if image.mode in ("RGBA", "LA") or "transparency" in image.info:
                rgba = image.convert("RGBA")
                white = Image.new("RGB", rgba.size, "white")
                white.paste(rgba, mask=rgba.getchannel("A"))
                image = white
            else:
                image = image.convert("RGB")
        dest = BytesIO()
        image.save(dest, "WEBP", quality=79, method=3)
        if dest.tell() < 350:
            raise ValueError("Converted image appears empty")
        return dest.getvalue()

def download(payload):
    rid, number, url = payload
    filename = f"{rid}-{number:02d}.webp"
    target = OUTPUT_DIR / filename
    stable = PREFIX + filename
    if target.exists() and target.stat().st_size > 350:
        return (rid, number, stable, "cached", "")
    if not allowed_url(url):
        return (rid, number, None, "failed", "SourceNoLongerAvailable")
    for attempt in range(2):
        try:
            content = convert(url)
            target.write_bytes(content)
            return (rid, number, stable, "downloaded", "")
        except (requests.RequestException, OSError, ValueError, UnidentifiedImageError) as exc:
            error = type(exc).__name__
    return (rid, number, None, "failed", error)

def main():
    chunks = sorted(CATALOG_DIR.glob("chunk-*.json"))
    if not chunks:
        raise SystemExit("No oil catalog chunks found")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records = {}
    jobs = []
    files = {}
    for file in chunks:
        doc = json.loads(file.read_text(encoding="utf-8"))
        files[file] = doc
        for item in doc.get("items", []):
            rid = item["id"]
            if not re.fullmatch(r"rec[A-Za-z0-9]{14}", rid):
                raise ValueError("Invalid Airtable record ID in catalog")
            records[rid] = item
            for n, photo in enumerate(item.get("images", []), start=1):
                url = photo.get("url", "")
                if url.startswith(PREFIX) and (OUTPUT_DIR / f"{rid}-{n:02d}.webp").exists():
                    continue
                jobs.append((rid, n, url))
    output = []
    with ThreadPoolExecutor(max_workers=18) as pool:
        futures = [pool.submit(download, item) for item in jobs]
        for future in as_completed(futures):
            output.append(future.result())
    failures = []
    count = {"downloaded": 0, "cached": 0, "failed": 0}
    for rid, n, stable, state, error in output:
        count[state] += 1
        if stable:
            records[rid]["images"][n - 1]["url"] = stable
        else:
            failures.append({"id": rid, "index": n, "reason": error})
    stable_count = 0
    stable_records = 0
    for record in records.values():
        stable = sum(1 for p in record.get("images", []) if p.get("url", "").startswith(PREFIX))
        stable_count += stable
        stable_records += bool(stable)
    for file, data in files.items():
        file.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    summary = {
        "source": "Airtable 油畫資料 → 天下畫博",
        "utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "record_count": len(records),
        "images_total_in_catalog": sum(len(record.get("images", [])) for record in records.values()),
        "images_processed_this_run": len(jobs),
        "downloaded": count["downloaded"],
        "cached": count["cached"],
        "failed": len(failures),
        "images_with_stable_urls": stable_count,
        "records_with_stable_images": stable_records,
        "errors": failures,
        "note": "Artwork image previews are now hosted by GitHub Pages; the Airtable source is unchanged."
    }
    REPORT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"天下畫博: records={len(records)}, requests={len(jobs)}, stable={stable_count}, failed={len(failures)}")
    if failures:
        print("Failures (IDs only):", ", ".join(row["id"] for row in failures[:30]))
    if stable_count == 0:
        raise SystemExit("No stable images; import should not be marked successful")

if __name__ == "__main__":
    main()
