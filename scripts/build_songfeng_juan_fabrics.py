#!/usr/bin/env python3
"""Match the 9 Song Feng Ge juan-fabric products (絹布) to their own official
class=5 details, price, material, stock label, and photo at site build time.

This script never guesses model IDs or image paths. The checked-in data already
has verified product names and detail URLs so a temporary source outage will
not leave the category empty. Source: https://sfg218.com/frame2.php?class=5
"""
from __future__ import annotations
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
import json
import re

from bs4 import BeautifulSoup
from build_songfeng_matboards import gethtml, detail_picture, jsvalue

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "public/data/songfeng-juan-fabrics.js"
CATEGORY = "https://sfg218.com/frame2.php?class=5"
RE_DETAIL = re.compile(r"^https://sfg218\.com/frame2_info\.php\?class=5&no=(\d+)$")


def parse_item(item):
    expected = item["name"]
    url = item.get("productUrl", "")
    if not RE_DETAIL.fullmatch(url):
        return item, None, "invalid-detail-url"
    try:
        html = gethtml(url, timeout=12)
        soup = BeautifulSoup(html, "html.parser")
        h1 = soup.find("h1")
        title = h1.get_text(" ", strip=True) if h1 else ""
        # Accept only the exact model printed in the supplied official listing.
        if title != expected:
            return item, None, f"wrong-title({title[:30]})"
        txt = soup.get_text(" ", strip=True)
        if not re.search(r"材質\s*[：:]\s*絹布", txt):
            return item, None, "unexpected-material"
        price_match = re.search(
            r"優惠價\s*[：:]\s*(?:NT\s*\$|NTD\s*|NT\$|\$)?\s*([\d,]+)",
            txt, re.I
        )
        # 官方「編號」放在 HTML 表單 input.value，BeautifulSoup.get_text()
        # 會跳過這些值，因此不可用「編號」後的下一個詞（通常是「尺寸」）。
        # 9 款編號已從各商品官方詳情逐筆人工核對並保存在來源資料。
        # 保留「款式／色號」與「編號」為兩個不同欄位。
        size_match = re.search(
            r"尺寸\s*[：:]\s*(\d+(?:\.\d+)?)\s*[*×xX]\s*(\d+(?:\.\d+)?)", txt
        )
        min_match = re.search(r"底布含貼最低收費為\s*(\d+)\s*才", txt)
        photo, candidates = detail_picture(html)
        # The official page's internal "編號" can differ from its 絹xx title;
        # retain both rather than silently substituting one for the other.
        result = {
            "productNo": item.get("productNo"),
            "material": "絹布",
            "sheetSize": (size_match.group(1)+" × "+size_match.group(2)+" 公分（每才）"
                          if size_match else "30 × 30 公分（每才）"),
            "priceTwd": int(price_match.group(1).replace(",", "")) if price_match else None,
            "minimumCaiForPastedBacking": int(min_match.group(1)) if min_match else None,
            "inAllStores": bool(re.search(r"所在分店\s*[：:]\s*均有", txt)),
            "productImage": photo,
            "photoCandidates": candidates
        }
        return item, result, None
    except (HTTPError, URLError, OSError, TimeoutError, ValueError) as err:
        return item, None, type(err).__name__


def main():
    if not FILE.exists():
        raise FileNotFoundError("Missing checked-in Song Feng Ge juan catalog")
    raw = FILE.read_text(encoding="utf-8")
    meta = jsvalue(raw, "SFG_JUAN_CATALOG_META")
    records = jsvalue(raw, "SFG_JUAN_CATALOG_ITEMS")
    if len(records) != 9 or len({x["name"] for x in records}) != 9:
        raise ValueError("Expected exactly 9 unique official juan products")
    if len({x["productUrl"] for x in records}) != 9:
        raise ValueError("Duplicate detail URLs in official juan catalog")
    # Avoid publishing a nonsense placeholder for the official product number.
    if any(not x.get("productNo") or x["productNo"] in ("尺寸", "材質", "優惠價")
           for x in records):
        raise ValueError("Juan product number not verified against official detail page")
    results = Counter()
    sample = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(parse_item, item) for item in records]
        for future in as_completed(futures):
            item, verified, reason = future.result()
            if not verified:
                results[reason or "unknown"] += 1
                continue
            # Apply only official page-proven attributes; never fabricate photos.
            for key in ("productNo", "priceTwd", "minimumCaiForPastedBacking", "productImage"):
                if verified.get(key) is not None:
                    item[key] = verified[key]
            item["material"] = verified["material"]
            item["sheetSize"] = verified["sheetSize"]
            item["inAllStores"] = verified["inAllStores"]
            results["verified"] += 1
            if len(sample) < 4:
                sample.append({
                    "name": item["name"], "productNo": item.get("productNo"),
                    "price": item.get("priceTwd"), "image": item.get("productImage")
                })
    meta["count"] = len(records)
    meta["detailVerifiedCount"] = results["verified"]
    meta["priceCount"] = sum(type(x.get("priceTwd")) in (int, float) for x in records)
    meta["photoCount"] = sum(bool(x.get("productImage")) for x in records)
    meta["officialNumberCount"] = sum(bool(x.get("productNo")) for x in records)
    meta["errors"] = {k: v for k, v in results.items() if k != "verified"}
    meta["catalogStatus"] = "verified" if results["verified"] == len(records) else "partially-verified"
    out = (
        "/* 松風閣絹布9款：按官方 class=5 各商品詳情對應，未核對價格及照片保持空值。 */\n"
        "window.SFG_JUAN_CATALOG_META=" +
        json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.SFG_JUAN_CATALOG_ITEMS=" +
        json.dumps(records, ensure_ascii=False, separators=(",", ":")) + ";\n"
    )
    FILE.write_text(out, encoding="utf-8")
    print("Song Feng Ge juan fabrics:", len(records), "products,",
          results["verified"], "verified details,",
          meta["priceCount"], "prices,",
          meta["photoCount"], "official photos,",
          meta["officialNumberCount"], "official product numbers.",
          "errors:", meta["errors"], flush=True)
    print("Song Feng Ge juan samples:", json.dumps(sample, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
