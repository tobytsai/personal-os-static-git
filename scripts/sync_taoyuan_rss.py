#!/usr/bin/env python3
"""Taoyuan City Government RSS feeds -> verified, safe, small JSON cache.

No external packages. Feed URLs must be verified on official site.
Usage:
  python scripts/sync_taoyuan_rss.py --output public/data/taoyuan-rss-latest.json
The runner performs HTTP requests; GitHub Pages does NOT scrape remote feeds.
"""
from __future__ import annotations
import argparse
import datetime as dt
import email.utils
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "public/data/taoyuan-rss-config.json"
DEFAULT_OUT = ROOT / "public/data/taoyuan-rss-latest.json"
MAX_ITEMS = 40
MAX_BYTES = 3_000_000
TZ_TAIWAN = dt.timezone(dt.timedelta(hours=8))


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
    def handle_data(self, data):
        self.parts.append(data)


def cleanup(value: str | None, limit: int) -> str:
    parser = TextOnly()
    try:
        parser.feed(value or "")
    except Exception:
        pass
    text = html.unescape("".join(parser.parts))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def official_url(value: str | None) -> str:
    if not value:
        return ""
    value = html.unescape(value.strip())
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname:
        return ""
    host = parsed.hostname.lower()
    if host == "tycg.gov.tw" or host.endswith(".tycg.gov.tw"):
        return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))
    return ""


def canonical_date(raw: str | None) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    try:
        parsed = email.utils.parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        try:
            parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=TZ_TAIWAN)
    return parsed.astimezone(TZ_TAIWAN).isoformat(timespec="seconds")


def lname(node: ET.Element) -> str:
    return node.tag.split("}")[-1].lower()


def child(node: ET.Element, name: str) -> ET.Element | None:
    return next((x for x in node if lname(x) == name.lower()), None)


def value(node: ET.Element, *names: str) -> str:
    for name in names:
        found = child(node, name)
        if found is not None and found.text:
            return found.text.strip()
    return ""


def parse_items(raw: bytes, channel_id: str, fallback_url: str) -> list[dict]:
    root = ET.fromstring(raw)
    feed_type = lname(root)
    if feed_type == "rss":
        parent = child(root, "channel")
        if parent is None:
            raise ValueError("RSS channel missing")
        entries = [n for n in parent if lname(n) == "item"]
    elif feed_type == "rdf":
        entries = [n for n in root if lname(n) == "item"]
    elif feed_type == "feed":
        entries = [n for n in root if lname(n) == "entry"]
    else:
        raise ValueError("Unsupported XML root: " + feed_type)
    seen: set[str] = set()
    records: list[dict] = []
    for entry in entries:
        title = cleanup(value(entry, "title"), 180)
        if not title:
            continue
        link = value(entry, "link")
        link_node = child(entry, "link")
        if link_node is not None and link_node.get("href"):
            link = link_node.get("href", "")
        link = official_url(link) or fallback_url
        published = canonical_date(value(entry, "pubDate", "published", "updated", "date"))
        description = cleanup(value(entry, "description", "summary", "content", "encoded"), 380)
        guid = cleanup(value(entry, "guid", "id"), 500)
        unique = link if link != fallback_url else (guid or title)
        if unique in seen:
            continue
        seen.add(unique)
        records.append({
            "id": channel_id + ":" + unique[:280],
            "title": title,
            "link": link,
            "publishedAt": published,
            "summary": description,
            "channel": channel_id
        })
        if len(records) >= MAX_ITEMS:
            break
    records.sort(key=lambda item: item.get("publishedAt") or "", reverse=True)
    return records


def download(url: str) -> bytes:
    if not official_url(url):
        raise ValueError("Feed URL must be the official HTTPS tycg.gov.tw domain")
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; PersonalOS-TaoyuanRSS/1.0; RSS ingestion)",
        "Accept": "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
        "Accept-Language": "zh-TW,zh;q=0.9",
    })
    # The city's event feed can respond slowly. Use a longer socket timeout and
    # one bounded retry rather than silently treating a timeout as "no events".
    import time
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=65) as res:
                resolved = res.geturl()
                if not official_url(resolved):
                    raise ValueError("Feed redirected to a non-official site")
                content = res.read(MAX_BYTES + 1)
                if len(content) > MAX_BYTES:
                    raise ValueError("Feed too large")
                return content
        except (TimeoutError, urllib.error.URLError) as exc:
            if attempt:
                raise
            print(f"[RETRY] {url} - {exc}", file=sys.stderr, flush=True)
            time.sleep(3)
    raise RuntimeError("Feed request did not return a response")


def synchronize(output: Path) -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    current = {}
    if output.exists():
        try:
            old = json.loads(output.read_text(encoding="utf-8"))
            current = {r["id"]: r for r in old.get("channels", [])}
        except (OSError, KeyError, ValueError, TypeError):
            current = {}
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    channels = []
    successes = 0
    for channel in cfg["channels"]:
        previous = current.get(channel["id"], {})
        record = {
            "id": channel["id"],
            "label": channel["label"],
            "status": "pending",
            "fetchedAt": None,
            "successfulAt": previous.get("successfulAt"),
            "itemCount": len(previous.get("items") or []),
            "error": None,
            "items": previous.get("items") or []
        }
        try:
            raw = download(channel["feed"])
            items = parse_items(raw, channel["id"], channel["source"])
            record.update(status="ok", fetchedAt=now, successfulAt=now, itemCount=len(items), items=items)
            successes += 1
            print(f"[OK] {channel['label']} {len(items)} items", flush=True)
        except (urllib.error.URLError, ValueError, OSError, ET.ParseError) as exc:
            record.update(status="failed", fetchedAt=now, error=cleanup(str(exc), 200))
            print(f"[FAILED] {channel['label']} - {exc}", file=sys.stderr, flush=True)
        channels.append(record)
    updated = {
        "schema": "taoyuan-official-rss-cache-v1",
        "lastAttempt": now,
        "note": "此資料由定時工作流程同步官方 RSS；如更新失敗將保留前次成功快取，須以官方網站核對最新消息。",
        "channels": channels
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if successes else 2


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    return synchronize(args.output)


if __name__ == "__main__":
    raise SystemExit(main())
