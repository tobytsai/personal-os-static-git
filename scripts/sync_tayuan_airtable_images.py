#!/usr/bin/env python3
"""Sync user-owned Airtable Tayuan product attachments to static GitHub Pages assets.
This tool requires AIRTABLE_TOKEN (data.records:read for the 達利 base).
It never stores PATs, temporary Airtable URLs or raw API responses in Git.
"""
from __future__ import annotations
import datetime
import hashlib
import io
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import requests
from PIL import Image, ImageOps, UnidentifiedImageError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_ID = "appPXSnxWroL0MXbl"
TABLE_ID = "tblYJeqEuWIeUsm36"  # 達利 → 裱畫材料
OUT_DIR = Path("public/assets/tayuan")
MAP_FILE = Path("public/data/tayuan-images.js")
REPORT_FILE = Path("public/data/tayuan-image-sync-report.json")
STATE_FILE = Path("public/data/tayuan-image-state.json")
SOURCE_FIELD = "当前网页URL"
IMAGE_FIELD = "Attachments"
VENDOR_FIELD = "廠商"
FIELD_IDS = {
    SOURCE_FIELD: "fldh4EzykJ1R3aMZi",
    IMAGE_FIELD: "fldGXZOMOZJr1dYR3",
    VENDOR_FIELD: "fldvJnXKxgXTpXTGV",
}
MAX_CONTENT_BYTES = 20_000_000
MAX_WIDTH = 900

def get_records(session, token):
    api = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}"
    records = []
    offset = None
    while True:
        params = [
            ("pageSize", 100),
            ("filterByFormula", "{廠商}='大圓'"),
            ("fields[]", SOURCE_FIELD),
            ("fields[]", IMAGE_FIELD),
            ("fields[]", VENDOR_FIELD),
        ]
        if offset:
            params.append(("offset", offset))
        response = session.get(api, params=params, timeout=35, headers={"Authorization": "Bearer " + token})
        response.raise_for_status()
        obj = response.json()
        records.extend(obj.get("records", []))
        offset = obj.get("offset")
        if not offset:
            break
    return records

def code_from_url(url):
    try:
        return parse_qs(urlparse(url).query).get("prod_id", [""])[0].strip()
    except Exception:
        return ""

def safe_code(code):
    code = re.sub(r"[^A-Za-z0-9_-]", "_", code).strip("_")
    if not code:
        return None
    return code[:90]

def download_photo(session, url):
    # Only accept Airtable-hosted attachment links; never fetch arbitrary user fields.
    host = urlparse(url).hostname
    if host not in {"v5.airtableusercontent.com", "dl.airtable.com", "airtableusercontent.com"}:
        raise ValueError("Unexpected attachment hostname")
    response = session.get(url, timeout=45)
    response.raise_for_status()
    if len(response.content) > MAX_CONTENT_BYTES:
        raise ValueError("Attachment exceeds 20 MB")
    with Image.open(io.BytesIO(response.content)) as src:
        im = ImageOps.exif_transpose(src)
        im.thumbnail((MAX_WIDTH, MAX_WIDTH), Image.Resampling.LANCZOS)
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")
        elif im.mode == "RGBA":
            background = Image.new("RGB", im.size, "#ffffff")
            background.paste(im, mask=im.getchannel("A"))
            im = background
        output = io.BytesIO()
        im.save(output, "WEBP", quality=80, method=5)
        return output.getvalue()

def main():
    token = os.environ.get("AIRTABLE_TOKEN", "").strip()
    if not token:
        raise SystemExit("Missing AIRTABLE_TOKEN: configure the repository Actions secret.")
    session = requests.Session()
    retry = Retry(total=3, connect=3, backoff_factor=0.8, status_forcelist=[429, 500, 502, 503, 504], allowed_methods=["GET"])
    session.mount("https://", HTTPAdapter(max_retries=retry))
    # Security: the Airtable PAT is only sent to api.airtable.com, never to image hosts.
    records = get_records(session, token)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    found = {}
    successes = 0
    cached = 0
    skipped = 0
    failures = []
    try:
        previous_state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if not isinstance(previous_state, dict):
            previous_state = {}
    except (FileNotFoundError, ValueError):
        previous_state = {}
    new_state = dict(previous_state)
    for record in records:
        fields = record.get("fields", {})
        if fields.get(VENDOR_FIELD, fields.get(FIELD_IDS[VENDOR_FIELD])) != "大圓":
            continue
        code = code_from_url(fields.get(SOURCE_FIELD, fields.get(FIELD_IDS[SOURCE_FIELD], "")))
        label = safe_code(code)
        attachments = fields.get(IMAGE_FIELD, fields.get(FIELD_IDS[IMAGE_FIELD], []))
        if not code or not label or not attachments:
            skipped += 1
            continue
        image = next((x for x in attachments if x.get("type", "").startswith("image/") and x.get("url")), None)
        if not image:
            skipped += 1
            continue
        filepath = OUT_DIR / (label + ".webp")
        attachment_id = image.get("id", "")
        if filepath.exists() and filepath.stat().st_size > 100 and attachment_id and previous_state.get(code) == attachment_id:
            cached += 1
            found[code] = "../assets/tayuan/" + label + ".webp"
            continue
        try:
            contents = download_photo(session, image["url"])
            filepath.write_bytes(contents)
            new_state[code] = attachment_id
            found[code] = "../assets/tayuan/" + label + ".webp"
            successes += 1
        except (requests.RequestException, OSError, ValueError, UnidentifiedImageError) as err:
            # Never log time-limited attachment URLs or the token.
            failures.append({"code": code, "reason": type(err).__name__})
    # Preserve successfully synced assets even if Airtable has omitted/deleted a record.
    for filepath in OUT_DIR.glob("*.webp"):
        if filepath.is_file() and filepath.stat().st_size > 100:
            # Filename corresponds to product code in current linked dataset.
            found.setdefault(filepath.stem, "../assets/tayuan/" + filepath.name)
    if not found:
        raise SystemExit("No product photos were downloaded; refusing to publish an empty map.")
    manifest = "/* Stable, self-hosted product photos imported from user-owned Airtable. */\n"
    manifest += "window.TAYUAN_IMAGE_MAP=" + json.dumps(dict(sorted(found.items())), ensure_ascii=False, separators=(",", ":")) + ";\n"
    MAP_FILE.write_text(manifest, encoding="utf-8")
    STATE_FILE.write_text(json.dumps(new_state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report = {
        "source": "Airtable 達利 → 裱畫材料 → 大圓",
        "completed_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "records_scanned": len(records), "downloaded": successes,
        "already_cached": cached, "skipped_without_code_or_photo": skipped,
        "mapped_photos": len(found), "errors": failures,
        "note": "Product pictures only. Old Airtable attachment links and API tokens are excluded from repository."
    }
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Scanned", len(records), "records; downloaded", successes, "images; cached", cached, "; mapped", len(found), "; failures", len(failures))
    if failures:
        print("Problematic item codes:", ", ".join(row["code"] for row in failures[:30]))

if __name__ == "__main__":
    main()
