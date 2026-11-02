#!/usr/bin/env python3
"""Daily YouTube Taiwan popularity via official API; never log API key.
Since July 2025 mostPopular is chiefly music, movies, gaming, not all YouTube.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json, os, re

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"public"/"data"
LATEST=DATA/"youtube-taiwan-latest.json"
HISTORY=DATA/"youtube-taiwan-history"
LOCAL=timezone(timedelta(hours=8))

def read_json(path):
    try:
        value=json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value,dict) else {}
    except (FileNotFoundError,json.JSONDecodeError):
        return {}

def write_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
    secret=os.getenv("YOUTUBE_API_KEY","").strip()
    if not secret:
        print("::notice::YOUTUBE_API_KEY is not configured; ranking snapshot unchanged.")
        return
    now=datetime.now(timezone.utc)
    day=now.astimezone(LOCAL).date()
    prev_date=(day-timedelta(days=1)).isoformat()
    prev=read_json(HISTORY/(prev_date+".json"))
    compared=prev.get("date_taipei")==prev_date
    old_ranks={v.get("video_id"):v.get("rank") for v in prev.get("items",[]) if isinstance(v,dict)} if compared else {}
    query=urlencode({"part":"snippet,statistics","chart":"mostPopular","regionCode":"TW","maxResults":"50","key":secret})
    req=Request("https://www.googleapis.com/youtube/v3/videos?"+query,headers={"Accept":"application/json","User-Agent":"PersonalOS-YouTubeRadar/1.0"})
    try:
        with urlopen(req,timeout=35) as r:
            raw=r.read(1500001)
        if len(raw)>1500000:
            raise RuntimeError("Response too large")
        result=json.loads(raw)
    except Exception:
        # Do not print request URL since it contains the private API key.
        raise RuntimeError("YouTube API fetch failed; verify access, quota and API key.") from None
    rows=result.get("items") if isinstance(result,dict) else None
    if not isinstance(rows,list) or not rows:
        raise RuntimeError("No verified YouTube rankings received; previous snapshot preserved.")
    items=[]
    for row in rows:
        if not isinstance(row,dict): continue
        ident=row.get("id","")
        if not isinstance(ident,str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}",ident): continue
        snippet=row.get("snippet") or {}
        statistics=row.get("statistics") or {}
        title=str(snippet.get("title","")).strip()[:220]
        if not title: continue
        try: views=int(statistics.get("viewCount",0))
        except (TypeError,ValueError): views=0
        rank=len(items)+1
        former=old_ranks.get(ident)
        items.append({
            "rank":rank,"video_id":ident,"title":title,
            "channel_title":str(snippet.get("channelTitle","")).strip()[:140],
            "published_at":str(snippet.get("publishedAt",""))[:32],
            "view_count":max(0,views),
            "rank_change":former-rank if isinstance(former,int) else None
        })
    if len(items)<5:
        raise RuntimeError("Too few valid YouTube entries; preserving older snapshot.")
    output={
        "schema_version":1,"status":"ok",
        "date_taipei":day.isoformat(),
        "updated_at_utc":now.isoformat(timespec="seconds"),
        "region_code":"TW",
        "source":"YouTube Data API v3 videos.list(chart=mostPopular, regionCode=TW)",
        "scope":"音樂／電影／遊戲為主；不是所有台灣 YouTube 影片的完整熱門榜",
        "comparison_date":prev_date if compared else "",
        "items":items
    }
    write_json(LATEST,output)
    write_json(HISTORY/(day.isoformat()+".json"),output)
    for old in sorted(HISTORY.glob("????-??-??.json"),reverse=True)[30:]: old.unlink()
    print("Saved",len(items),"Taiwan YouTube chart rows for",day.isoformat())

if __name__=="__main__":
    main()
