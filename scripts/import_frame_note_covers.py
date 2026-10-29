#!/usr/bin/env python3
"""Import the first image of each publicly shared Yinxiang note as a card cover.

Source: the user-provided Airtable link inside public/data/frame-tech-work.json.
Only reads public share links; doesn't authenticate or mutate Yinxiang/Airtable.
Exports first content image as durable WebP, keeping existing Airtable images intact.
"""
from __future__ import annotations
import asyncio
import io
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image, ImageOps, UnidentifiedImageError
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

DATA = Path("public/data/frame-tech-work.json")
OUTPUT = Path("public/images/frame-tech-notes")
REPORT = Path("public/data/frame-note-cover-import-report.json")
MAX_BYTES = 18_000_000
MAX_EDGE = 1450
WORKERS = 5
Image.MAX_IMAGE_PIXELS = 30_000_000


def valid_note_link(link):
    try:
        p = urlparse(link)
        return bool(p.scheme == "https" and p.hostname == "app.yinxiang.com"
                    and re.fullmatch(r"/fx/[0-9a-fA-F-]{36}/?", p.path))
    except (TypeError, ValueError):
        return False


def webp(data):
    if len(data) > MAX_BYTES:
        raise ValueError("Image exceeds max bytes")
    with Image.open(io.BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source)
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        if image.mode in ("RGBA", "LA") or "transparency" in image.info:
            image = image.convert("RGBA")
            canvas = Image.new("RGB", image.size, "#ffffff")
            canvas.paste(image, mask=image.getchannel("A"))
            image = canvas
        else:
            image = image.convert("RGB")
        if min(image.size) < 60:
            raise ValueError("Image too small")
        stream = io.BytesIO()
        image.save(stream, "WEBP", quality=82, method=5)
        return stream.getvalue()


async def fetch_first_image(context, locator, note_url):
    # Image-sharing endpoints use temporary signed parameters; no source URL saved.
    src = await locator.evaluate("(img) => img.currentSrc || img.src || ''")
    p = urlparse(src)
    if p.scheme == "https" and p.hostname == "app.yinxiang.com" and p.path.startswith("/FileSharing.action"):
        try:
            resp = await context.request.get(src, headers={"Referer": note_url}, timeout=20000, max_redirects=0)
            if resp.ok and resp.headers.get("content-type", "").lower().startswith("image/"):
                return webp(await resp.body()), "original"
        except (ValueError, Exception):
            # Screenshot of the actual image element is a safe fallback and
            # avoids relying on any external untrusted download host.
            pass
    await locator.scroll_into_view_if_needed(timeout=10000)
    await locator.evaluate("""img => {
        if (img.loading === 'lazy') img.loading = 'eager';
    }""")
    await locator.page.wait_for_function("""el => el.complete && el.naturalWidth > 120 && el.naturalHeight > 80""",
                                         arg=await locator.element_handle(), timeout=12000)
    return webp(await locator.screenshot(timeout=17000, animations="disabled")), "screenshot"


async def process(item, context, sem):
    async with sem:
        rid = item["id"]
        note_url = next((link for link in item.get("links", []) if valid_note_link(link)), None)
        if not note_url:
            return rid, None, "no-link", None
        imgfile = OUTPUT / (rid + ".webp")
        local_path = "../images/frame-tech-notes/" + rid + ".webp"
        if imgfile.exists() and imgfile.stat().st_size > 800:
            return rid, local_path, "cached", None
        page = None
        try:
            page = await context.new_page()
            await page.goto(note_url, wait_until="domcontentloaded", timeout=32000)
            # Public shared notes load their body and image resources via JS.
            # .en-media is the first content image, excluding site app icon.
            locator = page.locator(".ennote img.en-media").first
            try:
                await locator.wait_for(state="attached", timeout=11000)
            except PlaywrightTimeoutError:
                # Some posts use plain body imgs without the en-media class.
                imgs = page.locator('.ennote img[src*="FileSharing.action"]').first
                if await imgs.count():
                    locator = imgs
                else:
                    return rid, None, "no-note-image", None
            binary, method = await fetch_first_image(context, locator, note_url)
            imgfile.write_bytes(binary)
            return rid, local_path, "imported-" + method, None
        except Exception as err:
            return rid, None, "error", type(err).__name__
        finally:
            if page:
                await page.close()


async def main():
    catalog = json.loads(DATA.read_text(encoding="utf-8"))
    records = catalog.get("items", [])
    if not records:
        raise SystemExit("Empty framing catalog; stopped.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    to_scan = []
    for record in records:
        rid = record.get("id", "")
        if not re.fullmatch(r"rec[A-Za-z0-9]{14}", rid):
            raise ValueError("Bad record id")
        if any(valid_note_link(link) for link in record.get("links", [])):
            to_scan.append(record)
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True,
                                          args=["--no-sandbox","--disable-dev-shm-usage"])
        context = await browser.new_context(
            viewport={"width": 1400, "height": 950},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        )
        sem = asyncio.Semaphore(WORKERS)
        tasks = [process(record, context, sem) for record in to_scan]
        results = await asyncio.gather(*tasks)
        await context.close()
        await browser.close()
    index = {x["id"]: x for x in records}
    for rid, path, outcome, error in results:
        if path:
            index[rid]["noteCover"] = path
            index[rid]["noteCoverFrom"] = "public Yinxiang note first content image"
    states = Counter(outcome for _, _, outcome, _ in results)
    problems = [{"id":rid,"reason":err} for rid,_,outcome,err in results if outcome=="error"]
    saved = sum(1 for x in records if x.get("noteCover"))
    REPORT.write_text(json.dumps({
        "source": "Airtable 達利 → 畫框技術仕事 / publicly shared Yinxiang notes",
        "completed_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "all_cards": len(records), "notes_checked":len(to_scan),
        "cards_with_note_cover":saved, "status_counts":dict(states),
        "problems":problems,
        "note":"Only first note-body images, no logo icons; original Airtable photos remain unchanged.",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    DATA.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",",":"))+"\n",encoding="utf-8")
    print(f"Checked {len(to_scan)} public notes; stored {saved} covers; outcomes: {dict(states)}")
    if not saved:
        raise SystemExit("No note images were obtained; refusing to claim success.")

if __name__ == "__main__":
    asyncio.run(main())
