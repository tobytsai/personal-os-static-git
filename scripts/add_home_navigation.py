"""Add a home link to launcher HTML pages that do not already provide one."""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
import os
import re

ROOT = Path('public')
PAGES = ROOT / 'pages'
ORIGIN = 'https://tobytsai.github.io'
HOME = '/personal-os-static-git/'

class HomeLinks(HTMLParser):
    def __init__(self, page_url):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.found = False

    def handle_starttag(self, tag, attrs):
        if tag != 'a':
            return
        attrs = dict(attrs)
        href = attrs.get('href') or ''
        url = urlparse(urljoin(self.page_url, href))
        if url.scheme in ('http', 'https') and url.netloc == 'tobytsai.github.io':
            if url.path in (HOME, HOME.rstrip('/'), HOME + 'index.html'):
                self.found = True

added = existing = 0
for page in sorted(PAGES.rglob('*.html')):
    html = page.read_text(encoding='utf-8')
    if 'data-personal-os-home-nav' in html:
        existing += 1
        continue
    checker = HomeLinks(ORIGIN + HOME + page.relative_to(ROOT).as_posix())
    checker.feed(html)
    if checker.found:
        existing += 1
        continue
    target = os.path.relpath(ROOT / 'index.html', page.parent).replace(os.sep, '/')
    nav = ('\n<nav data-personal-os-home-nav aria-label="返回啟動器首頁" '
           'style="display:block;position:relative;z-index:10;padding:12px 16px;'
           'text-align:left;font-family:system-ui,-apple-system,sans-serif;line-height:1.4">'
           '<a href="' + escape(target, quote=True) + '" '
           'style="display:inline-flex;align-items:center;min-height:44px;padding:9px 15px;'
           'border:1px solid #b9d4c8;border-radius:999px;background:#fff;color:#174d3b;'
           'font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 2px 9px #17392f19">'
           '← 回到啟動器首頁</a></nav>\n')
    html, count = re.subn(r'(<body\b[^>]*>)', lambda m: m.group(1) + nav, html, count=1, flags=re.I)
    if not count:
        print('No body found; skipped:', page)
        continue
    page.write_text(html, encoding='utf-8')
    added += 1
print(f'Home navigation: added {added}; existing {existing}')
