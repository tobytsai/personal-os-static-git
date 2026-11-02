#!/usr/bin/env python3
"""Send LINE only for newly persisted, verified Shopee/Gakubuti results.

The pre-existing ChatGPT automations verify source listings and update files.
This script bridges those changes to LINE with a separate durable ledger.
No third-party libraries and no direct access to Shopee account credentials.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
from urllib.parse import urlparse
from send_line_notification import send_line_message

ROOT = Path(__file__).resolve().parents[1]
ORDERS = ROOT / "public/data/shopee-order-history-20261102.js"
PRICES = ROOT / "public/data/shopee-price-watch-state.json"
WEEKLY = ROOT / "public/data/gakubuti-weekly.js"
LEDGER_REL = ".github/line-watch-ledger.json"
LEDGER = ROOT / LEDGER_REL
TAIPEI = timezone(timedelta(hours=8))


def read_window_json(path: Path, var: str):
    raw = path.read_text(encoding="utf-8")
    match = re.search(r"\bwindow\." + re.escape(var) + r"\s*=\s*([\s\S]*?)\s*;\s*$", raw)
    if not match:
        raise ValueError(f"Cannot find JSON in {path.name}")
    return json.loads(match.group(1))


def tidy(value, limit=190):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def positive(value):
    return value if isinstance(value, (float, int)) and not isinstance(value, bool) and 0 < value < 100000000 else None


def shopee_url_matches(url, shop, item):
    try:
        parsed = urlparse(url)
        m = re.fullmatch(r"/product/(\d+)/(\d+)/?", parsed.path)
        return parsed.scheme == "https" and parsed.hostname == "shopee.tw" and bool(m) and int(m[1]) == int(shop) and int(m[2]) == int(item)
    except (TypeError, ValueError):
        return False


def recent_verification(value, now):
    try:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if not moment.tzinfo:
            return False
        age = now - moment.astimezone(timezone.utc)
        return timedelta(hours=-1) <= age <= timedelta(days=7)
    except ValueError:
        return False


def find_new_shopee(orders, prices, ledger, now):
    history = {x.get("id"): x for x in orders if isinstance(x, dict) and x.get("id") and x.get("done") is True and x.get("orderStatus") != "refunded" and positive(x.get("price"))}
    notified = prices.get("last_notified")
    sent = ledger.get("shopee_last_sent")
    if not isinstance(notified, dict) or not isinstance(sent, dict):
        raise ValueError("Invalid Shopee notification source or deduplication ledger")
    pending = []
    for source_id, offer in sorted(notified.items()):
        if source_id not in history or not isinstance(offer, dict):
            continue
        old = history[source_id]
        current = positive(offer.get("current_price"))
        prior = positive(old.get("price"))
        quoted_prior = positive(offer.get("historical_display_price"))
        if not current or not prior or quoted_prior != prior or current >= prior:
            continue
        previous = sent.get(source_id) or {}
        previous_price = positive(previous.get("price"))
        # A different seller or a later check at the same/higher price is not a new low.
        if previous_price is not None and current >= previous_price:
            continue
        if offer.get("source_product_id") != source_id:
            continue
        if offer.get("listing_status") not in ("normal/not_sold_out", "in_stock", "available"):
            continue
        if not tidy(offer.get("matched_spec")) or not tidy(offer.get("shop_name")):
            continue
        if "shopee" not in tidy(offer.get("price_verification"), 250).lower():
            continue
        if not shopee_url_matches(offer.get("url"), offer.get("shopid"), offer.get("itemid")):
            continue
        if not recent_verification(offer.get("verified_at"), now):
            continue
        pending.append({
            "id": source_id, "name": tidy(old.get("title")),
            "spec": tidy(offer["matched_spec"]), "seller": tidy(offer["shop_name"]),
            "price": current, "history": prior,
            "url": offer["url"], "shopid": offer["shopid"],
            "itemid": offer["itemid"], "modelid": offer.get("modelid"),
            "verified_at": offer["verified_at"]
        })
    return pending


def gakubuti_key(item):
    name = unicodedata.normalize("NFKC", tidy(item.get("original"), 220)).casefold()
    return tidy(item.get("date"), 20) + "|" + re.sub(r"\s+", "", name)


def official_news(url):
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in ("www.gakubuti.net", "gakubuti.net") and bool(re.fullmatch(r"/news/\d+/?", parsed.path))


def official_product(url):
    if not url:
        return True
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in ("www.gakubuti.net", "gakubuti.net") and parsed.path.startswith("/product/")


def find_new_gakubuti(weekly, ledger, now):
    seen = set(ledger.get("gakubuti_seen_keys") or [])
    seen_news = set(ledger.get("gakubuti_seen_news_urls") or [])
    entries = weekly.get("weeklyNew") or []
    if not isinstance(entries, list):
        raise ValueError("Invalid weeklyNew data")
    pending = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        date = tidy(entry.get("date"), 20)
        try:
            published_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            continue
        if published_date > now.astimezone(TAIPEI).date():
            continue
        name, title = tidy(entry.get("original")), tidy(entry.get("title"))
        news = tidy(entry.get("news"), 320).rstrip("/")
        product = tidy(entry.get("product"), 320)
        key = gakubuti_key(entry)
        if not name or not title or key in seen or news in seen_news:
            continue
        # Refuse generic /news homepages and advertisements without a specific
        # official announcement URL. Only the original weekly task verifies "新商品".
        if not official_news(news) or not official_product(product):
            continue
        pending.append({"key": key, "name": name, "title": title, "date": date, "news": news, "product": product})
        seen.add(key)
        seen_news.add(news)
    return pending


def chunk_alerts(header, blocks, footer):
    messages = []
    current = header
    for block in blocks:
        addition = "\n\n" + block
        if len(current) + len(addition) + len(footer) > 4000 and current != header:
            messages.append(current + footer)
            current = header
        if len(current) + len(addition) + len(footer) > 4000:
            raise ValueError("LINE alert block too large")
        current += addition
    if current != header:
        messages.append(current + footer)
    return messages


def make_shopee_messages(items):
    blocks = []
    for item in items:
        drop = item["history"] - item["price"]
        percent = 100 * drop / item["history"]
        blocks.append(
            f"• {item['name']}\n規格：{item['spec']}\n"
            f"歷史商品標價：NTD {item['history']:g}\n目前可見標價：NTD {item['price']:g}\n"
            f"差額：NTD {drop:g}（{percent:.1f}%）\n賣場：{item['seller']}\n"
            f"蝦皮連結：{item['url']}"
        )
    return chunk_alerts(
        "🛒 Personal OS｜蝦皮同規格新低價\n經原追蹤任務核實：",
        blocks,
        "\n\n⚠️ 低於歷史商品標價，尚未證實低於當時實付價；運費、優惠券及結帳價尚待確認。"
    )


def make_gakubuti_messages(items):
    blocks = []
    for item in items:
        blocks.append(
            f"• {item['title']}（{item['name']}）\n官方公告日：{item['date']}\n"
            f"官方新品公告：{item['news']}" +
            (f"\n官方商品頁：{item['product']}" if item["product"] else "")
        )
    return chunk_alerts(
        "🖼️ Personal OS｜額緣高橋新品\n已由每週任務核實並同步新品卡片：",
        blocks,
        "\n\n啟動器：https://tobytsai.github.io/personal-os-static-git/pages/finished-examples.html"
    )


def record_deliveries(ledger):
    LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True, cwd=ROOT)
    subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], check=True, cwd=ROOT)
    subprocess.run(["git", "add", "--", LEDGER_REL], check=True, cwd=ROOT)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0:
        return
    subprocess.run(["git", "commit", "-m", "chore: record delivered LINE alerts [skip ci]"], check=True, cwd=ROOT)
    subprocess.run(["bash", "scripts/git-safe-push.sh"], check=True, cwd=ROOT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Only check pending counts; never send or write ledger")
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    orders = read_window_json(ORDERS, "TOBY_SHOPEE_ORDER_HISTORY_20261102")
    prices = json.loads(PRICES.read_text(encoding="utf-8"))
    weekly = read_window_json(WEEKLY, "TOBY_GAKUBUTI_WEEKLY")
    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    if not isinstance(orders, list) or not isinstance(prices, dict) or not isinstance(weekly, dict) or ledger.get("schema_version") != 1:
        raise ValueError("Unexpected tracking data schema")
    shopee = find_new_shopee(orders, prices, ledger, now)
    gakubuti = find_new_gakubuti(weekly, ledger, now)
    print(f"New eligible LINE notifications: Shopee={len(shopee)} Gakubuti={len(gakubuti)}")
    if args.dry_run or not (shopee or gakubuti):
        print("No LINE push and no ledger write.")
        return 0
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    user_id = os.environ.get("LINE_TO_USER_ID", "").strip()
    if not token or not user_id:
        raise RuntimeError("LINE Actions Secrets are not configured")
    for message in make_shopee_messages(shopee) + make_gakubuti_messages(gakubuti):
        send_line_message(token, user_id, message)
    delivered = ledger.setdefault("shopee_last_sent", {})
    for item in shopee:
        delivered[item["id"]] = {
            "price": item["price"], "shopid": item["shopid"], "itemid": item["itemid"],
            "modelid": item["modelid"], "url": item["url"], "verified_at": item["verified_at"]
        }
    seen = set(ledger.get("gakubuti_seen_keys") or [])
    seen_urls = set(ledger.get("gakubuti_seen_news_urls") or [])
    for item in gakubuti:
        seen.add(item["key"])
        seen_urls.add(item["news"])
    ledger["gakubuti_seen_keys"] = sorted(seen)
    ledger["gakubuti_seen_news_urls"] = sorted(seen_urls)
    record_deliveries(ledger)
    print("Eligible LINE messages accepted; notification ledger published.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"::error::LINE bridge failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
