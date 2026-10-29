#!/usr/bin/env python3
"""Enrich Song Feng Ge's 5 original 錦布-category listings from their official class-6 pages.

Do not equate category 錦布 with every item's material: the official detail
pages describe 2 韓錦 models as 綾布 and the other 2 as 韓錦.
Verified static names, item numbers, product IDs, prices and exact materials
are kept when the source is temporarily unavailable. Photos are matched only
to their own official detail pages (never a neighboring product or guessed URL).
"""
from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
import json
import re

from bs4 import BeautifulSoup
from build_songfeng_matboards import detail_picture, gethtml, jsvalue

ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/"public/data/songfeng-brocade-fabrics.js"
RE_DETAIL=re.compile(r"^https://sfg218\.com/frame2_info\.php\?class=6&no=(\d+)$")
EXPECTED_MATERIAL={"宋錦02":"錦布","韓錦04":"綾布","韓錦02":"韓錦","韓錦01":"韓錦","韓錦03":"綾布"}

def parse_item(item):
    url=item.get("productUrl","")
    if not RE_DETAIL.fullmatch(url):
        return item,None,"invalid-detail-url"
    expected_name=item["name"]
    try:
        html=gethtml(url,timeout=12)
        soup=BeautifulSoup(html,"html.parser")
        title=soup.find("h1")
        title=title.get_text(" ",strip=True) if title else ""
        if title!=expected_name:
            return item,None,"unexpected-model-title"
        txt=soup.get_text(" ",strip=True)
        material_match=re.search(r"材質\s*[：:]\s*(\S+)",txt)
        actual_material=material_match.group(1) if material_match else None
        if actual_material!=EXPECTED_MATERIAL[expected_name]:
            return item,None,"material-mismatch"
        price_match=re.search(r"優惠價\s*[：:]\s*(?:NT\s*\$|NTD\s*|NT\$|\$)?\s*([\d,]+)",txt,re.I)
        minimum_match=re.search(r"底布含貼最低收費為\s*(\d+)\s*才",txt)
        size_match=re.search(r"尺寸\s*[：:]\s*(\d+(?:\.\d+)?)\s*[*×xX]\s*(\d+(?:\.\d+)?)",txt)
        photo,_=detail_picture(html)
        return item,{
            "material":actual_material,
            "priceTwd":int(price_match.group(1).replace(",","")) if price_match else None,
            "minimumCaiForPastedBacking":int(minimum_match.group(1)) if minimum_match else None,
            "sheetSize":(size_match.group(1)+" × "+size_match.group(2)+" 公分（每才）"
                         if size_match else "30 × 30 公分（每才）"),
            "productImage":photo,
            "inAllStores":bool(re.search(r"所在分店\s*[：:]\s*均有",txt)),
        },None
    except (HTTPError,URLError,TimeoutError,OSError,ValueError) as exc:
        return item,None,type(exc).__name__

def main():
    if not FILE.exists():
        raise FileNotFoundError("Missing Song Feng Ge brocade seed catalog")
    source=FILE.read_text(encoding="utf-8")
    meta=jsvalue(source,"SFG_BROCADE_CATALOG_META")
    items=jsvalue(source,"SFG_BROCADE_CATALOG_ITEMS")
    if (len(items)!=5 or len({x["name"] for x in items})!=5
        or len({x["productUrl"] for x in items})!=5):
        raise ValueError("Expected five unique official brocade products")
    if {x["name"]:x["material"] for x in items}!=EXPECTED_MATERIAL:
        raise ValueError("The official brocade materials differ from verified seed")
    errors=Counter()
    results=[]
    with ThreadPoolExecutor(max_workers=5) as pool:
        tasks=[pool.submit(parse_item,item) for item in items]
        for task in as_completed(tasks):
            item,verified,error=task.result()
            if error:
                errors[error]+=1
                continue
            for key in ("material","sheetSize","priceTwd","minimumCaiForPastedBacking","productImage"):
                if verified.get(key) is not None:
                    item[key]=verified[key]
            item["inAllStores"]=verified["inAllStores"]
            results.append({"name":item["name"],"material":item["material"],
                            "number":item["productNo"],"price":item["priceTwd"],
                            "photo":item.get("productImage")})
    meta["detailVerifiedCount"]=len(results)
    meta["priceCount"]=sum(isinstance(x.get("priceTwd"),int) for x in items)
    meta["photoCount"]=sum(bool(x.get("productImage")) for x in items)
    meta["errors"]=dict(errors)
    meta["catalogStatus"]="verified" if len(results)==5 else "partially-verified"
    out=(
        "/* 松風閣錦布5款（class=6）：官網款號、材質、價格與相符商品照片。 */\n"+
        "window.SFG_BROCADE_CATALOG_META="+json.dumps(meta,ensure_ascii=False,separators=(",",":"))+";\n"+
        "window.SFG_BROCADE_CATALOG_ITEMS="+json.dumps(items,ensure_ascii=False,separators=(",",":"))+";\n"
    )
    FILE.write_text(out,encoding="utf-8")
    print("Song Feng Ge brocade fabrics:",len(items),"items,",
          len(results),"verified details,",meta["priceCount"],"prices,",
          meta["photoCount"],"official photos, errors:",dict(errors),flush=True)
    print("Song Feng Ge brocade samples:",json.dumps(results,ensure_ascii=False),flush=True)

if __name__=="__main__":
    main()
