#!/usr/bin/env python3
"""Assign recognizable per-launcher bookmark icons to all published HTML pages."""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public"
ICONS = ROOT / "icons"
MAIN = set(["trends","info","ai","google","appsumo","database","miro","drive","social","swaruu","notes","entertainment","image-editing","finance","self-study","houye-art","stocks","cai-shifu","framing-business-model","work","podcast","colors","calendar","taoyuan-life","taipei-life","exhibitions","new-store","youtube","shopping","travel","gouache-work","listening","reading","community","music","video-editing","framing-materials","finished-examples","fb-frames","frame-tech-work","azhu","oil","peers","transport","highways","my-notes","character-simple","language","kids-youtube","math"])
ALIASES = {"simple-input":"character-simple","songfeng-frame-calculator":"framing-materials","certificate-frames":"framing-materials","flat-frames":"framing-materials","poster-frames":"framing-materials","oil-frames":"oil","finished-examples":"finished-examples","community-course-q-20261028":"community","framing-observations-taipei":"framing-business-model","takahashi-glossary":"finished-examples","chiayi-museum":"self-study","national-palace-museum":"self-study","natural-museum":"self-study","natural-museum-jade":"self-study","natural-museum-jade-project":"self-study","taipei-fine-arts-museum":"self-study","science-museum":"self-study","google":"google","reminder-cloud-help":"calendar","reminder-line-help":"calendar"}
PREFIX = (
    ("framing-observation-", "framing-business-model"),
    ("gouache-", "gouache-work"),
    ("self-study-", "self-study"),
    ("houye-", "self-study"),
    ("language-", "language"),
    ("kids-", "kids-youtube"),
    ("character-", "character-simple"),
    ("natural-museum-", "self-study"),
    ("metro-", "transport"),
    ("thsr-", "transport"),
    ("tra-", "transport"),
    ("oil-", "oil"),
)

def choose(page: Path) -> str:
    rel = page.relative_to(ROOT)
    if rel.parts[0] != "pages":
        return ALIASES.get(page.stem, "home")
    if len(rel.parts) > 2 and rel.parts[1] == "oil":
        return "oil"
    stem = page.stem
    if stem in MAIN:
        return stem
    if stem in ALIASES:
        return ALIASES[stem]
    for prefix, icon in PREFIX:
        if stem.startswith(prefix):
            return icon
    return "home"

def main() -> None:
    pages = sorted(ROOT.rglob("*.html"))
    if not pages:
        raise SystemExit("No HTML pages for launcher favicon injection")
    total = 0
    for page in pages:
        html = page.read_text(encoding="utf-8")
        icon_name = choose(page)
        icon = ICONS / f"{icon_name}.svg"
        if not icon.is_file():
            raise SystemExit(f"Missing icon {icon} for {page}")
        # Replace old generic favicon; do not disturb other head metadata.
        html = re.sub(
            r'<link\b(?=[^>]*\brel\s*=\s*["\x27](?:shortcut\s+)?icon["\x27])[^>]*>',
            "",
            html,
            flags=re.I,
        )
        href = Path(os.path.relpath(icon, page.parent)).as_posix() + "?v=20261104"
        html, n = re.subn(
            r'(<head\b[^>]*>)',
            lambda match: match.group(1) + '\n<link rel="icon" type="image/svg+xml" sizes="any" href="' + href + '">',
            html,
            count=1,
            flags=re.I,
        )
        if n != 1:
            raise SystemExit(f"Missing head element: {page}")
        page.write_text(html, encoding="utf-8")
        total += 1
    print(f"Installed custom favicon links for {total} HTML pages; {len(MAIN)} named launcher icons")

if __name__ == "__main__":
    main()
