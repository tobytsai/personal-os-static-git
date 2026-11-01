/* AppSumo launcher: public-safe product names; activation details stay in the local browser.
   Loaded after appsumo.html's inline script. No license codes are stored or published. */
(function(){
"use strict";
const gmailUrl="../data/appsumo-confirmed-purchases.json";
const officialUrl="../data/appsumo-official-products.json";
const account="https://appsumo.com/account/products/";
const storage="toby-appsumo-official-csv-v1";
const history=new Set(),official=new Map(),local=new Map();
let gmailReady=false,officialReady=false;
const groups={
 "自動化與資料":["BrowserAct","Albato","TaskMagic","SheetMagic","Blue","Boost.space","AITable.ai","Retable","Buildin","ContextMinds","tabExtend","Rows","Stackby"],
 "學習與課程":["Mini Course Generator","OnlineCourseHost.com"],
 "行銷與曝光":["ClickRank","Swipe One","Launch Cart","Brilliant Directories","Postaga","KeywordGap","Marky","SkyRocket Reviews","Boostramp","Grawt","Evolup","SleekBio","ShortySMS","SendFox","KingSumo","EmailBadge"],
 "影音與設計":["Sticker Mule Pro","VoiSpark","JoggAI","SellerPic","Disctopia","Remo","Radiolize","Boardmix","EaseUS VoiceWave","Hipclip","DocTunes","MediaPlace","TextSniper","Fourie","Yay Images","Wideo","Pixelied","Utrrr Text To Speech"],
 "網站與營運":["Dart","Brizy Cloud","WebWave","Wondr AI","Support Board","FuseBase","Spotely","PlanPros.ai","Cmaps","Ahsuite Client Portals","GOOSE VPN","Pagemaker","Dukaan","Trafft"],
 "AI 與內容":["Video To Blog","CopyClipper","Letterly","Blogify","Waspnote","Afforai","Exemplary AI","Fliki","Katteb","ClickMinded AI Marketing Toolkit","NoteDex"]
};
const verifiedSites={
 "Buildin":"https://buildin.ai/",
 "BrowserAct":"https://www.browseract.com/",
 "VoiSpark":"https://voispark.com/",
 "Albato":"https://albato.com/",
 "Video To Blog":"https://videotoblog.ai/",
 "OnlineCourseHost.com":"https://onlinecoursehost.com/",
 "Brilliant Directories":"https://www.brilliantdirectories.com/",
 "ClickRank":"https://www.clickrank.ai/",
 "JoggAI":"https://www.jogg.ai/",
 "CopyClipper":"https://copyclipper.com/",
 "Letterly":"https://letterly.app/",
 "SellerPic":"https://sellerpic.ai/",
 "TaskMagic":"https://taskmagic.com/",
 "SheetMagic":"https://sheetmagic.ai/",
 "Swipe One":"https://www.swipeone.com/",
 "PlanPros.ai":"https://planpros.ai/",
 "Ahsuite Client Portals":"https://ahsuite.com/",
 "GOOSE VPN":"https://goosevpn.com/",
 "Stackby":"https://stackby.com/",
 "Rows":"https://rows.com/",
 "TextSniper":"https://textsniper.app/",
 "EmailBadge":"https://emailbadge.com/",
 "Brizy Cloud":"https://www.brizy.io/"
};
const aliases={
 "pxltoplusexclusive":"pxl","pxlto":"pxl",
 "albatoplusexclusive":"albato","blueplusexclusive":"blue",
 "booltoolplusexclusive":"booltool","sleekbioplusexclusive":"sleekbio",
 "shortysmsplusexclusive":"shortysms","sendfoxplusexclusive":"sendfox",
 "kingsumoplusexclusive":"kingsumo","emailbadgeplusexclusive":"emailbadge",
 "thesauceplusexclusive":"thesauce","kattebfactcheckedaiwriter":"katteb",
 "soundwiseessentialsplan":"mysoundwise","yayimagesstartups":"yayimages",
 "textsniperocrsimplified":"textsniper","appsumoconnectbetaplusexclusive":"appsumoconnectbeta"
};
const kindNames={software:"軟體",membership:"會員／服務",resource:"教材／素材",bundle:"套裝"};
const kindCategories={membership:"會員與服務",resource:"課程與素材",bundle:"套裝組合"};
const statusNames={activated:"已啟用",redeemed:"標記已兌換",inactive:"未啟用",expired:"兌換期限已過（不等於服務停用）"};
const keyOf=value=>{const key=String(value||"").toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g,"");return aliases[key]||key;};
const html=value=>String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const filters=document.getElementById("filters"),grid=document.getElementById("grid");
const category=name=>{const k=keyOf(name);for(const [cat,names] of Object.entries(groups))if(names.some(n=>keyOf(n)===k))return cat;return "其他工具";};
function add(name){
 name=String(name||"").trim().slice(0,150);
 if(!name)return null;
 let item=products.find(p=>keyOf(p[0])===keyOf(name));
 if(item)return item;
 const symbol=name.replace(/[^a-z0-9]/gi,"").slice(0,2).toUpperCase()||"★";
 const target=verifiedSites[name]||account;
 item=[name,category(name),symbol,target,"#7565d5",target===account?"AppSumo 產品紀錄；點卡片前往 Products 查看服務資訊。":"AppSumo 產品紀錄；點卡片開啟軟體網站，實際授權狀態須另外核對。"];
 products.push(item);return item;
}
function iconFor(p){
 try{
  const u=new URL(p[3]);if(!/^https?:$/.test(u.protocol))return null;
  if(u.hostname==="appsumo.com"&&u.pathname.startsWith("/account/"))return null;
  const domain=(p[6]||u.hostname).replace(/^www\./,"");
  return "https://www.google.com/s2/favicons?domain="+encodeURIComponent(domain)+"&sz=128";
 }catch{return null;}
}
function statusLabel(code){return statusNames[String(code).toLowerCase()]||String(code);}
function counts(){
 const values=[...official.values()];
 return {software:values.filter(x=>x.kind==="software").length,other:values.filter(x=>x.kind!=="software").length};
}
function renderFilters(){
 const choices=["全部","官方 CSV · 軟體","官方 CSV · 其他","曾下單（Gmail）",...(local.size?["本機 CSV · 狀態"]:[]),...new Set(products.map(p=>p[1]))];
 if(!choices.includes(active))active="全部";
 filters.innerHTML=choices.map(cat=>{
  const n=products.filter(p=>{
   const k=keyOf(p[0]),kind=official.get(k)?.kind;
   return cat==="全部"||(cat==="官方 CSV · 軟體"&&kind==="software")||
    (cat==="官方 CSV · 其他"&&official.has(k)&&kind!=="software")||
    (cat==="曾下單（Gmail）"&&history.has(k))||
    (cat==="本機 CSV · 狀態"&&local.has(k))||p[1]===cat;
  }).length;
  return '<button class="filter '+(active===cat?"active":"")+'" type="button" data-cat="'+html(cat)+'">'+(cat==="全部"?"🌈 ":"")+html(cat)+' <small>'+n+'</small></button>';
 }).join("");
 filters.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{active=b.dataset.cat;renderFilters();renderCards()}));
}
function renderCards(){
 const found=products.filter(p=>{
  const k=keyOf(p[0]),kind=official.get(k)?.kind;
  const accepted=active==="全部"||(active==="官方 CSV · 軟體"&&kind==="software")||
   (active==="官方 CSV · 其他"&&official.has(k)&&kind!=="software")||
   (active==="曾下單（Gmail）"&&history.has(k))||
   (active==="本機 CSV · 狀態"&&local.has(k))||p[1]===active;
  return accepted&&(p[0]+" "+p[1]+" "+p[5]).toLowerCase().includes(query);
 });
 document.getElementById("total").textContent=products.length;
 document.getElementById("shown").textContent="顯示 "+found.length+" / "+products.length+" 個工具與產品";
 grid.innerHTML=found.length?found.map(p=>{
  const k=keyOf(p[0]),oi=official.get(k),li=local.get(k);
  const markUrl=iconFor(p);
  const mark=markUrl?'<img src="'+html(markUrl)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'"><span class="icon-fallback">'+html(p[2])+'</span>':'<span>'+html(p[2])+'</span>';
  let tags="";
  if(oi)tags+='<span class="owned-badge official-badge">AppSumo CSV · '+html(kindNames[oi.kind]||"產品")+'</span>';
  else if(history.has(k))tags+='<span class="owned-badge">Gmail 曾下單</span>';
  if(li){
   const summary=Object.entries(li.statuses||{}).map(([status,n])=>statusLabel(status)+(n>1?" ×"+n:"")).join("、");
   tags+='<span class="owned-badge csv-badge">本機：'+html(summary||"已匯入")+'</span>';
  }
  const target=String(p[3]).startsWith("https://")?p[3]:account;
  return '<a class="product" style="--accent:'+html(p[4])+'" href="'+html(target)+'" target="_blank" rel="noopener noreferrer" title="'+(target===account?"前往 AppSumo Products 核對授權":"開啟軟體官方網站")+'"><span class="product-mark" aria-hidden="true">'+mark+'</span><span class="product-copy"><span class="product-name">'+html(p[0])+'</span><span class="product-desc">'+html(p[5])+'</span>'+tags+'</span><span class="product-arrow" aria-hidden="true">↗</span></a>';
 }).join(""):'<div class="empty">沒有找到符合的產品，換個名稱或分類試試看。</div>';
}
function parseCSV(data){
 const rows=[];let row=[],value="",quoted=false;
 data=String(data||"").replace(/^\uFEFF/,"");
 for(let i=0;i<data.length;i++){
  const c=data[i];
  if(quoted){if(c==='"'){if(data[i+1]==='"'){value+='"';i++;}else quoted=false;}else value+=c;}
  else if(c==='"')quoted=true;
  else if(c===','){row.push(value);value="";}
  else if(c==='\n'){row.push(value);rows.push(row);row=[];value="";}
  else if(c!=='\r')value+=c;
 }
 row.push(value);if(row.some(v=>String(v).trim()))rows.push(row);
 return rows;
}
function importRows(raw){
 const rows=parseCSV(raw);
 const header=rows[0]?.map(v=>v.trim().toLowerCase().replace(/[_-]/g," "))||[];
 const nameIndex=header.findIndex(v=>["product name","product","name","title","deal name","software"].includes(v));
 const statusIndex=header.findIndex(v=>["status","license status","redemption status","product status"].includes(v));
 if(nameIndex<0)throw Error("找不到 Product name，請使用 AppSumo 匯出的 CSV。");
 const data=new Map();let n=0;
 for(let i=1;i<rows.length;i++){
  const name=String(rows[i][nameIndex]||"").trim().slice(0,150);
  if(!name)continue;
  const st=String(statusIndex>=0?rows[i][statusIndex]:"未知").trim().slice(0,40)||"未知";
  const k=keyOf(name);let entry=data.get(k);
  if(!entry){entry={name,statuses:{},count:0};data.set(k,entry);}
  entry.statuses[st]=(entry.statuses[st]||0)+1;entry.count++;n++;add(name);
 }
 if(!n)throw Error("CSV 沒有有效產品紀錄。");
 local.clear();for(const [k,v] of data)local.set(k,v);
 // Intentionally save only product names and status labels. Never save license codes or full CSV.
 try{localStorage.setItem(storage,JSON.stringify([...local.values()]));}catch{}
 refresh();
}
function restore(){
 try{
  const data=JSON.parse(localStorage.getItem(storage)||"[]");if(!Array.isArray(data))return;
  for(const v of data){if(!v||typeof v.name!=="string")continue;
   const name=v.name.trim().slice(0,150),statuses={};
   if(v.statuses&&typeof v.statuses==="object")for(const [s,n] of Object.entries(v.statuses)){
    if(Number.isInteger(n)&&n>0)statuses[String(s).slice(0,40)]=n;
   }
   else statuses[String(v.status||"未知").slice(0,40)]=1;
   local.set(keyOf(name),{name,statuses,count:Object.values(statuses).reduce((a,b)=>a+b,0)});add(name);
  }
 }catch{}
}
function updateStatus(){
 const c=counts();
 document.getElementById("owned-status").textContent=
  (officialReady?"AppSumo 官方匯出："+c.software+" 款軟體、"+c.other+" 項其他產品。":"讀取官方 CSV 產品清單中。")+
  (gmailReady?" Gmail 訂單已辨識："+history.size+" 款。":"")+
  (local.size?" 本機已匯入 "+local.size+" 種產品狀態。":" 想看各軟體狀態，可在此匯入原始 CSV。");
}
function refresh(){updateStatus();renderFilters();renderCards();}
function mount(){
 const style=document.createElement("style");
 style.textContent=".owned-panel{margin:16px 0 12px;padding:17px;background:#fff;border:1px solid var(--line);border-radius:18px}.owned-panel-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.owned-title{font-size:15px;font-weight:850}.owned-status{font-size:12px;line-height:1.6;margin-top:5px;color:#625b54}.owned-actions{display:flex;flex-wrap:wrap;gap:8px}.owned-action{display:inline-block;cursor:pointer;border:1px solid #e6dcc9;border-radius:12px;padding:9px 11px;background:#fff4d9;text-decoration:none;font:inherit;font-size:12px;font-weight:750}.owned-action.primary{background:#2d2a33;color:#fff;border-color:#2d2a33}.owned-note{font-size:11px;line-height:1.6;margin-top:9px;color:#857c70}.owned-badge{display:inline-block;margin:6px 4px 0 0;padding:3px 7px;border-radius:7px;background:#e8f6ee;color:#267549;font-size:10px;font-weight:750}.owned-badge.official-badge{background:#fff1cf;color:#845412}.owned-badge.csv-badge{background:#e9efff;color:#3756a0}";
 document.head.appendChild(style);
 const area=document.createElement("section");area.className="owned-panel";
 area.innerHTML='<div class="owned-panel-inner"><div><div class="owned-title">📦 AppSumo 購買清單</div><div class="owned-status" id="owned-status" role="status">正在讀取…</div></div><div class="owned-actions"><a class="owned-action" href="'+account+'" target="_blank" rel="noopener noreferrer">AppSumo Products ↗</a><label class="owned-action primary" for="owned-csv-file">匯入 CSV 查看狀態</label><input type="file" id="owned-csv-file" accept=".csv,text/csv" hidden></div></div><div class="owned-note">公開網站只保存產品名稱及分類，不公開授權碼、個人帳號、付款、日期或狀態。原始 CSV 僅在本機讀取名稱與狀態，不儲存授權碼。「expired」一般指兌換期限已過，不代表已啟用的服務停止。Gmail 紀錄只代表曾下單。</div>';
 document.querySelector(".heading").before(area);
 document.getElementById("owned-csv-file").addEventListener("change",async event=>{
  const file=event.target.files&&event.target.files[0];if(!file)return;
  try{importRows(await file.text());}catch(e){document.getElementById("owned-status").textContent="匯入失敗："+e.message;}
  event.target.value="";
 });
}
async function load(){
 await Promise.all([
  (async()=>{try{
   const response=await fetch(gmailUrl,{cache:"no-cache"});if(!response.ok)throw Error("Failed Gmail JSON");
   const data=await response.json();
   (Array.isArray(data.products)?data.products:[]).forEach(p=>{if(!p||typeof p.name!=="string")return;history.add(keyOf(p.name));add(p.name);});
   gmailReady=true;
  }catch{gmailReady=false;}})(),
  (async()=>{try{
   const response=await fetch(officialUrl,{cache:"no-cache"});if(!response.ok)throw Error("Failed official JSON");
   const data=await response.json();
   (Array.isArray(data.products)?data.products:[]).forEach(p=>{
    if(!p||typeof p.name!=="string")return;
    const kind=["software","membership","resource","bundle"].includes(p.kind)?p.kind:"software";
    official.set(keyOf(p.name),{name:p.name,kind});
    const entry=add(p.name);
    if(entry&&kindCategories[kind])entry[1]=kindCategories[kind];
   });
   officialReady=true;
  }catch{officialReady=false;}})()
 ]);
 refresh();
}
mount();restore();drawFilters=renderFilters;drawCards=renderCards;refresh();load();
})();