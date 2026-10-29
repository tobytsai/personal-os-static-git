#!/usr/bin/env python3
"""Store 同行 Airtable attachment photos as durable, optimized GitHub Pages images."""
from pathlib import Path
from urllib.parse import urlsplit
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from datetime import datetime, timezone
import json, re
import requests
from PIL import Image, ImageOps

manifest=Path("scripts/peers-photo-import-input.json")
page=Path("public/pages/peers.html")
images=Path("public/images/peers")
report=Path("public/data/peers-photo-import-report.json")
allowed={"v5.airtableusercontent.com","airtableusercontent.com","dl.airtable.com"}
Image.MAX_IMAGE_PIXELS=40000000

def fetch(url):
    parsed=urlsplit(url)
    if parsed.scheme!="https" or parsed.hostname not in allowed:
        raise ValueError("Invalid source hostname")
    r=requests.get(url,timeout=(12,35),allow_redirects=False)
    r.raise_for_status()
    if r.is_redirect or len(r.content)>20000000: raise ValueError("Unexpected response")
    with Image.open(BytesIO(r.content)) as original:
        im=ImageOps.exif_transpose(original)
        im.thumbnail((1600,1600),Image.Resampling.LANCZOS)
        if im.mode not in ("RGB","L"): im=im.convert("RGB")
        out=BytesIO()
        im.save(out,"WEBP",quality=82,method=4)
        return out.getvalue()

def job(entry):
    rid,num,source=entry
    name=f"{rid}-{num:02d}.webp"
    dst=images/name
    local="../images/peers/"+name
    if dst.exists() and dst.stat().st_size>600: return rid,num,local,"cached"
    for url in (source.get("url",""),source.get("thumbnail","")):
        if not url: continue
        try:
            content=fetch(url)
            dst.write_bytes(content)
            return rid,num,local,"downloaded"
        except (requests.RequestException,OSError,ValueError):
            pass
    return rid,num,None,"failed"

def main():
    if not manifest.exists():
        print("No active import manifest")
        return
    source=json.loads(manifest.read_text(encoding="utf-8"))
    html=page.read_text(encoding="utf-8")
    match=re.search(r"(const records=)(\[[\s\S]*?\])(;\s*const el=)",html)
    if not match: raise RuntimeError("Missing records array")
    cards=json.loads(match.group(2))
    index={x["id"]:x for x in cards}
    work=[]
    for row in source["records"]:
        rid=row["id"]
        if not re.fullmatch(r"rec[A-Za-z0-9]{14}",rid) or rid not in index:
            raise ValueError("Unknown Airtable record ID")
        for i,photo in enumerate(row["images"],1): work.append((rid,i,photo))
    if not work: raise RuntimeError("No photos selected")
    images.mkdir(parents=True,exist_ok=True)
    done={}
    failures=[]
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures=[pool.submit(job,item) for item in work]
        for future in as_completed(futures):
            rid,num,local,state=future.result()
            if local: done.setdefault(rid,[]).append((num,local))
            else: failures.append({"record":rid,"image_index":num})
    if not done: raise RuntimeError("All photo downloads failed; manifest kept")
    for rid,paths in done.items():
        local=[p for _,p in sorted(paths)]
        index[rid]["image"]=local[0]
        index[rid]["images"]=local
    json_data=json.dumps(cards,ensure_ascii=False,separators=(",",":")).replace("</","<\\/")
    html=html[:match.start(2)]+json_data+html[match.end(2):]
    html=html.replace("Airtable 附件圖片採暫時網址，失效時會自動顯示文字圖示。","已匯入的圖片使用 GitHub 固定網址。")
    page.write_text(html,encoding="utf-8")
    report.parent.mkdir(parents=True,exist_ok=True)
    summary={"source":"Airtable 達利 → 同行","time_utc":datetime.now(timezone.utc).isoformat(),
       "record_count":len(cards),"source_photo_count":len(work),"source_records_with_photos":len(source["records"]),
       "persisted_photo_count":sum(len(v) for v in done.values()),"persisted_records":len(done),
       "failed":failures,"note":"Airtable original data is unchanged."}
    report.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    manifest.unlink()
    print("Persisted",summary["persisted_photo_count"],"of",len(work),"photos")

if __name__=="__main__":
    main()
