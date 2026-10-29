#!/usr/bin/env python3
"""Diagnose JS-rendered shared notes in a real browser without exporting note content."""
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
d=json.loads(Path("public/data/frame-tech-work.json").read_text(encoding="utf-8"))
cases=[x for x in d["items"] if any("app.yinxiang.com/fx/" in u for u in x["links"])]
out=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel="chrome",headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
    page=browser.new_page(viewport={"width":1360,"height":900},user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
    for item in cases[:3]:
        url=next(u for u in item["links"] if "app.yinxiang.com/fx/" in u)
        record={"id":item["id"]}
        responses=[]
        def log_response(res):
            if len(responses)<100:
                try: responses.append({"host":urlparse(res.url).hostname,"status":res.status,"type":res.headers.get("content-type","").split(";")[0]})
                except Exception: pass
        page.on("response",log_response)
        try:
            page.goto(url,wait_until="domcontentloaded",timeout=40000)
            page.wait_for_timeout(9500)
            meta=page.evaluate("""() => ({
               titleLength: document.title.length,
               textLength: (document.body?.innerText||'').length,
               hasLogin: /登录|登錄|sign in|log in/i.test(document.body?.innerText||''),
               hasUnavailable: /无法查看|無法查看|不存在|not found/i.test(document.body?.innerText||''),
               domImg: [...document.querySelectorAll('img')].map(img=>({
                 width:img.naturalWidth,height:img.naturalHeight,
                 currentHost: (()=>{try{return new URL(img.currentSrc||img.src).hostname}catch{return null}})(),
                 currentPathPrefix: (()=>{try{return new URL(img.currentSrc||img.src).pathname.slice(0,90)}catch{return null}})(),
                 altLength:(img.alt||'').length,
                 className: String(img.className).slice(0,80)
               })),
               iframes:document.querySelectorAll('iframe').length,
               imagesRendered:document.querySelectorAll('img').length,
               containerHints:[...document.querySelectorAll('[class*="note"],[class*="content"],main,article')].slice(0,12).map(el=>String(el.className).slice(0,60))
            })""")
            record.update(meta)
            record["responsesByHost"]={host:len([r for r in responses if r["host"]==host]) for host in {r["host"] for r in responses}}
            record["responsesErrors"]=[r for r in responses if r["status"]>=400][:6]
            record["totalResponses"]=len(responses)
        except Exception as e:
            record["error"]=type(e).__name__
            record["errorSummary"]=str(e).splitlines()[0][:160]
        out.append(record)
        page.remove_listener("response",log_response)
    browser.close()
Path("public/data/frame-note-browser-probe.json").write_text(json.dumps({"results":out},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(out,ensure_ascii=False,indent=2))
