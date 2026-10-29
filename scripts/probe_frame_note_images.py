#!/usr/bin/env python3
"""Diagnostic only: inspect publicly shared framing notes without saving private content."""
import json, requests
from pathlib import Path
from urllib.parse import urlparse
from bs4 import BeautifulSoup
D=json.loads(Path("public/data/frame-tech-work.json").read_text(encoding="utf-8"))
cases=[x for x in D["items"] if any("app.yinxiang.com/fx/" in u for u in x["links"])]
sample=[]
for index in [0,1,2,5,14,40]:
 if index<len(cases):sample.append(cases[index])
out=[]
for item in sample:
 u=next(u for u in item["links"] if "app.yinxiang.com/fx/" in u)
 row={"id":item["id"],"url_host":urlparse(u).hostname}
 try:
  r=requests.get(u,timeout=22,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125 Safari/537.36","Accept":"text/html,application/xhtml+xml"},allow_redirects=True)
  soup=BeautifulSoup(r.text,"html.parser")
  images=soup.find_all("img")
  row.update(status=r.status_code,final_host=urlparse(r.url).hostname,body_len=len(r.content),images=len(images),inline_images=sum(1 for i in images if i.get("src","").startswith("data:")),og_images=len(soup.select('meta[property="og:image"]')),script_count=len(soup.find_all("script")),title_chars=len(soup.title.get_text(strip=True)) if soup.title else 0,html_has_img_fragment="note-image" in r.text or "resource" in r.text,first_img_hosts=[urlparse(i.get("src") or i.get("data-src") or "").hostname for i in images[:5]])
 except Exception as e:
  row.update(error=type(e).__name__,detail=str(e)[:140])
 out.append(row)
print(json.dumps(out,ensure_ascii=False,indent=2))
Path("public/data/frame-note-probe.json").write_text(json.dumps({"results":out},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
