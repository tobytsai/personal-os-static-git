#!/usr/bin/env python3
"""Generate local, playable MP3 word pronunciations for Word Blossom English Island.

Runs during the GitHub Pages build; does not depend on external speech APIs.
"""
import json
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'data' / 'english-learning-island.json'
DEST = ROOT / 'public' / 'audio' / 'english-island'
VALID_WORD = re.compile(r'[a-z]{1,32}\Z')


def build_word(word: str):
    out = DEST / (word + '.mp3')
    if out.exists() and out.stat().st_size > 750:
        return (word, 'cached', out.stat().st_size)
    with tempfile.TemporaryDirectory(prefix='island-audio-') as tmp:
        wav = Path(tmp) / 'word.wav'
        mp3 = Path(tmp) / 'word.mp3'
        subprocess.run(['espeak', '-v', 'en-us', '-s', '125', '-p', '48', '-a', '160', '-w', str(wav), word], check=True, capture_output=True, timeout=15)
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav), '-codec:a', 'libmp3lame', '-qscale:a', '7', '-ar', '22050', str(mp3)], check=True, capture_output=True, timeout=15)
        if mp3.stat().st_size <= 750:
            raise RuntimeError(f'Too-small generated audio: {word} ({mp3.stat().st_size} bytes)')
        mp3.replace(out)
    return (word, 'generated', out.stat().st_size)


def main():
    data = json.loads(SOURCE.read_text(encoding='utf-8'))
    words = {str(item['word']).lower() for item in data['words']}
    for petals in data.get('examples', {}).values():
        words.update(str(item['word']).lower() for item in petals)
    bad = sorted(w for w in words if not VALID_WORD.fullmatch(w))
    if bad:
        raise SystemExit(f'Unexpected English word filename(s): {bad}')
    DEST.mkdir(parents=True, exist_ok=True)
    results = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        future_map = {pool.submit(build_word, word): word for word in sorted(words)}
        for future in as_completed(future_map):
            results.append(future.result())
    generated = sum(item[1] == 'generated' for item in results)
    size = sum(item[2] for item in results)
    print(f'English island MP3 files: {len(results)} total, {generated} generated, total {size:,} bytes')
    missing = [w for w in words if not (DEST / (w + '.mp3')).exists()]
    if missing:
        raise SystemExit(f'Missing audio: {missing}')


if __name__ == '__main__':
    main()
