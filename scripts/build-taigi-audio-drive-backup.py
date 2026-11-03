#!/usr/bin/env python3
"""Make an unchanged-MP3 archive of verified MOE Taiwanese audio for Drive backup."""
import concurrent.futures
import hashlib
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "public/data/taigi-audio-verified.json"
OUTPUT = ROOT / "backup-output"
OUTPUT.mkdir(exist_ok=True)
ZIP = OUTPUT / "taigi-verified-audio.zip"
info = json.loads(MANIFEST.read_text(encoding="utf-8"))
rev = info["sourceRevision"]
files = sorted({row["filename"] for row in info["items"]})
base = f"https://raw.githubusercontent.com/yazelin/mandarin-taigi/{rev}/assets/audio/"

def fetch_file(filename):
    url = base + urllib.parse.quote(filename, safe="")
    errors = []
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "PersonalOS-TaigiAudioBackup/1.0"})
            with urllib.request.urlopen(request, timeout=35) as response:
                content = response.read()
            if len(content) < 1000 or not (content[:3] == b"ID3" or (content[0] == 0xff and content[1] & 0xe0 == 0xe0)):
                raise ValueError(f"Not a valid MP3: {filename} ({len(content)} bytes)")
            return filename, content, hashlib.sha256(content).hexdigest(), ""
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            errors.append(str(exc))
            if attempt < 2:
                time.sleep(attempt + 1)
    return filename, b"", "", "; ".join(errors)

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(fetch_file, files))
success = {n: (payload, sha) for n, payload, sha, error in results if payload}
fail = [{"filename": n, "error": error} for n, payload, sha, error in results if not payload]
summary = {
    "source_revision": rev,
    "declared_records": len(info["items"]),
    "declared_unique_files": len(files),
    "verified_files_downloaded": len(success),
    "download_errors": fail,
    "recordings": [{**r, "archived":r["filename"] in success} for r in info["items"]],
    "sha256": {n: value[1] for n, value in success.items()},
}
(OUTPUT / "taigi-verified-audio-report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
with zipfile.ZipFile(ZIP, "w", compression=zipfile.ZIP_STORED) as archive:
    archive.write(MANIFEST, "taigi-audio-verified.json")
    archive.write(OUTPUT / "taigi-verified-audio-report.json", "taigi-verified-audio-report.json")
    archive.writestr("SOURCE-LICENSE.txt", (
        "Original, unmodified audio from Taiwan's Ministry of Education Taiwanese Taigi Dictionary.\n"
        "License: CC BY-ND 3.0 TW https://sutian.moe.edu.tw/zh-hant/piantsip/pankhuan-singbing/\n"
        "Source https://sutian.moe.edu.tw/zh-hant/ ; backup mirror https://github.com/yazelin/mandarin-taigi\n"
    ))
    for name, (payload, sha) in sorted(success.items()):
        archive.writestr("audio/" + name, payload)
print(json.dumps({k:v for k,v in summary.items() if k!="recordings" and k!="sha256"}, ensure_ascii=False, indent=2))
if not success:
    raise RuntimeError("No audio downloaded; archive cannot be used")
