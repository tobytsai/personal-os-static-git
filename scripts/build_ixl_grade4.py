#!/usr/bin/env python3
"""Build a bilingual Grade 4 IXL skill index from IXL's own public US curriculum listings.

Never scrape exercises, answers or protected materials; this collects only index
metadata (public skill titles and links), and stores learner-friendly translated titles.
Fails closed: no replacement if expected source coverage cannot be verified.
"""
from __future__ import annotations
import concurrent.futures
import datetime
import html
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

OUT = Path("public/data/houye-ixl-grade4.json")
SUBJECTS = [
    ("math", "數學", "https://www.ixl.com/math/grade-4/skills", 330),
    ("ela", "英語語文", "https://www.ixl.com/ela/grade-4/skills", 190),
    ("science", "科學", "https://www.ixl.com/science/grade-4", 90),
    ("social-studies", "社會", "https://www.ixl.com/social-studies/grade-4", 75),
]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
ZH_SUBJECT = {
    "math": "數學",
    "ela": "英語語文",
    "science": "科學",
    "social-studies": "社會",
}
ZH_GROUPS = {
  "place value": "位值與大數", "comparing and ordering": "大小比較與排序",
  "rounding": "四捨五入與概數", "addition": "加法", "subtraction": "減法",
  "multiplication": "乘法", "division": "除法", "fractions": "分數",
  "decimals": "小數", "geometry": "幾何", "measurement": "測量",
  "data and graphs": "資料與圖表", "patterns": "數列與規律",
  "reading foundations": "閱讀基礎", "reading strategies": "閱讀策略",
  "writing strategies": "寫作策略", "grammar and mechanics": "文法與標點",
  "vocabulary": "字彙", "multisyllabic words": "多音節字",
  "main idea": "閱讀主旨", "inference": "推論",
  "properties of matter": "物質性質", "forces": "力與運動",
  "force and motion": "力與運動", "physical and chemical change": "物理與化學變化",
  "animals": "動物", "plants": "植物", "ecosystems": "生態系",
  "rocks and minerals": "岩石與礦物", "weather and climate": "天氣與氣候",
  "astronomy": "天文", "electricity": "電學",
  "geography": "地理", "read maps": "地圖閱讀",
  "government": "政府", "economics": "經濟",
  "native peoples of north america": "北美洲原住民族（延伸）",
  "american revolution": "美國獨立革命（延伸）",
}

def get_soup(url: str) -> BeautifulSoup:
    response = requests.get(url, timeout=40, headers=HEADERS, allow_redirects=True)
    response.raise_for_status()
    parsed = urlparse(response.url)
    if parsed.netloc not in ("www.ixl.com", "ixl.com"):
        raise ValueError(f"IXL redirected to regional site instead of US: {response.url}")
    return BeautifulSoup(response.text, "html.parser")

def clean_title(s: str) -> str:
    s = re.sub(r"\s+", " ", html.unescape(s or "")).strip()
    s = re.sub(r"^(?:New!\s*|[0-9]+\s+)+", "", s)
    return s.strip(" •")

def topic_for(anchor, code: str):
    tag = anchor.find_previous(re.compile("^h[2-5]$"))
    while tag is not None:
        title = clean_title(tag.get_text(" ", strip=True))
        if title and len(title) < 130 and not re.match(r"(?i)^(?:fourth grade|grade 4|skills|learning|recommendations|all grades)", title):
            found = re.match(r"^([A-Z])[\.\s]+(.+)$", title)
            return (found.group(1), found.group(2)) if found else ("", title)
        tag = tag.find_previous(re.compile("^h[2-5]$"))
    return ("", "Other fourth grade skills")

def collect(subject, url, minimum):
    soup = get_soup(url)
    pattern = re.compile(rf"^/(?:{re.escape(subject)})/grade-4/([^/?#]+)$")
    seen = set()
    skills = []
    for a in soup.select("a[href]"):
        href = a.get("href") or ""
        absurl = urljoin("https://www.ixl.com/", href)
        p = urlparse(absurl)
        if p.netloc not in ("www.ixl.com", "ixl.com"):
            continue
        m = pattern.match(p.path)
        if not m:
            continue
        slug = m.group(1)
        if slug in {"skills", "lessons", "videos", "games", "skill-plans", "recommendations"}:
            continue
        name = clean_title(a.get_text(" ", strip=True))
        if len(name) < 3 or len(name) > 210 or name.lower() in {"start", "practice", "new!"}:
            continue
        if slug in seen:
            continue
        seen.add(slug)
        letter, group = topic_for(a, subject)
        skills.append({
            "slug": slug, "english": name, "letter": letter,
            "topicEn": group, "url": "https://www.ixl.com" + p.path
        })
    if len(skills) < minimum:
        raise RuntimeError(f"{subject}: retrieved only {len(skills)} skills (< {minimum}); not publishing incomplete catalog")
    print(f"{subject}: {len(skills)} skill hrefs extracted from IXL", flush=True)
    return skills

def translate_chunk(texts):
    """Try Google's public translation endpoint for title metadata only."""
    query = "\n".join(texts)
    r = requests.get("https://translate.googleapis.com/translate_a/single",
                     params={"client": "gtx", "sl": "en", "tl": "zh-TW", "dt": "t", "q": query},
                     headers={"User-Agent": HEADERS["User-Agent"]}, timeout=35)
    r.raise_for_status()
    raw = r.json()
    output = "".join(part[0] for part in raw[0] if part and part[0])
    parts = [re.sub(r"\s+", " ", p).strip() for p in output.splitlines()]
    if len(parts) == len(texts) and all(parts):
        return parts
    raise ValueError(f"Translated segment count {len(parts)} != {len(texts)}")

def translate_one(text):
    for i in range(2):
        try:
            return translate_chunk([text])[0]
        except (requests.RequestException, ValueError, KeyError, IndexError):
            if i == 0:
                time.sleep(.3)
    return None

def translate_titles(values, preset):
    todo = [v for v in values if not v.get("title")]
    if not todo:
        return
    # Batch short metadata to reduce network and allow graceful fallback.
    batches, chunk = [], []
    for entry in todo:
        if len(chunk) >= 8 or sum(len(e["english"]) for e in chunk) + len(entry["english"]) > 520:
            if chunk:
                batches.append(chunk)
            chunk = []
        chunk.append(entry)
    if chunk:
        batches.append(chunk)

    def worker(batch):
        try:
            titles = translate_chunk([x["english"] for x in batch])
            return [(item, title) for item, title in zip(batch, titles)]
        except Exception:
            return [(item, translate_one(item["english"])) for item in batch]

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for pairs in pool.map(worker, batches):
            for item, zh in pairs:
                if zh:
                    item["title"] = zh
                    item["translationStatus"] = "machine"
                else:
                    # Preserve an explicit marker for entries that still require a Chinese translation.
                    item["title"] = "待翻譯｜" + item["english"]
                    item["translationStatus"] = "pending"
    print(f"Machine translations: {sum(v.get('translationStatus') == 'machine' for v in values)}", flush=True)

def main():
    old = json.loads(OUT.read_text(encoding="utf-8"))
    preset = {(s["subject"], s["english"].lower().strip()): s
              for s in old.get("skills", []) if s.get("title") and not s["title"].startswith("待翻譯")}
    allskills, categories, subjects = [], [], []
    for subject, label, url, min_count in SUBJECTS:
        skills = collect(subject, url, min_count)
        subjects.append({"id": subject, "name": label, "url": url.replace("/skills", "")})
        group_index = {}
        for i, entry in enumerate(skills, 1):
            letter = entry["letter"] or "Z"
            group_en = entry["topicEn"]
            key = (letter, group_en)
            if key not in group_index:
                group_index[key] = len(group_index) + 1
            g_id = f"{subject}-{letter}-{group_index[key]}"
            if not any(c["id"] == g_id for c in categories):
                group_zh = ZH_GROUPS.get(group_en.lower().strip(), None)
                categories.append({"id":g_id, "subject":subject, "code":letter,
                                   "titleZh":group_zh or ("單元："+group_en), "english":group_en})
            found = preset.get((subject, entry["english"].lower().strip()))
            item = {
                "id": f"{subject}-{entry['slug']}",
                "subject":subject,
                "category":g_id, "code":f"{letter}.{i}",
                "title":(found or {}).get("title"),
                "english":entry["english"],
                "url":entry["url"],
                "linkStatus":"verified",
                "type":"延伸（美國史）" if subject=="social-studies" and bool(re.search(
                    r"american|u.s.|war|coloni|slavery|civil rights|president|constitution|revolution",
                    group_en+" "+entry["english"], re.IGNORECASE)) else "練習",
                "translationStatus":"curated" if found else None
            }
            allskills.append(item)

    translate_titles(allskills, preset)
    result = {
        "updated": datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
        "source": "IXL US Grade 4 official skill indexes",
        "coverage": "按 IXL 官方課程頁面擷取技能名稱與原始 href；題目中文翻譯僅為自學輔助。",
        "officialTotals": {s: sum(x["subject"] == s for x in allskills) for s,*_ in SUBJECTS},
        "subjects": subjects,
        "categories": categories,
        "skills": allskills,
        "notes": [
            "直達原始網址由 IXL 技能清單內的 href 擷取，非自行猜測網址。",
            "中文翻譯非 IXL 官方翻譯，原始英文題名與頁面連結保留供比對。",
            "美國社會歷史、政府制度不等於臺灣四年級課綱。",
            "本網站的手動完成進度不等於 IXL SmartScore；登入 IXL 才能保存 IXL 官方分數。"
        ]
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n",encoding="utf-8")
    print(f"Wrote {len(allskills)} skills and {len(categories)} topic groups to {OUT}", flush=True)

if __name__ == "__main__":
    main()
