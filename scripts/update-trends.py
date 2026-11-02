#!/usr/bin/env python3
"""Daily trend radar. Public RSS/HTML only; no account tokens or fabricated scores."""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha1
from pathlib import Path
from urllib.parse import quote, urlencode, urljoin
from urllib.request import Request, urlopen
import json
import re
import time
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parents[1] / "public" / "data"
ARCHIVE = BASE / "trends-history"
LATEST = BASE / "trends-latest.json"
INDEX = BASE / "trends-history-index.json"
LOCAL_TZ = timezone(timedelta(hours=8))
NOW = datetime.now(timezone.utc)
DAY = NOW.astimezone(LOCAL_TZ).date().isoformat()
NS = {"ht": "https://trends.google.com/trending/rss"}
UA = "Mozilla/5.0 (compatible; PersonalOSTrendRadar/1.0; daily public feed reader)"
NEWS = {
    "news": ("台灣新聞焦點", None),
    "ai": ("AI 與科技", "(人工智慧 OR AI工具 OR ChatGPT OR 科技創新) when:1d"),
    "art": ("藝文與設計", "(藝術展覽 OR 美術館 OR 畫廊 OR 設計展 OR 工藝) when:1d"),
    "community": ("地方創生與社造", "(社區營造 OR 地方創生 OR 文化保存 OR 客家文化) when:1d"),
    "education": ("自學與教育", "(自學教育 OR 教育科技 OR 親子教育 OR 實驗教育) when:1d"),
    "business": ("商業與行銷", "(品牌行銷 OR 電商趨勢 OR 消費趨勢 OR 零售商機) when:1d"),
}
GROUPS = ["tw", "us", "jp", *NEWS, "github", "hn"]


def fetch(url: str) -> bytes:
    """Bounded public HTTP GET with retry; request only whitelisted feed URLs."""
    for attempt in range(3):
        try:
            req = Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml,application/xml,text/html,application/json,*/*"})
            with urlopen(req, timeout=28) as response:
                raw = response.read(3_000_001)
                if len(raw) > 3_000_000:
                    raise ValueError("Feed exceeded size limit")
                return raw
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("Fetch failed")


def iso_date(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        return parsedate_to_datetime(raw).astimezone(timezone.utc).isoformat(timespec="seconds")
    except (ValueError, TypeError, OverflowError):
        return ""


def clean(raw: str | None, limit: int = 210) -> str:
    text = re.sub(r"\s+", " ", raw or "").strip()
    return text[:limit]


def stable_id(group: str, title: str) -> str:
    normalized = re.sub(r"\s+", " ", title).strip().casefold()
    return group + ":" + sha1(normalized.encode("utf-8")).hexdigest()[:14]


def volume_number(raw: str) -> int:
    m = re.search(r"([\d,.]+)\s*([KMB萬億]?)", raw.upper())
    if not m:
        return 0
    scale = {"K": 1000, "M": 1000000, "B": 1000000000, "萬": 10000, "億": 100000000}.get(m.group(2), 1)
    try:
        return int(float(m.group(1).replace(",", "")) * scale)
    except ValueError:
        return 0


def base_item(group: str, title: str, url: str, published: str = "") -> dict:
    return {
        "id": stable_id(group, title),
        "title": clean(title),
        "url": url,
        "published_at": published,
        "value": "",
        "value_number": 0,
        "publisher": "",
        "related": [],
        "rank": 0,
    }


def trend_feed(group: str, geo: str) -> list[dict]:
    root = ET.fromstring(fetch("https://trends.google.com/trending/rss?" + urlencode({"geo": geo})))
    found = []
    for item in root.findall("./channel/item"):
        title = clean(item.findtext("title"))
        if not title:
            continue
        target = "https://www.google.com/search?" + urlencode({"q": title, "hl": "zh-TW"})
        entry = base_item(group, title, target, iso_date(item.findtext("pubDate")))
        entry["value"] = clean(item.findtext("ht:approx_traffic", default="", namespaces=NS), 35)
        entry["value_number"] = volume_number(entry["value"])
        entry["publisher"] = "Google Trends " + geo
        entry["related"] = []
        for news in item.findall("ht:news_item", namespaces=NS)[:3]:
            url = clean(news.findtext("ht:news_item_url", default="", namespaces=NS), 1000)
            headline = clean(news.findtext("ht:news_item_title", default="", namespaces=NS))
            source = clean(news.findtext("ht:news_item_source", default="", namespaces=NS), 60)
            if url.startswith("https://") and headline:
                entry["related"].append({"title": headline, "url": url, "publisher": source})
        found.append(entry)
    if not found:
        raise RuntimeError("RSS returned no trends")
    # RSS lists recent search spikes, not a global search-volume league table.
    found.sort(key=lambda x: (x["value_number"], x["published_at"]), reverse=True)
    return dedup(found, 15)


def news_feed(group: str, query: str | None) -> list[dict]:
    params = {"hl": "zh-TW", "gl": "TW", "ceid": "TW:zh-Hant"}
    if query:
        params["q"] = query
        url = "https://news.google.com/rss/search?" + urlencode(params)
    else:
        url = "https://news.google.com/rss?" + urlencode(params)
    root = ET.fromstring(fetch(url))
    found = []
    for node in root.findall("./channel/item"):
        title = clean(node.findtext("title"))
        link = clean(node.findtext("link"), 1200)
        if not title or not link.startswith("https://"):
            continue
        source = node.find("source")
        publisher = clean(source.text if source is not None else "", 70)
        if publisher and title.endswith(" - " + publisher):
            title = title[:-(len(publisher) + 3)]
        entry = base_item(group, title, link, iso_date(node.findtext("pubDate")))
        entry["publisher"] = publisher or "Google News"
        found.append(entry)
    if not found:
        raise RuntimeError("RSS returned no headlines")
    # Position is the publisher's feed order, never equivalent to social mentions.
    return dedup(found, 15)


def github_trending() -> list[dict]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(fetch("https://github.com/trending?since=daily"), "html.parser")
    entries = []
    for article in soup.select("article.Box-row"):
        a = article.select_one("h2 a[href]")
        if a is None:
            continue
        name = re.sub(r"\s+", "", a.get_text(" ", strip=True)).strip("/")
        href = urljoin("https://github.com/", a.get("href", ""))
        if not name or not href.startswith("https://github.com/"):
            continue
        entry = base_item("github", name, href)
        desc = article.select_one("p")
        entry["publisher"] = clean(desc.get_text(" ", strip=True), 150) if desc else "GitHub Trending"
        match = re.search(r"([\d,]+)\s+stars?\s+today", article.get_text(" ", strip=True), re.I)
        if match:
            entry["value_number"] = int(match.group(1).replace(",", ""))
            entry["value"] = "+" + match.group(1) + " stars 今日"
        entries.append(entry)
    if not entries:
        raise RuntimeError("GitHub Trending layout has no cards")
    return dedup(entries, 15)


def hacker_news() -> list[dict]:
    endpoint = "https://hn.algolia.com/api/v1/search?" + urlencode({"tags": "front_page", "hitsPerPage": 18})
    hits = json.loads(fetch(endpoint)).get("hits", [])
    entries = []
    for row in hits:
        title = clean(row.get("title"))
        if not title:
            continue
        item_id = clean(str(row.get("objectID", "")), 40)
        url = "https://news.ycombinator.com/item?id=" + quote(item_id)
        entry = base_item("hn", title, url, iso_date_rfc3339(row.get("created_at")))
        points = row.get("points")
        if isinstance(points, int):
            entry["value_number"] = max(0, points)
            entry["value"] = str(points) + " points"
        entry["publisher"] = "Hacker News"
        entry["related"] = [{"title": "原始討論", "url": url, "publisher": "HN"}]
        entries.append(entry)
    if not entries:
        raise RuntimeError("Hacker News returned no front-page stories")
    entries.sort(key=lambda x: x["value_number"], reverse=True)
    return dedup(entries, 15)


def iso_date_rfc3339(value: str | None) -> str:
    if not value:
        return ""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat(timespec="seconds")
    except ValueError:
        return ""


def dedup(entries: list[dict], limit: int) -> list[dict]:
    out, seen = [], set()
    for item in entries:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        item["rank"] = len(out) + 1
        out.append(item)
        if len(out) >= limit:
            break
    return out


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return fallback


def write_json(path: Path, content) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    previous_latest = read_json(LATEST, {})
    index = read_json(INDEX, {"days": []})
    prev_day = next((date for date in index.get("days", []) if date < DAY), "")
    if prev_day:
        previous = read_json(ARCHIVE / (prev_day + ".json"), {})
    elif previous_latest.get("date_taipei", "") < DAY:
        previous = previous_latest
    else:
        previous = {}
    compare_valid = bool(previous.get("date_taipei")) and (datetime.fromisoformat(DAY) - datetime.fromisoformat(previous["date_taipei"])).days == 1

    rankings, statuses = {}, []
    jobs = [("tw", "Google Trends 台灣", lambda: trend_feed("tw", "TW")),
            ("us", "Google Trends 美國", lambda: trend_feed("us", "US")),
            ("jp", "Google Trends 日本", lambda: trend_feed("jp", "JP"))]
    for group, (label, query) in NEWS.items():
        jobs.append((group, "Google News｜" + label, lambda group=group, query=query: news_feed(group, query)))
    jobs.extend([
        ("github", "GitHub Trending", github_trending),
        ("hn", "Hacker News 熱門討論", hacker_news),
    ])
    errors = []
    for group, label, collect in jobs:
        try:
            entries = collect()
            rankings[group] = entries
            statuses.append({"group": group, "source": label, "ok": True, "count": len(entries), "error": ""})
            print("OK", group, len(entries), flush=True)
        except Exception as exc:
            rankings[group] = []
            message = type(exc).__name__ + ": " + str(exc)
            errors.append(group)
            statuses.append({"group": group, "source": label, "ok": False, "count": 0, "error": clean(message, 120)})
            print("WARN", group, message, flush=True)

    if not any(rankings.values()):
        raise SystemExit("All trend sources failed. Previous published ranking left intact.")

    for group, entries in rankings.items():
        old = {row.get("id"): row.get("rank") for row in previous.get("rankings", {}).get(group, [])} if compare_valid else {}
        for row in entries:
            old_rank = old.get(row["id"])
            if old_rank is None:
                row["movement"] = "new" if compare_valid else "untracked"
                row["rank_change"] = 0
            else:
                change = int(old_rank) - row["rank"]
                row["movement"] = "up" if change > 0 else "down" if change < 0 else "same"
                row["rank_change"] = change

    snapshot = {
        "schema_version": 1,
        "date_taipei": DAY,
        "generated_at": NOW.isoformat(timespec="seconds"),
        "comparison_date": previous.get("date_taipei", "") if compare_valid else "",
        "note": "Google Trends RSS 熱搜量級是估算下限；新聞為來源排序；GitHub stars 和 HN points 不可跨榜比較。",
        "source_status": statuses,
        "rankings": rankings,
    }
    write_json(LATEST, snapshot)
    write_json(ARCHIVE / (DAY + ".json"), snapshot)
    days = sorted(set(index.get("days", []) + [DAY]), reverse=True)
    keep = days[:45]
    write_json(INDEX, {"updated_at": snapshot["generated_at"], "days": keep})
    for old_day in days[45:]:
        old_file = ARCHIVE / (old_day + ".json")
        if old_file.is_file():
            old_file.unlink()
    print("Published snapshot", DAY, "groups", len(rankings) - len(errors), "errors", ",".join(errors) or "none", flush=True)


if __name__ == "__main__":
    main()
