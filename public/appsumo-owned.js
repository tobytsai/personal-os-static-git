/* AppSumo launcher: public-safe Gmail order summary and local-only official CSV import.
   Requires the existing classic inline appsumo.html script to initialize products, active, query, filters and grid first. */
(function(){
"use strict";
const url="../data/appsumo-confirmed-purchases.json";
const account="https://appsumo.com/account/products/";
const verifiedSites={
 "Buildin": "https://buildin.ai/",
 "BrowserAct": "https://www.browseract.com/",
 "VoiSpark": "https://voispark.com/",
 "Albato": "https://albato.com/",
 "Video To Blog": "https://videotoblog.ai/",
 "OnlineCourseHost.com": "https://onlinecoursehost.com/",
 "Brilliant Directories": "https://www.brilliantdirectories.com/",
 "ClickRank": "https://www.clickrank.ai/",
 "JoggAI": "https://www.jogg.ai/",
 "CopyClipper": "https://copyclipper.com/",
 "Letterly": "https://letterly.app/",
 "SellerPic": "https://sellerpic.ai/",
 "TaskMagic": "https://taskmagic.com/",
 "SheetMagic": "https://sheetmagic.ai/",
 "Swipe One": "https://www.swipeone.com/",
 "PlanPros.ai": "https://planpros.ai/"
};
const storage="toby-appsumo-official-csv-v1";
const confirmed=new Set();
const csv=new Map();
let verifiedCount=0;
const groups={
"自動化與資料":["BrowserAct","Albato","TaskMagic","SheetMagic","Blue","Boost.space","AITable.ai","Retable","Buildin","ContextMinds","tabExtend"],
"學習與課程":["Mini Course Generator","OnlineCourseHost.com"],
"行銷與曝光":["ClickRank","Swipe One","Launch Cart","Brilliant Directories","Postaga","KeywordGap","Marky","SkyRocket Reviews","Boostramp","Grawt","Evolup"],
"影音與設計":["Sticker Mule Pro","VoiSpark","JoggAI","SellerPic","Disctopia","Remo","Radiolize","Boardmix","EaseUS VoiceWave","Hipclip","DocTunes","MediaPlace","TextSniper","Fourie"],
"網站與營運":["Dart","Brizy Cloud","WebWave","Wondr AI","Support Board","FuseBase","Spotely","PlanPros.ai","Cmaps"],
"AI 與內容":["Video To Blog","CopyClipper","Letterly","Blogify","Waspnote","Afforai","Exemplary AI","Fliki","Katteb","ClickMinded AI Marketing Toolkit","NoteDex"]
};
const normalize=s=>String(s||"").toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g,"");
const escapeHTML=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function category(name){const key=normalize(name);for(const [cat,items] of Object.entries(groups)){if(items.some(n=>normalize(n)===key))return cat;}return "其他工具";}
function add(name){
 name=String(name||"").trim().slice(0,150);
 if(!name)return;
 if(products.some(p=>normalize(p[0])===normalize(name)))return;
 const symbol=name.replace(/[^a-z0-9]/gi,"").slice(0,2).toUpperCase()||"★";
 const homepage=verifiedSites[name]||account;
 products.push([name,category(name),symbol,homepage,"#786ace",homepage===account?"歷史訂單已核實；前往 AppSumo Products 查詢授權、啟用狀態與服務連結。":"已核實歷史訂單，點卡片開啟軟體官網；授權現況請至 AppSumo Products 核對。"]);
}
function iconFor(p){
 try{const u=new URL(p[3]);if(!/^https?:$/.test(u.protocol))return null;if(u.hostname==="appsumo.com"&&u.pathname.startsWith("/account/"))return null;
 const host=(p[6]||u.hostname).replace(/^www\./,"");return "https://www.google.com/s2/favicons?domain="+encodeURIComponent(host)+"&sz=128";
 }catch{return null;}
}
function renderFilters(){
 const choices=["全部","曾下單（Gmail）",...(csv.size?["官方 CSV"]:[]),...new Set(products.map(p=>p[1]))];
 if(!choices.includes(active))active="全部";
 filters.innerHTML=choices.map(cat=>{
  const n=cat==="全部"?products.length:cat==="曾下單（Gmail）"?products.filter(p=>confirmed.has(normalize(p[0]))).length:cat==="官方 CSV"?products.filter(p=>csv.has(normalize(p[0]))).length:products.filter(p=>p[1]===cat).length;
  return '<button class="filter '+(active===cat?"active":"")+'" type="button" data-cat="'+escapeHTML(cat)+'">'+(cat==="全部"?"🌈 ":"")+escapeHTML(cat)+' <small>'+n+'</small></button>';
 }).join("");
 filters.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{active=b.dataset.cat;renderFilters();renderCards()}));
}
function renderCards(){
 const list=products.filter(p=>{
 const key=normalize(p[0]),match=active==="全部"||(active==="曾下單（Gmail）"&&confirmed.has(key))||(active==="官方 CSV"&&csv.has(key))||p[1]===active;
 return match&&(p[0]+" "+p[1]+" "+p[5]).toLowerCase().includes(query);
 });
 document.getElementById("total").textContent=products.length;
 document.getElementById("shown").textContent="顯示 "+list.length+" / "+products.length+" 個工具";
 grid.innerHTML=list.length?list.map(p=>{
 const key=normalize(p[0]),imported=csv.get(key),verified=confirmed.has(key);
 const label=imported?"<span class=\"owned-badge csv-badge\">官方 CSV："+escapeHTML(imported.status)+"</span>":verified?"<span class=\"owned-badge\">Gmail 曾下單</span>":"";
 const favicon=iconFor(p),fallback='<span>'+escapeHTML(p[2])+'</span>';
 const mark=favicon?'<img src="'+escapeHTML(favicon)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'"><span class="icon-fallback">'+escapeHTML(p[2])+'</span>':fallback;
 const target=String(p[3]).startsWith("https://")?p[3]:account;
 return '<a class="product" style="--accent:'+escapeHTML(p[4])+'" href="'+escapeHTML(target)+'" target="_blank" rel="noopener noreferrer" title="'+(target===account?"前往 AppSumo Products 查找你的授權":"開啟軟體")+'"><span class="product-mark" aria-hidden="true">'+mark+'</span><span class="product-copy"><span class="product-name">'+escapeHTML(p[0])+'</span><span class="product-desc">'+escapeHTML(p[5])+'</span>'+label+'</span><span class="product-arrow" aria-hidden="true">↗</span></a>';
 }).join(""):'<div class="empty">沒有找到符合的工具，換個名稱或分類試試看。</div>';
}
function parseCSV(raw){
 const rows=[],text=String(raw).replace(/^\uFEFF/,"");let row=[],value="",quote=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else quote=false;}else value+=c;}
 else if(c==='"')quote=true;else if(c===','){row.push(value);value="";}else if(c==='\n'){row.push(value);rows.push(row);row=[];value="";}else if(c!=='\r')value+=c;}
 row.push(value);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
function importRows(text){
 const rows=parseCSV(text),columns=["product name","product","name","title","deal name","product title","software","deal"];let start=-1,nameIndex=-1,header=[];
 for(let i=0;i<Math.min(rows.length,6);i++){let h=rows[i].map(v=>v.trim().toLowerCase().replace(/[_-]/g," "));let j=h.findIndex(v=>columns.includes(v));if(j!==-1){start=i;nameIndex=j;header=h;break;}}
 if(nameIndex===-1)throw Error("找不到產品名稱欄位，請將 CSV 上傳 ChatGPT 協助辨識。");
 const statusIndex=header.findIndex(v=>["status","license status","redemption status","product status"].includes(v));
 let n=0;
 for(let i=start+1;i<rows.length;i++){let name=String(rows[i][nameIndex]||"").trim().slice(0,150);if(!name)continue;
 let state=String(statusIndex>=0?rows[i][statusIndex]||"":"已匯入").trim().slice(0,40)||"已匯入";
 csv.set(normalize(name),{name,status:state});add(name);n++;
 }
 if(!n)throw Error("CSV 未包含可辨識的產品。");
 try{localStorage.setItem(storage,JSON.stringify([...csv.values()]));}catch{}
 updateStatus();renderFilters();renderCards();
}
function updateStatus(){
 document.getElementById("owned-status").textContent="Gmail 已核實 "+verifiedCount+" 款歷史訂單軟體"+(csv.size?"，本機 CSV 匯入 "+csv.size+" 款":"")+"。部分舊訂單無法從郵件辨識品名；授權現況請以 AppSumo 為準。";
}
function restore(){
 try{const values=JSON.parse(localStorage.getItem(storage)||"[]");if(!Array.isArray(values))return;values.forEach(p=>{if(!p||typeof p.name!=="string")return;csv.set(normalize(p.name),{name:p.name,status:String(p.status||"已匯入")});add(p.name);});}catch{}
}
function mount(){
 const css=document.createElement("style");css.textContent=".owned-panel{margin:16px 0 12px;padding:17px;background:#fff;border:1px solid var(--line);border-radius:18px}.owned-panel-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.owned-title{font-size:15px;font-weight:850}.owned-status{font-size:12px;line-height:1.6;margin-top:5px;color:#625b54}.owned-actions{display:flex;flex-wrap:wrap;gap:8px}.owned-action{display:inline-block;cursor:pointer;border:1px solid #e6dcc9;border-radius:12px;padding:9px 11px;background:#fff4d9;text-decoration:none;font:inherit;font-size:12px;font-weight:750}.owned-action.primary{background:#2d2a33;color:#fff;border-color:#2d2a33}.owned-note{font-size:11px;line-height:1.55;margin-top:9px;color:#857c70}.owned-badge{display:inline-block;margin-top:6px;padding:3px 7px;border-radius:7px;background:#e8f6ee;color:#267549;font-size:10px;font-weight:750}.owned-badge.csv-badge{background:#e9efff;color:#3756a0}";
 document.head.appendChild(css);
 const container=document.createElement("section");
 container.className="owned-panel";
 container.innerHTML='<div class="owned-panel-inner"><div><div class="owned-title">📦 AppSumo 歷史訂單整理</div><div class="owned-status" id="owned-status" role="status">正在讀取清單…</div></div><div class="owned-actions"><a class="owned-action" href="'+account+'" target="_blank" rel="noopener noreferrer">AppSumo Products ↗</a><label class="owned-action primary" for="owned-csv-file">匯入官方 CSV</label><input type="file" id="owned-csv-file" accept=".csv,text/csv" hidden></div></div><div class="owned-note">Gmail 訂單僅代表曾購買，不保證授權有效。CSV 只在本機處理，不會上傳購買金額、訂單號、郵件或授權碼至公開的 GitHub。</div>';
 document.querySelector(".heading").before(container);
 document.getElementById("owned-csv-file").addEventListener("change",async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;try{importRows(await f.text());}catch(ex){document.getElementById("owned-status").textContent="CSV 匯入失敗："+ex.message;}e.target.value="";});
}
async function load(){
 try{const response=await fetch(url,{cache:"no-cache"});if(!response.ok)throw Error("資料暫不可用");
 const data=await response.json();(data.products||[]).forEach(p=>{if(!p||!p.name)return;confirmed.add(normalize(p.name));add(p.name);});verifiedCount=confirmed.size;
 }catch(e){document.getElementById("owned-status").textContent="無法讀取 Gmail 歷史購買清單，原有卡片仍可正常使用。";}
 updateStatus();renderFilters();renderCards();
}
mount();restore();
drawFilters=renderFilters;drawCards=renderCards;
renderFilters();renderCards();updateStatus();load();
})();