#!/usr/bin/env python3
"""One-time importer of user-approved Airtable *product* images.

Consumes short-lived Airtable attachment URLs from scripts/tayuan-photo-import.json,
converts each image to a durable WebP in public/images/tayuan and generates a
separate product-code => relative image list for the framing-materials launcher.
The source Airtable base is never modified.
"""
from __future__ import annotations

import concurrent.futures
import io
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts/tayuan-photo-import.json"
OUT = ROOT / "public/images/tayuan"
MAP = ROOT / "public/data/tayuan-images.js"
REPORT = ROOT / "public/data/tayuan-photo-import-report.json"
MAX_BYTES = 25 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 35000000


def filename_for(code: str, index: int) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", code).strip("_")[:90]
    return f"{safe or 'unknown'}-{index:02d}.webp"


def download_one(task: dict) -> dict:
    code = task["code"]
    idx = int(task["index"])
    url = task["url"]
    target = OUT / filename_for(code, idx)
    result = {"code": code, "index": idx, "path": "../images/tayuan/" + target.name, "status": "error"}
    if target.is_file() and target.stat().st_size >= 100:
        result["status"] = "existing"
        return result
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in {"v5.airtableusercontent.com", "v4.airtableusercontent.com", "dl.airtable.com", "airtable.com"}:
            raise ValueError("Unsupported attachment host")
        content = None
        for attempt in range(3):
            try:
                with requests.get(url, timeout=(10, 35), stream=True, allow_redirects=True) as response:
                    response.raise_for_status()
                    mime = response.headers.get("content-type", "")
                    if not (mime.startswith("image/") or mime.startswith("application/octet-stream")):
                        raise ValueError(f"Unexpected MIME type: {mime[:50]}")
                    chunks = []
                    total = 0
                    for chunk in response.iter_content(256 * 1024):
                        total += len(chunk)
                        if total > MAX_BYTES:
                            raise ValueError("Image exceeds 25 MiB")
                        chunks.append(chunk)
                    content = b"".join(chunks)
                break
            except requests.RequestException:
                if attempt == 2:
                    raise
                time.sleep(1.5 * (attempt + 1))
        if not content:
            raise ValueError("Empty download")
        with Image.open(io.BytesIO(content)) as im:
            im.seek(0)  # Preserve the image, including GIF poster/frame, as a static WebP.
            rgb = ImageOps.exif_transpose(im)
            rgb.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
            if rgb.mode not in ("RGB", "RGBA"):
                rgb = rgb.convert("RGBA" if "A" in rgb.getbands() else "RGB")
            temp = target.with_name(target.name + ".tmp")
            rgb.save(temp, format="WEBP", quality=84, method=5)
            temp.replace(target)
        result["status"] = "saved"
        result["bytes"] = target.stat().st_size
    except Exception as exc:
        result["reason"] = str(exc)[:250]
    return result


def main() -> int:
    if not MANIFEST.exists():
        print("No image manifest found, nothing to do")
        return 0
    doc = json.loads(MANIFEST.read_text("utf-8"))
    tasks = doc["photos"]
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("Empty photo manifest")
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for n, result in enumerate(executor.map(download_one, tasks), start=1):
            results.append(result)
            if n % 25 == 0 or n == len(tasks):
                ok = sum(x["status"] in ("saved", "existing") for x in results)
                print(f"Processed {n}/{len(tasks)} attachments; {ok} succeeded", flush=True)
    previous = {}
    if MAP.exists():
        existing = MAP.read_text("utf-8")
        match = re.search(r"window\.TAYUAN_IMAGE_MAP\s*=\s*(\{.*\})\s*;", existing)
        if match:
            previous = json.loads(match.group(1))
    mapping = {code: list(paths) for code, paths in previous.items()}
    for item in results:
        if item["status"] in ("saved", "existing"):
            arr = mapping.setdefault(item["code"], [])
            if item["path"] not in arr:
                arr.append(item["path"])
    for code in mapping:
        mapping[code].sort()
    MAP.write_text("/* Durable public image paths keyed by Tayuan product code; one code may have multiple images. */\n"
                   + "window.TAYUAN_IMAGE_MAP=" + json.dumps(mapping, ensure_ascii=False, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    failed = [{k: v for k, v in item.items() if k != "path"} for item in results if item["status"] == "error"]
    report = {
        "source": "Airtable 達利 → 裱畫材料（大圓）",
        "requested": len(tasks),
        "saved": sum(x["status"] == "saved" for x in results),
        "previouslySaved": sum(x["status"] == "existing" for x in results),
        "failedCount": len(failed),
        "mappedProducts": len(mapping),
        "publicFileCount": sum(len(v) for v in mapping.values()),
        "failed": failed,
        "notes": "The source Airtable was read only; images were transcoded to static WebP."
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Short-lived Airtable attachment links are deleted from the current branch
    # as soon as the import finishes. (Do not publish the staging manifest.)
    MANIFEST.unlink()
    print(json.dumps({k: v for k, v in report.items() if k != "failed"}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
