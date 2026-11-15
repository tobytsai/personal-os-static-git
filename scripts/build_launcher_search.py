from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse, urljoin
import json,re
ROOT=Path('public'); pages=ROOT/'pages'
class Extract(HTMLParser):
 def __init__(self): super().__init__(convert_charrefs=True); self.hidden=0; self.title=False; self.titles=[]; self.text=[]; self.scripts=[]; self.script=None
 def handle_starttag(self,tag,attrs):
  if tag in ('style','noscript'): self.hidden+=1
  elif tag=='script': self.script=[]
  elif tag=='title': self.title=True
 def handle_endtag(self,tag):
  if tag in ('style','noscript'): self.hidden=max(0,self.hidden-1)
  elif tag=='script' and self.script is not None: self.scripts.append(''.join(self.script)); self.script=None
  elif tag=='title': self.title=False
 def handle_data(self,data):
  if self.script is not None: self.script.append(data)
  elif not self.hidden:
   if self.title:self.titles.append(data)
   else:self.text.append(data)

def collect(v,out):
 if isinstance(v,str): out.append(v)
 elif isinstance(v,list):
  for i in v: collect(i,out)
 elif isinstance(v,dict):
  for k in ('name','title','desc','description','content','body','text','tags','category'): 
   if k in v: collect(v[k],out)

def clean(s):return re.sub(r'\s+',' ',s).strip()
records=[]
for file in sorted(pages.rglob('*.html')):
 try:
  parser=Extract();parser.feed(file.read_text(encoding='utf-8')); title=clean(' '.join(parser.titles)) or file.stem
  texts=[clean(' '.join(parser.text))]
  for script in parser.scripts:
   for match in re.finditer(r'\b(?:const|let|var)\s+\w+\s*=\s*(?=[\[{])',script):
    try:
     obj,_=json.JSONDecoder().raw_decode(script[match.end():]);collect(obj,texts)
    except (ValueError,RecursionError):pass
  text=clean(' '.join(texts)); path='./'+file.relative_to(ROOT).as_posix()
  if text:records.append({'name':title,'href':path,'search':text})
 except (UnicodeError, OSError,ValueError) as e:print('Skipping',file, e)
out=ROOT/'data'/'launcher-search-index.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'version':1,'pages':records},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Indexed',len(records),'public pages;',out.stat().st_size,'bytes')
