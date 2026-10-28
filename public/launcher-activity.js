/* Personal OS — shared favorites and recent-history for subpages missing native features.
   Opt-in only: a page must include this script with data-cards (both) or data-mode="recent".
   Existing launcher-specific favorites and recent history are deliberately left untouched. */
(function(){
 "use strict";
 var script=document.currentScript;
 if(!script)return;
 var mode=script.dataset.mode==="recent"?"recent":"both";
 var selectors=(script.dataset.cards||"").trim();
 if(mode==="both"&&!selectors)return;
 var trackSelector=(script.dataset.track||"main a[href], .wrap a[href]").trim();
 var pinPlacement=script.dataset.pin==="bottom"?"bottom":"top";
 var page=(window.location.pathname.split("/").pop()||"launcher").replace(/\.html?$/i,"");
 var prefix="personal-os-activity-v1:"+page+":";
 var panelId="personal-os-activity";
 var entries=new Map();
 var favorites=load("favorites"),recents=load("recents").slice(0,10);
 var panel=null,parts=null;
 function valid(item){
  return item&&typeof item.key==="string"&&typeof item.name==="string"&&typeof item.url==="string"&&/^https?:\/\//i.test(item.url);
 }
 function load(kind){
  try{
   var result=JSON.parse(localStorage.getItem(prefix+kind)||"[]");
   if(!Array.isArray(result))return [];
   var seen=new Set();
   return result.filter(function(x){
    if(!valid(x)||seen.has(x.key))return false;
    seen.add(x.key);return true;
   }).slice(0,kind==="recents"?10:300);
  }catch(e){return []}
 }
 function save(kind,value){try{localStorage.setItem(prefix+kind,JSON.stringify(value))}catch(e){}}
 function normalizeHref(link){
  if(!link)return "";
  var raw=(link.getAttribute("href")||"").trim();
  if(!raw||raw.charAt(0)==="#"||/^(mailto|tel|javascript|data):/i.test(raw))return "";
  try{
   var u=new URL(raw,window.location.href);
   if(u.protocol!=="https:"&&u.protocol!=="http:")return "";
   if(u.origin===location.origin&&(/\/index\.html$/i.test(u.pathname)||/\/personal-os-static-git\/?$/i.test(u.pathname)))return "";
   return u.href;
  }catch(e){return ""}
 }
 function titleFor(node,link){
  var root=node||link;
  if(!root)return "未命名連結";
  var titles=["[data-activity-title]","h3","h2",".service-name",".product-name",".card-title",".platform-name",".name",".title",".entry-copy strong","strong"];
  for(var i=0;i<titles.length;i++){
   var el=root.querySelector&&root.querySelector(titles[i]);
   if(el&&el.textContent.trim())return el.textContent.trim().replace(/\s+/g," ").slice(0,90);
  }
  var sp=root.querySelector&&root.querySelector("span");
  var text=(sp&&sp.textContent.trim())||link.textContent.trim()||link.getAttribute("aria-label")||link.href;
  return text.replace(/\s+/g," ").trim().slice(0,90)||"開啟連結";
 }
 function makeItem(node,link){
  var url=normalizeHref(link);
  if(!url)return null;
  var name=titleFor(node,link);
  return {key:url+" :: "+name,name:name,url:url};
 }
 function create(tag,cls,text){
  var el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
 }
 function injectCSS(){
  if(document.getElementById("personal-os-activity-style"))return;
  var css=[
   ".po-activity{margin:17px 0 20px;color:#213b35;font-family:inherit;min-width:0}",
   ".po-activity *{box-sizing:border-box}",
   ".po-activity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
   ".po-activity-single{grid-template-columns:minmax(0,1fr)}",
   ".po-activity-section{min-width:0;border:1px solid #dfebe4;background:#ffffffeb;border-radius:18px;padding:15px 17px;box-shadow:0 7px 22px #294c3810}",
   ".po-activity-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}",
   ".po-activity-head h2{font:850 1rem/1.5 system-ui,sans-serif;margin:0;color:#2a5348}",
   ".po-activity-count{color:#6c8278;font-size:.77rem;font-weight:750;white-space:nowrap}",
   ".po-activity-chips{display:flex;flex-wrap:wrap;gap:7px;min-height:30px}",
   ".po-activity-chip{display:inline-flex;max-width:100%;align-items:center;min-width:0;background:white;border:1px solid #dfebe4;border-radius:12px;overflow:hidden}",
   ".po-activity-chip a{display:inline-block;max-width:min(100%,320px);padding:8px 10px;color:#247858;font-size:.82rem;font-weight:750;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
   ".po-activity-chip a:hover{text-decoration:underline}",
   ".po-activity-remove{border:0;border-left:1px solid #e7eee8;background:#fff9e4;color:#ba8e1c;min-height:34px;width:34px;flex:none;font-size:1.1rem;cursor:pointer}",
   ".po-activity-empty{margin:0;color:#718479;font-size:.83rem;line-height:1.6}",
   ".po-activity-note{margin:9px 1px 0;font-size:.75rem;color:#74877c}",
   ".po-activity-host{position:relative;min-width:0;height:100%}",
   ".po-activity-host>a{width:100%;height:100%}",
   ".po-activity-host:has(>a[hidden]){display:none!important}",
   ".po-activity-star{position:absolute;z-index:8;top:9px;right:9px;display:grid;place-items:center;width:34px;height:34px;border:1px solid #d9e7dc;border-radius:50%;background:#fff;color:#95a79b;font:800 23px/1 system-ui,sans-serif;box-shadow:0 2px 7px #243f2d20;cursor:pointer}",
   ".po-activity-bottom>.po-activity-star{top:auto;bottom:8px}",
   ".po-activity-star[aria-pressed=true]{background:#fff5d7;border-color:#ecd38b;color:#dc9f1b}",
   ".po-activity-star:focus-visible,.po-activity-remove:focus-visible,.po-activity-chip a:focus-visible{outline:3px solid #55b89b;outline-offset:2px}",
   "@media(max-width:700px){.po-activity-grid{grid-template-columns:minmax(0,1fr)}.po-activity-section{padding:13px 14px}}"
  ].join("\n");
  var style=create("style");
  style.id="personal-os-activity-style";style.textContent=css;
  document.head.appendChild(style);
 }
 function makeSection(title,kind){
  var section=create("section","po-activity-section");
  var head=create("div","po-activity-head");
  var heading=create("h2","",title);
  var count=create("span","po-activity-count","0");
  var chips=create("div","po-activity-chips");
  chips.setAttribute("aria-live","polite");
  head.append(heading,count);section.append(head,chips);
  parts[kind]={count:count,chips:chips};
  return section;
 }
 function installPanel(){
  if(document.getElementById(panelId))return;
  panel=create("section","po-activity");
  panel.id=panelId;panel.setAttribute("aria-label","啟動器收藏與最近開啟");
  parts={};
  var layout=create("div","po-activity-grid"+(mode==="recent"?" po-activity-single":""));
  if(mode==="both")layout.appendChild(makeSection("⭐ 我的收藏","favorites"));
  layout.appendChild(makeSection("🕘 最近開啟","recents"));
  panel.appendChild(layout);
  var note=create("p","po-activity-note","按卡片的 ☆ 收藏；最近開啟最多顯示 10 個不同項目。紀錄只保存在目前瀏覽器。");
  if(mode==="recent")note.textContent="最近開啟最多保留 10 個不同連結，紀錄只保存在目前瀏覽器。原有收藏功能維持不變。";
  panel.appendChild(note);
  var hero=document.querySelector("header.hero");
  if(hero&&hero.parentNode)hero.insertAdjacentElement("afterend",panel);
  else{
   var target=document.querySelector("main, .wrap")||document.body;
   target.insertBefore(panel,target.firstChild);
  }
  renderPanels();
 }
 function populate(kind,items){
  var target=parts[kind];
  if(!target)return;
  target.count.textContent=items.length+(kind==="recents"?" / 10":" 個");
  target.chips.replaceChildren();
  if(!items.length){
   target.chips.appendChild(create("p","po-activity-empty",kind==="favorites"?"還沒有收藏；點選下方卡片的 ☆ 就能加入。":"尚無紀錄；開啟一張卡片後就會出現在這裡。"));
   return;
  }
  items.forEach(function(item){
   var wrap=create("span","po-activity-chip");
   var a=create("a","",item.name);
   a.href=item.url;a.target="_blank";a.rel="noopener noreferrer";a.dataset.poActivityKey=item.key;
   a.title=item.name;
   wrap.appendChild(a);
   if(kind==="favorites"){
    var remove=create("button","po-activity-remove","★");
    remove.type="button";remove.dataset.poRemoveKey=item.key;
    remove.setAttribute("aria-label","取消收藏 "+item.name);
    wrap.appendChild(remove);
   }
   target.chips.appendChild(wrap);
  });
 }
 function renderPanels(){
  if(!parts)return;
  if(mode==="both")populate("favorites",favorites);
  populate("recents",recents);
 }
 function refreshStars(){
  document.querySelectorAll(".po-activity-star[data-po-star-key]").forEach(function(button){
   var active=favorites.some(function(x){return x.key===button.dataset.poStarKey});
   button.textContent=active?"★":"☆";
   button.setAttribute("aria-pressed",String(active));
   button.setAttribute("aria-label",(active?"取消收藏 ":"加入收藏 ")+(entries.get(button.dataset.poStarKey)?.name||"此項目"));
  });
 }
 function toggle(key){
  var item=entries.get(key)||favorites.find(function(x){return x.key===key});
  if(!item)return;
  var idx=favorites.findIndex(function(x){return x.key===key});
  if(idx>=0)favorites.splice(idx,1);else favorites.unshift(item);
  save("favorites",favorites);
  refreshStars();renderPanels();
 }
 function remember(item){
  if(!valid(item))return;
  entries.set(item.key,item);
  recents=[item].concat(recents.filter(function(x){return x.key!==item.key})).slice(0,10);
  save("recents",recents);
  renderPanels();
 }
 function decorate(){
  if(mode!=="both")return;
  document.querySelectorAll(selectors).forEach(function(card){
   if(card.dataset.poActivityReady==="1")return;
   var link=card.matches("a[href]")?card:card.querySelector("a[href]");
   if(!link)return;
   var item=makeItem(card,link);
   if(!item)return;
   entries.set(item.key,item);
   card.dataset.poActivityReady="1";
   card.dataset.poActivityKey=item.key;
   var host=card;
   if(card.tagName==="A"){
    host=create("div","po-activity-host");
    host.dataset.poActivityKey=item.key;
    if(card.parentNode){card.parentNode.insertBefore(host,card);host.appendChild(card)}
   }else{
    card.style.position="relative";
    host.classList.add("po-activity-host");
   }
   if(pinPlacement==="bottom")host.classList.add("po-activity-bottom");
   var button=create("button","po-activity-star");
   button.type="button";button.dataset.poStarKey=item.key;
   button.setAttribute("title","收藏／取消收藏 "+item.name);
   host.appendChild(button);
  });
  refreshStars();
 }
 function onClick(event){
  var target=event.target;
  if(!(target instanceof Element))return;
  var star=target.closest(".po-activity-star");
  if(star){event.preventDefault();event.stopPropagation();toggle(star.dataset.poStarKey);return}
  var remove=target.closest(".po-activity-remove");
  if(remove){event.preventDefault();event.stopPropagation();toggle(remove.dataset.poRemoveKey);return}
  var a=target.closest("a[href]");
  if(!a)return;
  var item=null;
  if(a.closest("#"+panelId)){
   var key=a.dataset.poActivityKey;
   item=favorites.find(function(x){return x.key===key})||recents.find(function(x){return x.key===key})||entries.get(key);
  }else if(mode==="both"){
   var owner=a.closest("[data-po-activity-key]");
   if(!owner)return;
   item=entries.get(owner.dataset.poActivityKey);
  }else{
   if(!a.matches(trackSelector)||a.classList.contains("back"))return;
   var container=a.closest(".card, article, .resource-card")||a;
   item=makeItem(container,a);
  }
  if(item)remember(item);
 }
 function installObservers(){
  if(mode!=="both")return;
  var roots=(script.dataset.watch||"").split(",").map(function(x){return x.trim()}).filter(Boolean);
  roots.forEach(function(css){
   var el=document.querySelector(css);
   if(!el)return;
   var queued=false;
   var ob=new MutationObserver(function(records){
    if(!records.some(function(r){return r.type==="childList"}))return;
    if(queued)return;
    queued=true;
    queueMicrotask(function(){queued=false;decorate()});
   });
   ob.observe(el,{childList:true});
  });
 }
 function boot(){
  injectCSS();installPanel();decorate();installObservers();
  document.addEventListener("click",onClick,true);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
 else boot();
})();