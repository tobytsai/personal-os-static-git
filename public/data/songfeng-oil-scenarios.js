/* 松風閣油畫裱框三情境計價：外框（已有布架）、布架立體框、繃布無框畫。
 * 公開價格僅作外框參考；沒有來源的配件單價不自動假設。
 * 需在油畫框商品頁載入「框型／試算表快照／照片」後再載入本檔。 */
(function(){
"use strict";
const panel=document.getElementById("sfg-calculator");
if(!panel)return;
const $=id=>document.getElementById(id);
const catalog=Array.isArray(window.SFG_CATALOG_ITEMS)?window.SFG_CATALOG_ITEMS:[];
const categories=Array.isArray(window.SFG_CATALOG_CATEGORIES)?window.SFG_CATALOG_CATEGORIES:[];
const prices=Array.isArray(window.SFG_SHEET_FRAME_PRICES)?window.SFG_SHEET_FRAME_PRICES:[];
const photos=Array.isArray(window.SFG_OFFICIAL_FRAME_PHOTOS)?window.SFG_OFFICIAL_FRAME_PHOTOS:[];
const sheetMeta=window.SFG_SHEET_PRICE_META||{};
const oilSizes=window.OIL_FRAME_DIMENSIONS||{};
const esc=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const validPhoto=u=>typeof u==="string"&&/^https:\/\/sfg218\.com\/admin\/goods_pic\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(u);
const validDetail=u=>typeof u==="string"&&/^https:\/\/sfg218\.com\/frame_info\.php\?class=\d+&no=\d+$/.test(u);
const signedValue=id=>{
 const v=$(id).value.trim();
 if(!v)return null;
 const n=Number(v);
 return Number.isFinite(n)&&n>=0?n:null;
};
const positiveValue=id=>{
 const n=signedValue(id);
 return n===null||n<=0?null:n;
};
const mm=id=>{
 const n=positiveValue(id);
 return n;
};
const amount=n=>"NT$"+n.toLocaleString("zh-TW",{minimumFractionDigits:2,maximumFractionDigits:2});
const decimal=(n,d=2)=>n.toLocaleString("zh-TW",{minimumFractionDigits:d,maximumFractionDigits:d});
const colors=name=>{
 if(/金|古銅|燙金|G$/.test(name))return "#b38b48";
 if(/銀|白銀|S$/.test(name))return "#a5b0bd";
 if(/黑/.test(name))return "#2f3034";
 if(/白|米|原木/.test(name))return "#dfd9c8";
 if(/粉|紫/.test(name))return "#b68eaa";
 if(/紅/.test(name))return "#934c48";
 if(/藍/.test(name))return "#426c98";
 if(/綠/.test(name))return "#567961";
 if(/柚/.test(name))return "#96653f";
 if(/咖|燒|胡桃/.test(name))return "#74503e";
 return "#777c83";
};
const frames=catalog.map((item,index)=>{
 const row=prices[index]?.name===item.name?prices[index]:null;
 const price=(typeof row?.official==="number"&&row.official>0)?row.official:
   (typeof row?.airtable==="number"&&row.airtable>0)?row.airtable:null;
 const source=row?.official>0?(row.verified?"已核對官網價":"試算表價格・待核對"):
   row?.airtable>0?"Airtable 參考價":null;
 const p=photos.length===catalog.length?photos[index]:null;
 return {...item,id:"sf-"+index,index,rate:price,rateSource:source,
  photo:validPhoto(p?.full)?p.full:null,
  thumb:validPhoto(p?.thumb)?p.thumb:validPhoto(p?.full)?p.full:null,
  url:validDetail(row?.url)?row.url:null,tone:colors(item.name)};
});
let frame=frames.find(f=>f.name==="241平白")||frames.find(f=>f.rate!==null)||frames[0]||null;
const initialOilSize=new URLSearchParams(location.search).get("size");
let category="all",limit=48,scenario="direct",family="F",sizeKey=oilSizes[initialOilSize]?initialOilSize:"F6",custom=false;
family=sizeKey==="SM"?"M":sizeKey.charAt(0);
const scenarioText={
 direct:"已有布架｜直接裱外框",
 shadow:"布架立體框｜框＋卡板＋壓克力＋底布",
 stretch:"油畫布繃成無框畫"
};
function note(text){$("sfg-oil-alert").textContent=text||"";}
function renderCategories(){
 const nodes=[["all","全部框型",frames.length],
  ...categories.map((v,i)=>[String(i),v,frames.filter(f=>f.cat===i).length])];
 $("sfg-frame-filter").innerHTML=nodes.map(([id,label,n])=>
  '<button type="button" data-sfg-category="'+esc(id)+'" class="'+(category===id?"selected":"")+
  '" aria-pressed="'+(category===id)+'">'+esc(label)+' <small>'+n+' 款</small></button>').join("");
}
function renderFrames(){
 const query=$("sfg-frame-search").value.trim().toLocaleLowerCase();
 const found=frames.filter(f=>(category==="all"||String(f.cat)===category)&&
  (f.name+" "+categories[f.cat]+" "+f.w+" "+f.h).toLocaleLowerCase().includes(query));
 const slice=found.slice(0,limit);
 $("sfg-frame-count").textContent="顯示 "+slice.length+" / "+found.length+" 款｜價格採試算表快照（"+
 (sheetMeta.withOfficialColumn??0)+" 款已填價）；照片為松風閣官網圖，須核對是否適用油畫布架";
 $("sfg-frame-grid").innerHTML=slice.length?slice.map(f=>
  '<button class="sfg-frame-choice'+(!custom&&frame?.id===f.id?" is-selected":"")+
  '" type="button" data-sfg-frame="'+f.id+'" aria-pressed="'+(!custom&&frame?.id===f.id)+'">'+
  (f.photo?'<img class="sfg-frame-photo" src="'+esc(f.thumb||f.photo)+'" alt="'+esc(f.name)+' 松風閣框條" loading="lazy" referrerpolicy="no-referrer" decoding="async"><span class="sfg-mini-frame" style="--sfg-tone:'+f.tone+'" hidden></span>':
  '<span class="sfg-mini-frame" style="--sfg-tone:'+f.tone+'"></span>')+
  '<span class="sfg-frame-copy"><strong>'+esc(f.name)+'</strong><small>W'+decimal(f.w,1)+'／H'+decimal(f.h,1)+' cm</small>'+
  (f.rate===null?'<em>待補單價</em>':'<small>'+esc(f.rateSource||"參考價")+'：'+amount(f.rate)+'</small>')+
  '</span></button>').join(""):
  '<p class="sfg-empty">'+(category==="9"&&!query?"此分類目前沒有上架框型。":"沒有符合搜尋條件的框型。")+'</p>';
 $("sfg-load-more").hidden=slice.length>=found.length;
 $("sfg-load-more").textContent="顯示更多框型（剩餘 "+(found.length-slice.length)+" 款）";
}
function sizeFamilyOf(name){
 if(name==="SM")return "M";
 if(name.startsWith("F"))return "F";
 if(name.startsWith("P"))return "P";
 if(name.startsWith("M"))return "M";
 return "S";
}
function chooseSize(key){
 const dim=oilSizes[key];if(!dim)return;
 sizeKey=key;family=sizeFamilyOf(key);
 $("sfg-length").value=Math.max(...dim);
 $("sfg-width").value=Math.min(...dim);
 renderSizePresets();calculate();
}
function renderSizePresets(){
 const fam=[["F","F 系列"],["P","P 系列"],["M","M 系列"],["S","S 系列"]];
 $("sfg-oil-families").innerHTML=fam.map(([key,label])=>
  '<button type="button" data-oil-family="'+key+'" class="'+(family===key?"selected":"")+
  '" aria-pressed="'+(family===key)+'">'+label+'</button>').join("");
 const chosen=Object.entries(oilSizes).filter(([key])=>sizeFamilyOf(key)===family);
 $("sfg-oil-sizes").innerHTML=chosen.map(([key,dim])=>
  '<button type="button" data-oil-size="'+esc(key)+'" class="'+(sizeKey===key?"selected":"")+
  '" aria-pressed="'+(sizeKey===key)+'"><strong>'+esc(key)+'</strong><small>'+
  Math.min(...dim)+'×'+Math.max(...dim)+' mm</small></button>').join("");
 $("sfg-oil-size-label").textContent=sizeKey&&oilSizes[sizeKey]?
  "目前選擇："+sizeKey+"（"+Math.min(...oilSizes[sizeKey])+" × "+Math.max(...oilSizes[sizeKey])+" mm）":
  "自訂長寬（mm）";
}
function refreshScenario(){
 const direct=scenario==="direct",shadow=scenario==="shadow",stretch=scenario==="stretch";
 $("sfg-oil-frame-section").hidden=stretch;
 $("sfg-oil-install-section").hidden=!direct;
 $("sfg-oil-shadow-section").hidden=!shadow;
 $("sfg-oil-stretch-section").hidden=!stretch;
 $("sfg-oil-dali").hidden=stretch;
 $("sfg-oil-frame-tip").textContent=shadow?
 "此方案必須同時確認布架厚度、卡板和壓克力所需深度；框高 H 不是有效內槽深度，不代表一定適用立體框。":
 "作品已有布架時，需確認框型內槽深度是否能容納布架厚度。外框型錄並不保證每款都適用油畫。";
 panel.querySelectorAll('input[name="sfg-oil-scenario"]').forEach(input=>{
  const label=input.closest(".sfg-oil-scenario");
  if(label)label.classList.toggle("selected",input.checked);
 });
 renderFrames();calculate();
}
function updateFrameSelection(){
 $("sfg-frame-rate").value=custom?"":frame?.rate??"";
 $("sfg-frame-rate").placeholder=custom?"自行輸入每 15cm 單價":"沒有核對單價時請手動輸入";
 $("sfg-oil-custom-fields").hidden=!custom;
 $("sfg-custom").textContent=custom?"← 返回官網框型選擇":"找不到適合的框型？自訂框型與單價";
 $("sfg-custom").setAttribute("aria-expanded",String(custom));
 const link=$("sfg-frame-link");
 link.href=!custom&&frame?.url?frame.url:"https://sfg218.com/frame.php";
 link.textContent=!custom&&frame?.url?"核對這款框型的官網資料 ↗":"開啟松風閣框樣目錄 ↗";
 renderFrames();calculate();
}
function updateVisual(mmL,mmW){
 const directCanvas=scenario==="stretch";
 const displayFrame=$("sfg-preview-frame"),pic=$("sfg-preview-photo"),
  mock=$("sfg-oil-canvas-preview"),photoNote=$("sfg-preview-note");
 const chosenName=custom?$("sfg-custom-name").value.trim()||"自訂框型":frame?.name||"尚未選框";
 $("sfg-selected-name").textContent=directCanvas?scenarioText.stretch:"目前框型："+chosenName;
 mock.hidden=!directCanvas;
 if(directCanvas){
  pic.hidden=true;displayFrame.hidden=true;
  photoNote.textContent="無框畫：以畫布包覆布架，並非額外裝外框。預覽只是比例示意。";
 }else{
  displayFrame.style.borderWidth=Math.min(23,Math.max(6,(custom?Number($("sfg-custom-width").value)||2:frame?.w||2)*4))+"px";
  displayFrame.style.borderColor=custom?"#66768b":frame?.tone||"#8b6d53";
  const url=!custom?frame?.photo:null;
  if(url&&pic.dataset.failed!==url){
   if(pic.dataset.current!==url){pic.dataset.current=url;pic.alt="松風閣 "+chosenName+" 官網實品照片";pic.src=url;}
   pic.hidden=false;displayFrame.hidden=true;
   photoNote.textContent="松風閣「"+chosenName+"」官網實品框條照片；無法只憑照片判斷布架是否適合。";
  }else{
   pic.hidden=true;displayFrame.hidden=false;
   photoNote.textContent=url?"照片暫時無法載入，顯示框型示意。":"此框型尚無可用照片，顯示框色及比例示意。";
  }
 }
 if(mmL!==null&&mmW!==null){
  const ratio=Math.max(.38,Math.min(2.3,mmW/mmL));
  const height=Math.min(175,175/Math.max(1,ratio));
  displayFrame.style.width=height*ratio+"px";displayFrame.style.height=height+"px";
  mock.style.width=Math.min(225,height*ratio)+"px";
  mock.style.height=height+"px";
 }
}
function calculate(){
 const l=mm("sfg-length"),w=mm("sfg-width");
 const sizeOk=l!==null&&w!==null;
 const length=sizeOk?l/10:0,width=sizeOk?w/10:0,area=length*width/900,
  perimeter=(length+width)/15;
 $("sfg-size-inches").textContent=sizeOk?
  "（"+decimal(length,1)+" ＋ "+decimal(width,1)+"）÷2.54＝"+decimal((length+width)/2.54,2)+" 吋":
  "請輸入有效長寬";
 updateVisual(l,w);
 const rows=[],missing=[];
 const push=(label,cost)=>{rows.push({label,cost});};
 let outer=null;
 if(scenario!=="stretch"){
  const raw=$("sfg-frame-rate").value.trim();
  const rate=signedValue("sfg-frame-rate");
  outer=raw===""||rate===null?null:perimeter*rate;
  push("松風閣外框參考價",outer);
  if(outer===null)missing.push("外框單價");
  const priceStored=!custom&&frame?.rate!==null&&Number(raw)===frame?.rate;
  $("sfg-price-source").textContent=priceStored?
   "來源："+(frame.rateSource||"試算表價格")+"；僅為參考，不代表油畫框適配":
   raw!==""?"來源：自行輸入的框條單價":"此框型暫無價格，請自行查核並輸入";
  if(scenario==="direct"){
   const labor=signedValue("sfg-oil-install-labor"),parts=signedValue("sfg-oil-install-parts");
   push("裝框工資（自訂）",labor);push("五金／其他配件（自訂）",parts);
   if(labor===null)missing.push("裝框工資");
   if(parts===null)missing.push("五金費用");
  }else{
   const card=signedValue("sfg-oil-card-rate"),acrylic=signedValue("sfg-oil-acrylic-rate"),
    cloth=signedValue("sfg-oil-bottom-rate"),labor=signedValue("sfg-oil-shadow-labor");
   push("卡板（按面積／才）",card===null?null:area*card);
   push("壓克力（按面積／才）",acrylic===null?null:area*acrylic);
   push("底布（按面積／才）",cloth===null?null:area*cloth);
   push("立體框組裝工資",labor);
   if(card===null)missing.push("卡板每才單價");
   if(acrylic===null)missing.push("壓克力每才單價");
   if(cloth===null)missing.push("底布每才單價");
   if(labor===null)missing.push("組裝工資");
  }
 }else{
  $("sfg-price-source").textContent="無框畫不使用松風閣外框型錄價格。布架木料和繃布工資需自行輸入。";
  const wood=signedValue("sfg-oil-stretcher-rate"),labor=signedValue("sfg-oil-stretch-labor"),
   cloth=signedValue("sfg-oil-canvas-rate"),margin=signedValue("sfg-oil-wrap-margin");
  const canvasArea=margin===null?null:((length+margin*2)*(width+margin*2)/900);
  push("布架木料（每15cm計價單位）",wood===null?null:wood*perimeter);
  push("繃布工資",labor);
  push("油畫布材料（含包邊面積）",cloth===null||canvasArea===null?null:cloth*canvasArea);
  if(wood===null)missing.push("布架木料單價");
  if(labor===null)missing.push("繃布工資");
  if(cloth===null)missing.push("油畫布單價");
  if(margin===null)missing.push("畫布包邊預留");
  $("sfg-oil-stretch-area").textContent=canvasArea!==null&&sizeOk?
    "含每側 "+decimal(margin,1)+"cm 預留的估算布料面積："+decimal(canvasArea,3)+" 才；已自備畫布可將材料單價填 0。":
    "請確認畫布包邊預留尺寸。";
 }
 const missingSize=!sizeOk;
 const total=rows.some(r=>r.cost===null)||missingSize?null:rows.reduce((sum,r)=>sum+r.cost,0);
 $("sfg-oil-breakdown").innerHTML=rows.map(r=>
  '<div class="sfg-line"><span>'+esc(r.label)+'</span><strong>'+
  (sizeOk&&r.cost!==null?amount(r.cost):"待輸入")+'</strong></div>').join("");
 $("sfg-total").textContent=total===null?"待補齊單價":amount(total);
 const formula=$("sfg-oil-formulas");
 const type=scenarioText[scenario];
 formula.textContent=sizeOk?type+"｜長 "+decimal(length,1)+"cm、寬 "+decimal(width,1)+
  "cm；外框／布架線性係數："+decimal(perimeter,3)+"；作品面積："+decimal(area,3)+" 才。":
  type+"｜請輸入有效的作品尺寸。";
 const multiplier=positiveValue("sfg-dali-multiplier");
 const actualRate=scenario==="stretch"?null:signedValue("sfg-frame-rate");
 const daliUnit=actualRate!==null&&multiplier!==null?actualRate*2.54/15*multiplier:null;
 const daliFrame=daliUnit!==null&&sizeOk?(length+width)/2.54*daliUnit:null;
 $("sfg-dali-unit").textContent=daliUnit===null?"待輸入":"NT$"+decimal(daliUnit,4)+"／吋";
 $("sfg-dali-frame").textContent=daliFrame===null?"待輸入":amount(daliFrame);
 $("sfg-dali-formula").textContent=daliFrame!==null?
  "達利：（"+decimal(length,1)+"＋"+decimal(width,1)+"）÷2.54 ×（"+decimal(actualRate,2)+
  "×2.54÷15×"+decimal(multiplier,2)+"）＝"+amount(daliFrame):
  "達利每吋價格只換算外框，需先填框條單價及大於 0 的倍率。";
 const depth=$("sfg-oil-canvas-depth").value.trim();
 let alert=missingSize?"請先輸入正確的作品長寬。":
  missing.length?"請填入："+missing.join("、")+"，才能得到完整參考合計。":"";
 if(!alert&&scenario!=="stretch"&&depth)alert="已記錄布架厚度 "+depth+"mm。框條 H 為型材高度，不代表內槽深度；是否能裝入布架需另行確認。";
 if(!alert&&Math.max(l||0,w||0)>1500)alert="大型作品可能需特殊結構、加強桿與運輸安排；請以師傅實際報價為準。";
 note(alert);
}
function install(){
 // Grouping, prefilled common F6, mode-specific costs and picture support.
 $("sfg-oil-families").addEventListener("click",e=>{
  const b=e.target.closest("[data-oil-family]");if(!b)return;
  family=b.dataset.oilFamily;renderSizePresets();
 });
 $("sfg-oil-sizes").addEventListener("click",e=>{
  const b=e.target.closest("[data-oil-size]");if(b)chooseSize(b.dataset.oilSize);
 });
 panel.querySelectorAll('input[name="sfg-oil-scenario"]').forEach(r=>r.addEventListener("change",()=>{
  if(r.checked){scenario=r.value;refreshScenario();}
 }));
 $("sfg-frame-filter").addEventListener("click",e=>{
  const b=e.target.closest("[data-sfg-category]");if(!b)return;
  category=b.dataset.sfgCategory;limit=48;renderCategories();renderFrames();
 });
 $("sfg-frame-search").addEventListener("input",()=>{limit=48;renderFrames();});
 $("sfg-load-more").addEventListener("click",()=>{limit+=48;renderFrames();});
 $("sfg-frame-grid").addEventListener("click",e=>{
  const b=e.target.closest("[data-sfg-frame]");if(!b)return;
  const next=frames.find(f=>f.id===b.dataset.sfgFrame);if(!next)return;
  frame=next;custom=false;updateFrameSelection();
 });
 $("sfg-custom").addEventListener("click",()=>{
  custom=!custom;updateFrameSelection();
 });
 const ids=["sfg-length","sfg-width","sfg-canvas-depth","sfg-frame-rate","sfg-custom-width","sfg-custom-name",
  "sfg-oil-install-labor","sfg-oil-install-parts",
  "sfg-oil-card-rate","sfg-oil-acrylic-rate","sfg-oil-bottom-rate","sfg-oil-shadow-labor",
  "sfg-oil-stretcher-rate","sfg-oil-stretch-labor","sfg-oil-canvas-rate","sfg-oil-wrap-margin",
  "sfg-dali-multiplier"];
 ids.forEach(id=>$(id).addEventListener("input",()=>{
  if(id==="sfg-length"||id==="sfg-width"){sizeKey=null;renderSizePresets();}
  calculate();
 }));
 // Real photos are preferred. When a provider image fails, show the original mock frame.
 $("sfg-frame-grid").addEventListener("error",e=>{
  const image=e.target;
  if(!image?.classList?.contains("sfg-frame-photo"))return;
  image.hidden=true;
  if(image.nextElementSibling?.classList?.contains("sfg-mini-frame"))image.nextElementSibling.hidden=false;
 },true);
 $("sfg-preview-photo").addEventListener("error",()=>{
  const image=$("sfg-preview-photo");image.dataset.failed=image.dataset.current||"";
  image.hidden=true;
  $("sfg-preview-frame").hidden=scenario==="stretch";
  $("sfg-preview-note").textContent="官網照片暫時無法載入，改用示意框。";
 });
 renderCategories();chooseSize(sizeKey);updateFrameSelection();refreshScenario();
}
install();
})();