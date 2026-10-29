#!/usr/bin/env python3
"""Enrich the Song Feng Ge matboard catalog from the original official pages.

The checked-in JS has a non-empty fallback of official color codes. Deployment
uses the actual category-1 listing and each matched official detail page to
add product IDs, material, official advertised price, and per-product photos.
No color is inferred from a code, and no unverified price/image is fabricated.
"""
from __future__ import annotations
import json
import re
import time
import unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlparse, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "public/data/songfeng-matboards.js"
DOMAIN = "sfg218.com"
LISTING = "https://sfg218.com/frame2.php?class=1"
START = "https://sfg218.com/frame2_class.php"
SIMULATION = "https://sfg218.com/simulation.php?Clear=Clear&winshow=no&df_pic=yes"
HEADERS = {"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
           "Accept-Language":"zh-TW,zh;q=0.9,en-US;q=0.5",
           "Accept":"text/html,application/xhtml+xml,*/*;q=0.8"}

def jsvalue(code, key):
    m=re.search(r"window\."+re.escape(key)+r"=(.+);(?:\r?\n|$)",code)
    if not m:
        raise RuntimeError("Missing matboard window data: "+key)
    return json.loads(m.group(1))

def canonical(url, must_be_detail=False):
    url=urljoin("https://sfg218.com/",unescape(str(url or "").strip()))
    p=urlparse(url)
    if p.scheme!="https" or p.hostname not in (DOMAIN,"www."+DOMAIN):
        return None
    if must_be_detail:
        q=parse_qs(p.query)
        if p.path!="/frame2_info.php" or q.get("class")!=["1"] or not (q.get("no") or [""])[0].isdigit():
            return None
        return "https://sfg218.com/frame2_info.php?class=1&no="+q["no"][0]
    return "https://sfg218.com"+p.path+("?"+p.query if p.query else "")

def gethtml(url,timeout=12):
    request=Request(url,headers=HEADERS,method="GET")
    with urlopen(request,timeout=timeout) as resp:
        content_type=resp.headers.get("Content-Type","").lower()
        if "html" not in content_type and "text/plain" not in content_type:
            raise ValueError("not HTML: "+content_type)
        data=resp.read(2_000_000)
    for charset in ("utf-8","big5","gb18030"):
        try:
            decoded=data.decode(charset)
            if "\ufffd" not in decoded:
                return decoded
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8","replace")

def code_of(text):
    s=unicodedata.normalize("NFKC",str(text or ""))
    m=re.search(r"卡紙[\s\u3000]*([0-9A-Za-z]+|黑)",s)
    return m.group(1).upper() if m else None

def parse_listing(html):
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,"html.parser")
    found={}
    for a in soup.find_all("a",href=True):
        url=canonical(a["href"],True)
        if not url: continue
        name=a.get_text(" ",strip=True)
        if not code_of(name):
            name=a.find("img").get("alt","") if a.find("img") else ""
        if not code_of(name) and a.parent:
            candidate=a.parent.get_text(" ",strip=True)
            if len(candidate)<60:name=candidate
        code=code_of(name)
        if code and code not in found: found[code]=url
    return found

def detail_picture(html):
    """Return only an image URL directly embedded in this official product page."""
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,"html.parser")
    candidates=[]
    for img in soup.find_all("img"):
        for src in (img.get("src"),img.get("data-src"),img.get("data-original"),
                    img.parent.get("href") if img.parent and img.parent.name=="a" else None):
            if not src:continue
            url=canonical(src)
            if not url:continue
            path=urlparse(url).path.lower()
            if not re.search(r"\.(?:jpe?g|png|webp)$",path):continue
            if any(x in path for x in ("logo","icon","header","banner","facebook","menu","arrow","captcha")):
                continue
            if "/admin/" in path and any(x in path for x in ("pic","image","photo","goods","frame","upload")):
                score=10+(8 if ("frame2" in path or "goods_pic" in path or "goods2" in path) else 0)
                candidates.append((score,url))
            elif "/upload/" in path and len(path)>20:
                candidates.append((7,url))
    # Embedded source URLs sometimes appear in style attributes or Javascript.
    if not candidates:
        for m in re.finditer(r"(?P<path>(?:https?://sfg218\.com)?/?admin/[\w./-]+\.(?:jpe?g|png|webp))",html,re.I):
            u=canonical(m.group("path"))
            if u and u not in (x[1] for x in candidates):
                candidates.append((4,u))
    # A detail page can have a thumbnail and a full image. Prefer the non-_s file.
    candidates.sort(key=lambda x:(-x[0],"_s." in x[1],x[1]))
    if not candidates:return None,[]
    allurls=list(dict.fromkeys(url for _,url in candidates))
    return candidates[0][1],allurls[:5]

def parse_detail(item):
    from bs4 import BeautifulSoup
    url=item.get("productUrl")
    try:
        html=gethtml(url,timeout=10)
        soup=BeautifulSoup(html,"html.parser")
        text=soup.get_text(" ",strip=True)
        if code_of(text)!=item["code"]:
            # text begins with menu, so check prominent H elements first.
            headings=" ".join(tag.get_text(" ",strip=True) for tag in soup.find_all(["h1","h2","h3"]))
            if code_of(headings)!=item["code"]:
                # Accept only if official title contains this exact code.
                title=soup.title.get_text(" ",strip=True) if soup.title else ""
                if code_of(title)!=item["code"]:
                    return item,None,[], "wrong-model"
        price_match=re.search(r"優惠價\s*[：:]\s*(?:NT\s*\$|NTD\s*|NT\$|\$)?\s*([\d,]+)",text,re.I)
        price=int(price_match.group(1).replace(",","")) if price_match else None
        mat_match=re.search(r"材質\s*[：:]\s*([^\s]{1,28})",text)
        material=mat_match.group(1) if mat_match else None
        if material and ("優惠" in material or "價格" in material):material=None
        image,others=detail_picture(html)
        result={"priceTwd":price,"material":material,"productImage":image}
        return item,result,others,None
    except (HTTPError,URLError,TimeoutError,OSError,ValueError) as exc:
        return item,None,[],type(exc).__name__

def main():
    if not FILE.exists():
        raise RuntimeError("Missing matboard seed catalog")
    source=FILE.read_text(encoding="utf-8")
    meta=jsvalue(source,"SFG_MATBOARD_CATALOG_META")
    items=jsvalue(source,"SFG_MATBOARD_CATALOG_ITEMS")
    if len(items)<65 or len({x["code"] for x in items})!=len(items):
        raise RuntimeError("Matboard seed catalog incomplete or duplicate")
    available={x["code"]:x for x in items}
    urls=[
        LISTING,
        "https://sfg218.com/frame2.php?class=1&page=2",
        "https://sfg218.com/frame2.php?page=2&class=1",
    ]
    found={};listing_errors=[]
    for url in urls:
        try:
            html=gethtml(url)
            matches=parse_listing(html)
            listing_errors.append({"url":url,"count":len(matches)})
            found.update(matches)
        except (HTTPError,URLError,TimeoutError,OSError,ValueError) as error:
            listing_errors.append({"url":url,"error":type(error).__name__})
    for code,url in found.items():
        if code in available:
            available[code]["productUrl"]=url
        else:
            new={"code":code,"name":"卡紙"+code,"id":"songfeng-matboard-"+code,
                 "number":"SF-KZ-"+str(len(items)+1).zfill(3),
                 "material":None,"priceTwd":None,"productUrl":url,"productImage":None}
            items.append(new)
            available[code]=new
    print("Song Feng Ge matboard listing:",listing_errors,"found distinct codes:",len(found),
          "seed:",len(items),flush=True)
    pending=[x for x in items if x.get("productUrl") and canonical(x.get("productUrl"),True)]
    issues=Counter(); with_image=0; with_price=0; detail_examples=[]
    # Fanout over concrete official detail URLs only, never guessing product IDs.
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs=[pool.submit(parse_detail,item) for item in pending]
        for job in as_completed(jobs):
            item,result,images,error=job.result()
            if error:
                issues[error]+=1
                continue
            if result.get("priceTwd") is not None:
                item["priceTwd"]=result["priceTwd"]
                with_price+=1
            if result.get("material"):
                item["material"]=result["material"]
            if result.get("productImage"):
                item["productImage"]=result["productImage"]
                with_image+=1
            if len(detail_examples)<4:
                detail_examples.append({"code":item["code"],"price":item["priceTwd"],
                        "material":item["material"],"photo":item.get("productImage"),
                        "imageCandidates":images})
    meta["count"]=len(items)
    meta["listedCount"]=len(found)
    meta["verifiedDetailCount"]=len(pending)-sum(issues.values())
    meta["priceCount"]=sum(isinstance(x.get("priceTwd"),int) for x in items)
    meta["photoCount"]=sum(bool(x.get("productImage")) for x in items)
    meta["catalogCheck"]="live-official-detail" if pending and not issues else "partial-live-with-official-fallback"
    output=(
        "/* 松風閣卡紙｜官方型錄，商品詳情連結、材質、單價與照片以官網核對；未核對資料留空。 */\n"
        "window.SFG_MATBOARD_CATALOG_META="+json.dumps(meta,ensure_ascii=False,separators=(",",":"))+";\n"
        "window.SFG_MATBOARD_CATALOG_ITEMS="+json.dumps(items,ensure_ascii=False,separators=(",",":"))+";\n"
    )
    FILE.write_text(output,encoding="utf-8")
    print("Song Feng Ge matboards:",len(items),"items, links:",len(pending),
          "priced:",meta["priceCount"],"official photos:",meta["photoCount"],
          "errors:",dict(issues),flush=True)
    print("Matboard detail samples:",json.dumps(detail_examples,ensure_ascii=False),flush=True)


def build_backing_fabric_photo():
    """Verify the sole official class-2 backing-fabric product and enrich its photo."""
    file = ROOT / "public/data/songfeng-backing-fabrics.js"
    if not file.exists():
        print("Song Feng Ge backing fabric: no source catalog; skipped", flush=True)
        return
    src = file.read_text(encoding="utf-8")
    meta = jsvalue(src, "SFG_BACKING_CATALOG_META")
    products = jsvalue(src, "SFG_BACKING_CATALOG_ITEMS")
    if len(products) != 1 or products[0].get("productNo") != "301":
        raise ValueError("Expected the single official backing-fabric product 301")
    item = products[0]
    url = "https://sfg218.com/frame2_info.php?class=2&no=147"
    if item.get("productUrl") != url:
        raise ValueError("Backing fabric source URL has unexpectedly changed")
    verified = False
    try:
        from bs4 import BeautifulSoup
        html = gethtml(url, timeout=12)
        soup = BeautifulSoup(html, "html.parser")
        name = soup.find("h1")
        name = name.get_text(" ", strip=True) if name else ""
        detail = soup.get_text(" ", strip=True)
        # A generic site image must not be mislabeled as this specific fabric.
        if name != "麻布" or not re.search(r"編號\s*[：:]\s*301\b", detail):
            raise ValueError("The official detail page does not match 麻布 / product 301")
        verified = True
        m = re.search(r"優惠價\s*[：:]\s*(?:NT\s*\$)?\s*([\d,]+)", detail, re.I)
        if m:
            item["priceTwd"] = int(m.group(1).replace(",", ""))
        m = re.search(r"最低收費\s*為?\s*(\d+)\s*才", detail)
        if m:
            item["minimumCai"] = int(m.group(1))
            meta["minimumCai"] = item["minimumCai"]
        image, candidates = detail_picture(html)
        if image and image.startswith("https://sfg218.com/"):
            item["productImage"] = image
        meta["officialPhotoCount"] = int(bool(item.get("productImage")))
        meta["photoStatus"] = ("official-verified" if item.get("productImage")
                               else "not-confirmed")
        meta["detailVerified"] = True
        print("Song Feng Ge backing fabric:", item["name"], "no:", item["productNo"],
              "price:", item["priceTwd"], "min cai:", item["minimumCai"],
              "photo:", item.get("productImage") or "not verified", flush=True)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        meta["detailVerified"] = False
        meta["photoStatus"] = "unavailable"
        print("Song Feng Ge backing fabric: official detail unavailable:",
              type(exc).__name__, str(exc)[:200], "; snapshot preserved", flush=True)

    output = (
        "/* 松風閣底布 class=2｜官方商品301；只用同一商品詳情頁的實品照片。 */\n"
        "window.SFG_BACKING_CATALOG_META=" + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.SFG_BACKING_CATALOG_ITEMS=" + json.dumps(products, ensure_ascii=False, separators=(",", ":")) + ";\n"
    )
    file.write_text(output, encoding="utf-8")
    if not verified:
        print("Song Feng Ge backing fabric: kept verified static snapshot", flush=True)

if __name__ == "__main__":
    main()
    build_backing_fabric_photo()
