#!/usr/bin/env python3
"""Download 阿竹 Airtable attachment photos to stable GitHub Pages files.

Only imports the user-owned Airtable attachment URLs in the short-lived
scripts/azhu-photo-import-input.json import request. This import does NOT
change the Airtable table or send tokens to any attachment host.
"""
from __future__ import annotations
import concurrent.futures
from datetime import datetime, timezone
from io import BytesIO
import json
from pathlib import Path
import re
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path("public")
CATALOG_FILE = ROOT / "data/azhu-catalog.json"
INPUT_FILE = Path("scripts/azhu-photo-import-input.json")
OUTPUT_DIR = ROOT / "images/azhu"
REPORT_FILE = ROOT / "data/azhu-import-report.json"
MAX_BYTES = 20_000_000
MAX_SIZE = 1300
Image.MAX_IMAGE_PIXELS = 35_000_000
ALLOWED = {"v5.airtableusercontent.com", "airtableusercontent.com", "dl.airtable.com"}


def trusted(url):
    try:
        parsed = urlparse(url)
        return parsed.scheme == "https" and parsed.hostname in ALLOWED
    except (ValueError, TypeError):
        return False


def fetch_and_optimize(job):
    rid, idx, photo = job
    filename = f"{rid}-{idx:02d}.webp"
    target = OUTPUT_DIR / filename
    local = "../images/azhu/" + filename
    if target.is_file() and target.stat().st_size > 800:
        return rid, idx, local, "cached", ""
    url = photo.get("url", "")
    if not trusted(url):
        return rid, idx, None, "failed", "UnexpectedAttachmentHost"
    try:
        response = requests.get(url, timeout=(12, 40), stream=True, allow_redirects=False)
        response.raise_for_status()
        if response.is_redirect:
            raise ValueError("AttachmentRedirectBlocked")
        data = bytearray()
        for chunk in response.iter_content(chunk_size=65536):
            if chunk:
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    raise ValueError("AttachmentLargerThan20MB")
        with Image.open(BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source)
            image.thumbnail((MAX_SIZE, MAX_SIZE), Image.Resampling.LANCZOS)
            if image.mode in ("RGBA", "LA") or "transparency" in image.info:
                image = image.convert("RGBA")
                white = Image.new("RGB", image.size, "white")
                white.paste(image, mask=image.getchannel("A"))
                image = white
            else:
                image = image.convert("RGB")
            output = BytesIO()
            image.save(output, "WEBP", quality=78, method=4)
            bytes_out = output.getvalue()
        if len(bytes_out) < 200:
            raise ValueError("BlankConvertedImage")
        target.write_bytes(bytes_out)
        return rid, idx, local, "downloaded", ""
    except (requests.RequestException, OSError, ValueError, UnidentifiedImageError) as e:
        return rid, idx, None, "failed", type(e).__name__


def main():
    if not INPUT_FILE.exists():
        print("No import manifest; import already finished or has not been requested.")
        return
    manifest = json.loads(INPUT_FILE.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    items = catalog["items"]
    index = {x["id"]: x for x in items}
    sources = manifest["records"]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    jobs = []
    for row in sources:
        rid = row["id"]
        if not re.fullmatch(r"rec[A-Za-z0-9]{14}", rid) or rid not in index:
            raise ValueError("Invalid or unknown Airtable record identifier")
        for number, photo in enumerate(row.get("images", []), start=1):
            jobs.append((rid, number, photo))
    if not jobs:
        raise SystemExit("No image import tasks present")
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(fetch_and_optimize, job) for job in jobs]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
    successes = {}
    counts = {"downloaded": 0, "cached": 0, "failed": 0}
    errors = []
    for rid, number, filename, outcome, error in results:
        counts[outcome] += 1
        if filename:
            successes.setdefault(rid, []).append((number, filename))
        else:
            errors.append({"record": rid, "image": number, "reason": error})
    for rid, images in successes.items():
        # Keep the original Airtable attachment order; no guessed photo associations.
        sorted_files = [url for _, url in sorted(images)]
        existing = index[rid].get("images", [])
        index[rid]["images"] = sorted_files and [{"url": url} for url in sorted_files] or existing
    imported = sum(len(x.get("images", [])) for x in items)
    CATALOG_FILE.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    REPORT_FILE.write_text(json.dumps({
        "source": "達利 Airtable → 阿竹 → 圖檔-1",
        "scanned_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "records": len(items),
        "records_with_images": sum(bool(x.get("images")) for x in items),
        "images_in_source": len(jobs),
        "images_in_catalog": imported,
        "downloaded_now": counts["downloaded"],
        "already_cached": counts["cached"],
        "failed": counts["failed"],
        "problems": errors[:80],
        "note": "Stable WebP images in GitHub; Airtable source records untouched. Original URL import manifest removed."
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"阿竹: {len(items)} records; {len(jobs)} image attachments; {imported} stable, {counts['downloaded']} downloaded, {len(errors)} failed.")
    if errors:
        print("Failed IDs only:", ",".join(sorted({x["record"] for x in errors})[:35]))
    if not imported:
        raise SystemExit("None of the images could be imported; leaving import request for retry")
    # Remove expiring signed attachment links from current branch after import.
    INPUT_FILE.unlink()
    print("Removed temporary signed URL import manifest.")


if __name__ == "__main__":
    main()
