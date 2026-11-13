/* Personal OS 2.0: keyboard-first commands. Runs on the homepage only. */
(()=>{
  'use strict';
  const field=document.getElementById('q');
  const resultBox=document.getElementById('command-results');
  const hint=document.getElementById('command-hint');
  if(!field||!resultBox||!hint)return;
  let independentSites=[],independentLoaded=false;
  let matches=[],selected=0;
  const lower=s=>String(s||'').toLocaleLowerCase('zh-TW');
  const isTyping=el=>!!(el&&(el.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el.tagName)));
  function safeHref(raw){
    try{const u=new URL(raw,location.href);if(u.protocol==='https:'||u.protocol==='http:'||u.origin===location.origin)return u.href;}catch(e){}
    return null;
  }
  const quickLinks=[...document.querySelectorAll('.quick-links a.quick-link')].map((el,i)=>({
    type:'常用連結',name:el.getAttribute('aria-label')||el.textContent.trim(),href:el.href,
    search:el.textContent,element:el,priority:70-i
  }));
  function entries(){
    const launcher=(typeof tools==='undefined'?[]:tools).map(t=>({
      type:'彩色啟動器',name:t.name,search:t.name+' '+t.cat,tool:t,priority:30
    }));
    return quickLinks.concat(launcher,independentSites);
  }
  function command(text){
    const match=/^(g|yt|t)\s+(.+)$/i.exec(text);
    return match?{kind:match[1].toLowerCase(),value:match[2].trim()}:null;
  }
  function score(item,text){
    const name=lower(item.name),search=lower(item.search);
    if(name===text)return 1000+item.priority;
    if(name.startsWith(text))return 600+item.priority;
    if(name.includes(text))return 300+item.priority;
    if(search.includes(text))return 100+item.priority;
    return -1;
  }
  function rank(text){
    const query=lower(text.trim());
    if(!query)return [];
    return entries().map(item=>({item,score:score(item,query)}))
      .filter(r=>r.score>=0).sort((a,b)=>b.score-a.score)
      .slice(0,8).map(r=>r.item);
  }
  function runCommand(cmd){
    if(!cmd||!cmd.value)return;
    if(cmd.kind==='g'||cmd.kind==='yt'){
      const url=cmd.kind==='g'?'https://www.google.com/search?q=':'https://www.youtube.com/results?search_query=';
      window.open(url+encodeURIComponent(cmd.value),'_blank','noopener,noreferrer');
    }else if(cmd.kind==='t'){
      const input=document.getElementById('reminder-quick-input');
      const form=document.getElementById('reminder-quick-form');
      if(!input||!form)return;
      input.value=cmd.value;
      field.value='';
      field.dispatchEvent(new Event('input',{bubbles:true}));
      const content=document.getElementById('reminder-content');
      const toggle=document.getElementById('reminder-toggle');
      if(content&&content.hidden&&toggle)toggle.click();
      form.requestSubmit();
      input.focus();
    }
  }
  function launch(item){
    if(item.tool){remember(item.tool);return;}
    if(item.element){item.element.click();return;}
    const href=safeHref(item.href);
    if(!href)return;
    if(new URL(href).origin===location.origin){location.assign(href);}
    else window.open(href,'_blank','noopener,noreferrer');
  }
  function clearResults(){
    resultBox.hidden=true;resultBox.replaceChildren();
    field.setAttribute('aria-expanded','false');
  }
  function render(){
    const raw=field.value.trim();
    const cmd=command(raw);
    selected=0;
    matches=cmd?[]:rank(raw);
    resultBox.replaceChildren();
    if(!raw){
      hint.textContent='按 / 或 Ctrl / ⌘ + K 搜尋；Enter 開啟第一筆。Alt + 1～9 快速開啟常用連結。';
      clearResults();return;
    }
    let items=matches;
    if(cmd){
      const label={g:'Google 搜尋',yt:'YouTube 搜尋',t:'新增提醒'}[cmd.kind];
      hint.textContent='Enter 執行：'+label;
      items=[{type:'指令',name:label+'：'+cmd.value,command:cmd}];
    }else{
      hint.textContent=matches.length?'↑ ↓ 選擇，Enter 開啟第一筆，Esc 清除搜尋':(independentLoaded?'找不到結果':'正在查詢獨立站入口…');
    }
    matches=items;
    resultBox.hidden=false;
    if(!items.length){
      const empty=document.createElement('p');empty.className='command-empty';
      empty.textContent=independentLoaded?'沒有相符入口；也可以前往獨立站啟動器搜尋。':'正在載入獨立站清單…';
      resultBox.append(empty);field.setAttribute('aria-expanded','true');return;
    }
    items.forEach((item,i)=>{
      const b=document.createElement('button');b.type='button';b.className='command-option';
      if(i===selected)b.classList.add('selected');
      b.setAttribute('role','option');b.setAttribute('aria-selected',String(i===selected));
      const name=document.createElement('strong'),kind=document.createElement('small');
      name.textContent=item.name;kind.textContent=item.type;
      b.append(name,kind);b.onclick=()=>item.command?runCommand(item.command):launch(item);
      resultBox.append(b);
    });
    field.setAttribute('aria-expanded','true');
  }
  function navigate(delta){
    if(!matches.length)return;
    selected=(selected+delta+matches.length)%matches.length;
    [...resultBox.querySelectorAll('.command-option')].forEach((b,i)=>{
      b.classList.toggle('selected',i===selected);
      b.setAttribute('aria-selected',String(i===selected));
      if(i===selected)b.scrollIntoView({block:'nearest'});
    });
  }
  field.addEventListener('input',render);
  field.addEventListener('focus',()=>{if(field.value.trim())render();});
  field.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();navigate(e.key==='ArrowDown'?1:-1);return;}
    if(e.key==='Enter'){
      const item=matches[selected];if(!item)return;
      e.preventDefault();item.command?runCommand(item.command):launch(item);
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented||e.isComposing)return;
    if((e.ctrlKey||e.metaKey)&&lower(e.key)==='k'){
      e.preventDefault();field.focus();field.select();return;
    }
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!isTyping(e.target)){
      e.preventDefault();field.focus();field.select();return;
    }
    if(e.key==='Escape'&&document.activeElement===field){
      e.preventDefault();field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));field.blur();return;
    }
    if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!isTyping(e.target)&&/^[1-9]$/.test(e.key)){
      const link=quickLinks[Number(e.key)-1];if(link){e.preventDefault();link.element.click();}
    }
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.search'))clearResults();
  });
  // Read only the public static index of independently hosted sites.
  fetch('./pages/independent-sites.html',{cache:'force-cache'})
    .then(r=>{if(!r.ok)throw Error('index unavailable');return r.text();})
    .then(html=>{
      const doc=new DOMParser().parseFromString(html,'text/html');
      independentSites=[...doc.querySelectorAll('.site-card')].map(card=>{
        const a=card.querySelector('a.open'),name=card.querySelector('h2')?.textContent.trim();
        if(!name||!a||!safeHref(a.getAttribute('href')))return null;
        return {type:'獨立站',name,href:a.getAttribute('href'),search:card.dataset.search||name,priority:50};
      }).filter(Boolean);
    })
    .catch(()=>{independentSites=[];})
    .finally(()=>{independentLoaded=true;if(field.value.trim())render();});
  render();
})();
