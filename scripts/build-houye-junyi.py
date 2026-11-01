import concurrent.futures as cf, hashlib, json, os, re, time
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
BASE='https://www.junyiacademy.org'
NAMES={5:'五',6:'六',7:'七',8:'八',9:'九',10:'十',11:'十一',12:'十二'}
cache={}
def uid(*a): return hashlib.sha256('|'.join(map(str,a)).encode()).hexdigest()[:16]
def fetch(url):
    if url in cache: return cache[url]
    for n in range(3):
        try:
            r=requests.get(url,timeout=25,headers={'User-Agent':'Mozilla/5.0 (compatible; LearningIndex/1.0)'})
            r.raise_for_status(); soup=BeautifulSoup(r.text,'html.parser'); cache[url]=soup; return soup
        except Exception as e:
            if n==2: print('FETCH FAILED',url,str(e),flush=True); return None
            time.sleep(n+1)
def cards(soup):
    if soup is None: return []
    out=[]
    for card in soup.select('[data-testid="topic-card"]'):
        a=next((a for a in card.select('a[href]') if '查看課程內容' in a.get_text(' ',strip=True)),None)
        if not a: continue
        title=card.select_one('div.css-1fxvrsu')
        if not title:
            icon=card.select_one('[data-testid="topic-card-icon"]')
            title=icon.parent.find_next_sibling() if icon and icon.parent else None
        name=title.get_text(' ',strip=True) if title else ''
        if name and a.get('href'): out.append((name,urljoin(BASE,a['href'])))
    return out
def sections(soup):
    result=[]
    if soup is None:return result
    for box in soup.select('[data-testid="section-card"]'):
        for ul in box.select(':scope > ul'):
            current=None
            for el in ul.find_all(recursive=False):
                head=el if 'MuiListSubheader-root' in el.get('class',[]) else el.select_one('li.MuiListSubheader-root')
                if head:
                    current={'title':head.get_text(' ',strip=True),'items':[]}; result.append(current)
                for a in el.select('a[href]'):
                    href=a.get('href',''); title=a.get_text(' ',strip=True)
                    if title and (href.startswith('/video/') or href.startswith('/videos/') or href.startswith('/exercise/')):
                        if current is None: current={'title':'課程教材','items':[]};result.append(current)
                        kind='練習' if '/exercise/' in href else '影片'
                        current['items'].append({'title':title,'kind':kind,'url':urljoin(BASE,href),'linkStatus':'direct'})
    return [x for x in result if x['items']]
def many(urls):
    unique=list(dict.fromkeys(urls)); print('Fetching',len(unique),'pages',flush=True)
    with cf.ThreadPoolExecutor(max_workers=12) as p: list(p.map(fetch,unique))
def symbol(name):
    for key,icon,color in [('數學','🔢','#3f81bb'),('國語','📖','#9c7ac4'),('英文','🔤','#cc8a42'),('英語','🔤','#cc8a42'),('自然','🔬','#3a947c'),('生物','🌱','#3a947c'),('物理','⚛️','#3a947c'),('化學','🧪','#3a947c'),('地球','🌏','#3a947c'),('社會','🗺️','#d18361'),('歷史','🏺','#d18361'),('地理','🌍','#d18361'),('公民','🏛️','#d18361')]:
        if key in name:return icon,color
    return '📚','#568d91'
def run():
    grades={g:f'{BASE}/topics/es-{g}th-grade' for g in NAMES}
    many(grades.values()); roots={g:cards(fetch(u)) for g,u in grades.items()}
    for g, subjects in roots.items():
        print('GRADE',g,'SUBJECTS',len(subjects),subjects,flush=True)
        if len(subjects)<3: raise RuntimeError(f'Grade {g} official index unavailable')
    many(u for ls in roots.values() for _,u in ls)
    # Official version selectors contain a 均一版 option; follow that version.
    chosen={}
    for g,subjects in roots.items():
        for name,url in subjects:
            choices=cards(fetch(url)); pick=next((u for t,u in choices if t.strip()=='均一版'),None)
            chosen[(g,name,url)]=pick or url
    many(chosen.values())
    # Course topics become groups. If a source already lists individual media, it is handled directly.
    group_urls=[]
    for url in chosen.values(): group_urls.extend(u for _,u in cards(fetch(url)))
    many(group_urls)
    # Fetch every subsection exposed by chapter indexes to retrieve the real video/exercise links.
    leaf_urls=[]
    for url in dict.fromkeys(group_urls): leaf_urls.extend(u for _,u in cards(fetch(url)))
    many(leaf_urls)
    os.makedirs('public/data',exist_ok=True)
    for grade,root in roots.items():
        db={'updated':time.strftime('%Y-%m-%d',time.gmtime()),'title':f'侯燁{NAMES[grade]}年級｜均一中文課程庫','scope':'依均一官方年級頁面與各科目索引整理；部分教材為跨年級共用。','subjects':[],'groups':[],'lessons':[],'extras':[{'title':'均一年級課程索引','url':grades[grade],'detail':'官方列出的年級科目，部分教材依學段共用。'},{'title':'均一教育平台官方 YouTube','url':'https://www.youtube.com/@JunyiAcademy','detail':'均一官方影片與延伸學習資源。'},{'title':'均一 × 酷課雲','url':'https://www.junyiacademy.org/topics/cooc','detail':'均一與臺北酷課雲合作教材。'}]}
        detail={'updated':db['updated'],'sourceDescription':'由均一官方課程目錄整理；若未列出個別教材，請從官方目錄繼續選課。','groups':[]}
        def addgroup(subject,title,url,sectionlist,childcards):
            gid='g'+uid(grade,subject,title,url); db['groups'].append({'id':gid,'subject':subject,'title':title,'url':url})
            dsections=[]
            if sectionlist:
                for sec in sectionlist:
                    items=sec['items']; dsections.append({'id':uid(sec['title']),'title':sec['title'],'items':items})
                    for item in items:
                        db['lessons'].append({'id':'l'+uid(grade,subject,gid,item['title'],item['url']),'subject':subject,'group':gid,'title':item['title'],'url':item['url'],'kind':'lesson','description':f"{sec['title']}｜均一官方{item['kind']}。"})
            else:
                for t,u in childcards:
                    lid='l'+uid(grade,subject,gid,t,u); db['lessons'].append({'id':lid,'subject':subject,'group':gid,'title':t,'url':u,'kind':'lesson','description':'進入均一官方單元，查看影片與練習。'})
                    leaf=sections(fetch(u)); items=[x for sec in leaf for x in sec['items']]
                    if not items: items=[{'title':t,'kind':'單元','url':u,'linkStatus':'chapter-navigation'}]
                    dsections.append({'id':uid(t),'title':t,'items':items})
                if not childcards:
                    db['lessons'].append({'id':'l'+uid(grade,subject,gid,title,url),'subject':subject,'group':gid,'title':title,'url':url,'kind':'chapter','description':'前往官方章節選擇教材。'})
                    dsections.append({'id':'index','title':title,'items':[{'title':'前往官方課程目錄','kind':'單元','url':url,'linkStatus':'chapter-navigation'}]})
            detail['groups'].append({'id':gid,'title':title,'url':url,'sections':dsections})
        for name,url in root:
            sid='s'+uid(name,url); icon,color=symbol(name); selected=chosen[(grade,name,url)]
            db['subjects'].append({'id':sid,'name':name,'icon':icon,'color':color,'entry':selected})
            source=fetch(selected); topsections=sections(source); topcards=cards(source)
            if topsections:
                for sec in topsections: addgroup(sid,sec['title'],selected,[sec],[])
            elif topcards:
                for title,groupurl in topcards:
                    page=fetch(groupurl); addgroup(sid,title,groupurl,sections(page),cards(page))
            else: addgroup(sid,name,selected,[],[])
        if len(db['lessons'])<10: raise RuntimeError(f'Grade {grade}: insufficient cards')
        for file,obj in [(f'public/data/houye-junyi-grade{grade}.json',db),(f'public/data/houye-junyi-grade{grade}-details.json',detail)]:
            with open(file,'w',encoding='utf8') as f:json.dump(obj,f,ensure_ascii=False,indent=2)
        print('BUILT',grade,'subjects',len(db['subjects']),'groups',len(db['groups']),'lessons',len(db['lessons']),'detail items',sum(len(s['items']) for g in detail['groups'] for s in g['sections']),flush=True)
if __name__=='__main__':run()
