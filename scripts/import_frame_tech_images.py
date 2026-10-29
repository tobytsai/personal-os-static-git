#!/usr/bin/env python3
"""Persist Airtable attachments from the user's framing technique catalog.

This imports ONLY known Airtable attachment URLs stored in the existing
public/data/frame-tech-work.json snapshot. No Airtable login/token is needed.
It preserves every item and the order of all attachments, does not write to Airtable,
and replaces successful temporary image URLs with durable local web paths.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
import json
import re

import requests
from PIL import Image, ImageOps, UnidentifiedImageError

SOURCE_FILE = Path("public/data/frame-tech-work.json")
OUT_DIR = Path("public/images/frame-tech")
REPORT_FILE = Path("public/data/frame-tech-image-import-report.json")
MAX_BYTES = 18_000_000
MAX_EDGE = 1600
Image.MAX_IMAGE_PIXELS = 32_000_000


def trusted_url(url: str) -> bool:
    try:
        url_parts = urlparse(url)
        host = (url_parts.hostname or "").lower()
        return (
            url_parts.scheme == "https"
            and host in ("v5.airtableusercontent.com", "dl.airtable.com", "airtableusercontent.com")
        )
    except ValueError:
        return False


def convert_to_webp(url: str) -> bytes:
    # Never fetch arbitrary links: only the Airtable attachment URL field.
    if not trusted_url(url):
        raise ValueError("URL is not an expected Airtable attachment URL")
    response = requests.get(url, timeout=(12, 35), stream=True, allow_redirects=False)
    response.raise_for_status()
    if response.is_redirect:
        raise ValueError("Unexpected attachment redirect")
    content = bytearray()
    for chunk in response.iter_content(64 * 1024):
        if chunk:
            content.extend(chunk)
            if len(content) > MAX_BYTES:
                raise ValueError("Attachment too large")
    with Image.open(BytesIO(content)) as source:
        image = ImageOps.exif_transpose(source)
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        if image.mode in ("RGBA", "LA") or ("transparency" in image.info):
            image = image.convert("RGBA")
            canvas = Image.new("RGB", image.size, "white")
            canvas.paste(image, mask=image.getchannel("A"))
            image = canvas
        else:
            image = image.convert("RGB")
        result = BytesIO()
        image.save(result, "WEBP", quality=82, method=5)
        return result.getvalue()


def process(payload):
    record_id, index, url = payload
    image_name = f"{record_id}-{index:02d}.webp"
    filepath = OUT_DIR / image_name
    public_url = "../images/frame-tech/" + image_name
    if filepath.exists() and filepath.stat().st_size > 1000:
        return record_id, index, public_url, "cached", None
    try:
        converted = convert_to_webp(url)
        filepath.write_bytes(converted)
        return record_id, index, public_url, "imported", None
    except (OSError, requests.RequestException, ValueError, UnidentifiedImageError) as err:
        # Do NOT log or store the original signed URL in the report.
        return record_id, index, None, "failed", type(err).__name__


def main():
    data = json.loads(SOURCE_FILE.read_text(encoding="utf-8"))
    records = data.get("items", [])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tasks = []
    with_photos = 0
    for record in records:
        rid = record.get("id", "")
        if not re.fullmatch(r"rec[A-Za-z0-9]{14}", rid):
            raise ValueError("Unexpected Airtable record identifier")
        images = record.get("images", [])
        if images:
            with_photos += 1
        for i, image in enumerate(images, start=1):
            url = image.get("url", "")
            local = "../images/frame-tech/" + f"{rid}-{i:02d}.webp"
            path = OUT_DIR / f"{rid}-{i:02d}.webp"
            if url == local and path.exists():
                continue
            if path.exists() and path.stat().st_size > 1000:
                image["url"] = local
                continue
            if trusted_url(url):
                tasks.append((rid, i, url))
    scanned = sum(len(r.get("images", [])) for r in records)
    imported, cached, failed = 0, 0, []
    by_id = {record["id"]: record for record in records}
    with ThreadPoolExecutor(max_workers=6) as executor:
        future_map = [executor.submit(process, payload) for payload in tasks]
        for future in as_completed(future_map):
            record_id, index, local, outcome, error = future.result()
            if outcome == "failed":
                failed.append({"record_id": record_id, "image_number": index, "error": error})
                continue
            by_id[record_id]["images"][index - 1]["url"] = local
            if outcome == "cached":
                cached += 1
            else:
                imported += 1
    total_stable = sum(
        1 for r in records for im in r.get("images", [])
        if str(im.get("url", "")).startswith("../images/frame-tech/")
    )
    report = {
        "source": "Airtable 達利 → 畫框技術仕事 Grid view",
        "scanned_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "records_scanned": len(records),
        "records_with_images": with_photos,
        "image_attachments": scanned,
        "images_downloaded_now": imported,
        "images_already_cached_this_run": cached,
        "images_with_durable_urls": total_stable,
        "failed": failed,
        "note": "All image files are hosted in the GitHub Pages repository; only completed imports are rewritten."
    }
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SOURCE_FILE.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Scanned {len(records)} cases / {scanned} photos; imported {imported}, cached {cached}, stable {total_stable}, failed {len(failed)}")
    if failed:
        print("Failed items (IDs only):", ",".join(x["record_id"] for x in failed[:20]))
    if scanned and not total_stable:
        raise SystemExit("No durable photos imported; refusing to publish an empty image import.")


if __name__ == "__main__":
    main()
