/* 松風閣框條單價反推｜兩次報價差額測試，使用者輸入購物車金額。
   此工具為獨立輔助試算，不接入第三方購物車、不把推算價寫回 Airtable。 */
(function(){
"use strict";
const panel=document.getElementById("sfg-calculator");
const layout=panel&&panel.querySelector(".sfg-layout");
if(!panel||!layout||document.getElementById("sfg-reverse"))return;
const style=document.createElement("style");
style.textContent=String.raw`
/* 反推框價表單：完全限制於松風閣分頁區，避免手機版橫向溢出 */
.sfg-reverse{width:100%;min-width:0;max-width:100%;margin-top:16px;border:1px solid #c5d7ed;border-radius:18px;background:#fff;overflow:hidden}
.sfg-reverse>summary{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:17px 18px;cursor:pointer;background:#eaf2ff;color:#314f80;font-size:16px;font-weight:850}
.sfg-reverse>summary small{font-size:12px;font-weight:650;color:#5d7290}
.sfg-rev-body{padding:16px;min-width:0}
.sfg-rev-intro{color:#60748c;font-size:13px;line-height:1.75;margin:0 0 13px}
.sfg-rev-intro a,.sfg-rev-help a{color:#315fa0;text-decoration:underline}
.sfg-rev-pairs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.sfg-rev-sample{min-width:0;padding:13px;border:1px solid #dfe7f2;border-radius:14px;background:#fbfcff}
.sfg-rev-sample h4{margin:0 0 11px;color:#375a86;font-size:14px}
.sfg-rev-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.sfg-rev-fields label,.sfg-rev-small-field{min-width:0;display:flex;flex-direction:column;gap:5px;color:#536783;font-size:12px;font-weight:750}
.sfg-rev-fields input,.sfg-rev-small-field input{width:100%;min-width:0;border:1px solid #cdd9e9;border-radius:10px;padding:10px 11px;font:inherit;font-size:14px;color:#253950;background:white}
.sfg-rev-fields input:focus-visible,.sfg-rev-small-field input:focus-visible{outline:2px solid #6485c4;outline-offset:2px}
.sfg-rev-fields label:last-child{grid-column:1/-1}
.sfg-rev-options{margin:13px 0;padding:12px;border:1px solid #e1eaf5;border-radius:14px;background:#fafcff}
.sfg-rev-options h4{font-size:13px;margin:0 0 8px;color:#405c80}
.sfg-rev-checks{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.sfg-rev-checks label{display:flex;gap:8px;align-items:center;font-size:12px;font-weight:750;color:#49607f}
.sfg-rev-checks input{width:17px;height:17px;accent-color:#5578b8}
.sfg-rev-rates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.sfg-rev-advanced{margin:12px 0 0;border-top:1px dashed #c8d5e7;padding-top:10px}
.sfg-rev-advanced>summary{cursor:pointer;color:#47688f;font-size:12px;font-weight:800}
.sfg-rev-extra-grid{margin-top:10px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.sfg-rev-result{margin-top:13px;padding:14px;border:1px solid #cbdcf3;border-radius:15px;background:linear-gradient(125deg,#f1f7ff,#fff)}
.sfg-rev-selected{font-size:13px;font-weight:800;color:#3d5f8e;margin-bottom:10px}
.sfg-rev-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.sfg-rev-metric{min-width:0;padding:11px;border:1px solid #dbe5f3;border-radius:12px;background:white}
.sfg-rev-metric span{display:block;font-size:12px;color:#6a7b92;line-height:1.5}
.sfg-rev-metric strong{display:block;font-size:clamp(16px,2.2vw,23px);color:#31588b;margin-top:5px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.sfg-rev-metric.featured{background:#dfeafb;border-color:#b8ceef}
.sfg-rev-feedback{font-size:12px;color:#62728a;line-height:1.75;margin:11px 0 5px;overflow-wrap:anywhere}
.sfg-rev-ref{margin:8px 0;color:#566b8a;font-size:12px;line-height:1.75}
.sfg-rev-message{font-size:12px;font-weight:750;line-height:1.7;color:#476c51;margin:8px 0 0}
.sfg-rev-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}
.sfg-rev-actions button{border:1px solid #b5c9e7;border-radius:11px;background:#fff;color:#42649a;padding:10px 12px;font-size:12px;font-weight:850;cursor:pointer}
.sfg-rev-actions button:first-child{background:#5278b6;color:white;border-color:#5278b6}
.sfg-rev-actions button:disabled{cursor:not-allowed;opacity:.45}
.sfg-rev-saved{margin:10px 0 0;color:#6e7890;font-size:12px;line-height:1.7}
.sfg-rev-help{font-size:12px;color:#65758c;line-height:1.8;margin:12px 0 0}
@media(max-width:560px){.sfg-reverse>summary{padding:13px 12px;font-size:15px}.sfg-rev-body{padding:12px}.sfg-rev-pairs,.sfg-rev-extra-grid{grid-template-columns:minmax(0,1fr)}.sfg-rev-actions button{flex:1 1 auto}.sfg-rev-result{padding:11px}}
@media(max-width:380px){.sfg-rev-rates,.sfg-rev-metrics{grid-template-columns:minmax(0,1fr)}}
`;
document.head.appendChild(style);
layout.insertAdjacentHTML("beforebegin",String.raw`
<details id="sfg-reverse" class="sfg-reverse" open>
<summary><span>🧮 反推框條單價｜兩筆購物車報價</span><small>預設 30 × 30 與 30 × 45 公分</small></summary>
<div class="sfg-rev-body">
<p class="sfg-rev-intro">在 <a href="https://sfg218.com/simulation.php?Clear=Clear&amp;winshow=no&amp;df_pic=yes" target="_blank" rel="noopener noreferrer">松風閣模擬框</a>選擇<strong>同一框型與相同工法</strong>，先後用兩種尺寸取得購物車金額並填入。無法直接讀取你在 <a href="https://sfg218.com/shoplist.php" target="_blank" rel="noopener noreferrer">官網購物車</a>的內容，須手動填入報價。</p>
<p class="sfg-rev-help"><a href="https://docs.google.com/spreadsheets/d/1AEPuvr4RXX-aN-fKZb7lJbWrFnOWTdCo84MMAd8JiFQ/edit?usp=drivesdk" target="_blank" rel="noopener noreferrer"><strong>🗂️ 開啟 Google 試算表｜填寫表單與報價紀錄 ↗</strong></a>　可在 Google 試算表自動保存；如要逐筆送出 Google 表單，請先依「操作說明」完成一次 Apps Script 設定。</p>
<div class="sfg-rev-pairs">
<div class="sfg-rev-sample"><h4>報價 ①｜30 × 30cm（係數 4）</h4>
<div class="sfg-rev-fields"><label for="sfg-rev-l1">長（cm）<input id="sfg-rev-l1" type="number" min="0.1" step="0.1" value="30" inputmode="decimal"></label>
<label for="sfg-rev-w1">寬（cm）<input id="sfg-rev-w1" type="number" min="0.1" step="0.1" value="30" inputmode="decimal"></label>
<label for="sfg-rev-p1">第一次購物車報價（NT$）<input id="sfg-rev-p1" type="number" min="0" step="0.01" placeholder="填入第一筆金額" inputmode="decimal"></label></div></div>
<div class="sfg-rev-sample"><h4>報價 ②｜30 × 45cm（係數 5）</h4>
<div class="sfg-rev-fields"><label for="sfg-rev-l2">長（cm）<input id="sfg-rev-l2" type="number" min="0.1" step="0.1" value="30" inputmode="decimal"></label>
<label for="sfg-rev-w2">寬（cm）<input id="sfg-rev-w2" type="number" min="0.1" step="0.1" value="45" inputmode="decimal"></label>
<label for="sfg-rev-p2">第二次購物車報價（NT$）<input id="sfg-rev-p2" type="number" min="0" step="0.01" placeholder="填入第二筆金額" inputmode="decimal"></label></div></div>
</div>
<div class="sfg-rev-options"><h4>購物車報價包含哪些材料？</h4>
<div class="sfg-rev-checks"><label for="sfg-rev-back"><input id="sfg-rev-back" type="checkbox"> 包含背板</label><label for="sfg-rev-acrylic"><input id="sfg-rev-acrylic" type="checkbox"> 包含壓克力</label></div>
<div class="sfg-rev-rates">
<label class="sfg-rev-small-field" for="sfg-rev-back-rate">背板每才價（NT$）<input id="sfg-rev-back-rate" type="number" min="0" step="0.01" value="70" inputmode="decimal"></label>
<label class="sfg-rev-small-field" for="sfg-rev-acrylic-rate">壓克力每才價（NT$）<input id="sfg-rev-acrylic-rate" type="number" min="0" step="0.01" value="100" inputmode="decimal"></label>
</div>
<p class="sfg-tip">預設只包含外框；完整裱框報價請勾選實際有的材料。單價可自行修改，請先與官網確認。</p>
<details class="sfg-rev-advanced"><summary>進階：固定工資、兩次不同的費用（選填）</summary>
<div class="sfg-rev-extra-grid">
<label class="sfg-rev-small-field" for="sfg-rev-fixed">兩筆相同固定費（NT$）<input id="sfg-rev-fixed" type="number" min="0" step="0.01" value="0" inputmode="decimal"></label>
<label class="sfg-rev-small-field" for="sfg-rev-extra1">第一次其他費用（NT$）<input id="sfg-rev-extra1" type="number" min="0" step="0.01" value="0" inputmode="decimal"></label>
<label class="sfg-rev-small-field" for="sfg-rev-extra2">第二次其他費用（NT$）<input id="sfg-rev-extra2" type="number" min="0" step="0.01" value="0" inputmode="decimal"></label>
</div><p class="sfg-tip">兩次相同固定費在價差中相互抵銷。若有不同的尺寸加價或折扣，必須先扣除才能準確反推。</p></details>
</div>
<div class="sfg-rev-result" aria-live="polite">
<div class="sfg-rev-selected" id="sfg-rev-selected">選擇框型：—</div>
<div class="sfg-rev-metrics">
<div class="sfg-rev-metric featured"><span>兩筆價差推算單價（每 15cm 計價單位）</span><strong id="sfg-rev-rate">待輸入</strong></div>
<div class="sfg-rev-metric"><span>第一筆獨立反推</span><strong id="sfg-rev-rate1">—</strong></div>
<div class="sfg-rev-metric"><span>第二筆獨立反推</span><strong id="sfg-rev-rate2">—</strong></div>
<div class="sfg-rev-metric"><span>推估兩筆共同固定費</span><strong id="sfg-rev-implied">—</strong></div>
</div>
<p class="sfg-rev-feedback" id="sfg-rev-feedback">輸入兩次報價後，會扣除材料差額並計算框條單價。</p>
<p class="sfg-rev-ref" id="sfg-rev-reference"></p>
<p class="sfg-rev-feedback" id="sfg-rev-formula"></p>
<div class="sfg-rev-actions"><button id="sfg-rev-apply" type="button" disabled>套用到裱框試算</button><button id="sfg-rev-save" type="button" disabled>儲存推算價到此裝置</button><button id="sfg-rev-clear" type="button" hidden>清除本機儲存價</button></div>
<p class="sfg-rev-saved" id="sfg-rev-saved"></p><p class="sfg-rev-message" id="sfg-rev-message" role="status"></p>
</div>
<p class="sfg-rev-help">公式：框條單價＝［第二次報價－第一次報價－配件費差額－其他變動費差額］÷［（第二次長＋寬－第一次長－寬）÷15］。兩次尺寸與工法必須有不同的計價係數，結果才有意義。此為反推估計，不能取代正式報價。</p>
</div>
</details>
`);
const $=id=>document.getElementById(id);
const money=n=>"NT$"+Number(n).toLocaleString("zh-TW",{minimumFractionDigits:2,maximumFractionDigits:2});
const val=id=>Number($(id).value);
const key="sfgReverseFrameRatesV1";
function load(){
 try{const x=JSON.parse(localStorage.getItem(key)||"{}");return x&&typeof x==="object"&&!Array.isArray(x)?x:{};}
 catch{return {};}
}
let saved=load(),last=null;
function selection(){
 const name=sfgCustomMode?($("sfg-custom-name").value.trim()||"自訂框型"):sfgChosen.name;
 return {name,custom:sfgCustomMode,frame:sfgChosen};
}
function originalRate(){
 const x=selection();
 return !x.custom&&typeof x.frame.rate==="number"&&Number.isFinite(x.frame.rate)&&x.frame.rate>0?x.frame.rate:null;
}
function setText(id,text){$(id).textContent=text;}
function updateSaved(){
 const x=selection(),entry=!x.custom?saved[x.name]:null;
 setText("sfg-rev-selected","目前選擇框型："+x.name);
 setText("sfg-rev-saved",entry&&Number.isFinite(entry.rate)?"本機已有反推價："+money(entry.rate)+"（"+(entry.date||"先前儲存")+"，僅供比對；如有試算表價格會以試算表為主）":"尚未儲存此框型的反推價。");
 $("sfg-rev-clear").hidden=!(entry&&Number.isFinite(entry.rate));
}
function updateReference(rate){
 const x=selection(),base=originalRate();
 if(base===null){setText("sfg-rev-reference","價格來源：試算表沒有這款框型的單價；請自行核對。");return;}
 const src=x.frame.rateSource==="sheet-verified"?"試算表・已核對官網價（2026/10/29 快照）":
 x.frame.rateSource==="sheet-unverified"?"試算表・官網價欄（待核對，2026/10/29 快照）":
 x.frame.rateSource==="sheet-airtable"?"試算表・Airtable 參考價":"原始參考價";
 const diff=Number.isFinite(rate)?"；與反推單價相差 "+money(Math.abs(rate-base))+(rate>base?"（反推較高）":rate<base?"（反推較低）":"（一致）"):"";
 setText("sfg-rev-reference",src+"："+money(base)+diff+"。");
}
function setIdle(msg){
 last=null;setText("sfg-rev-rate","待輸入");setText("sfg-rev-rate1","—");setText("sfg-rev-rate2","—");setText("sfg-rev-implied","—");
 setText("sfg-rev-feedback",msg);setText("sfg-rev-formula","");
 $("sfg-rev-apply").disabled=true;$("sfg-rev-save").disabled=true;updateReference(null);
}
function calculate(){
 updateSaved();
 const ids=["sfg-rev-l1","sfg-rev-w1","sfg-rev-l2","sfg-rev-w2","sfg-rev-back-rate","sfg-rev-acrylic-rate","sfg-rev-fixed","sfg-rev-extra1","sfg-rev-extra2"];
 if(ids.some(id=>$(id).value.trim()===""||!Number.isFinite(val(id)))||val("sfg-rev-l1")<=0||val("sfg-rev-w1")<=0||val("sfg-rev-l2")<=0||val("sfg-rev-w2")<=0||
 ["sfg-rev-back-rate","sfg-rev-acrylic-rate","sfg-rev-fixed","sfg-rev-extra1","sfg-rev-extra2"].some(id=>val(id)<0)){
  setIdle("請輸入正確的尺寸與非負數費用。");return;
 }
 const L1=val("sfg-rev-l1"),W1=val("sfg-rev-w1"),L2=val("sfg-rev-l2"),W2=val("sfg-rev-w2");
 const k1=(L1+W1)/15,k2=(L2+W2)/15,a1=L1*W1/900,a2=L2*W2/900;
 const rateMaterials=($("sfg-rev-back").checked?val("sfg-rev-back-rate"):0)+($("sfg-rev-acrylic").checked?val("sfg-rev-acrylic-rate"):0);
 const fixed=val("sfg-rev-fixed"),extra1=val("sfg-rev-extra1"),extra2=val("sfg-rev-extra2");
 const p1=$("sfg-rev-p1").value.trim(),p2=$("sfg-rev-p2").value.trim();
 if(!p1&&!p2){setIdle("請填入兩筆購物車報價，才可以用價差反推單價。");return;}
 if((p1&&(!Number.isFinite(Number(p1))||Number(p1)<=0))||(p2&&(!Number.isFinite(Number(p2))||Number(p2)<=0))){setIdle("購物車報價必須是大於 0 的金額。");return;}
 const net1=p1?Number(p1)-a1*rateMaterials-extra1:null;
 const net2=p2?Number(p2)-a2*rateMaterials-extra2:null;
 const unit1=net1!==null?(net1-fixed)/k1:null;
 const unit2=net2!==null?(net2-fixed)/k2:null;
 setText("sfg-rev-rate1",unit1!==null?money(unit1):"—");
 setText("sfg-rev-rate2",unit2!==null?money(unit2):"—");
 if(net1===null||net2===null){
  last=null;
  setText("sfg-rev-rate","待第二筆");setText("sfg-rev-implied","—");
  setText("sfg-rev-feedback","目前只有一筆報價：上面顯示的是單筆粗估，可能受到固定工資、最低收費影響。填第二筆才能用價差推估。");
  setText("sfg-rev-formula","第一筆係數 "+k1.toFixed(3)+"；第二筆係數 "+k2.toFixed(3)+"。");
  $("sfg-rev-apply").disabled=true;$("sfg-rev-save").disabled=true;
  updateReference(null);return;
 }
 const dk=k2-k1;
 if(Math.abs(dk)<1e-8){
  last=null;setText("sfg-rev-rate","無法反推");setText("sfg-rev-implied","—");
  setText("sfg-rev-feedback","兩組尺寸的（長＋寬）相同，框條計價係數沒有差異。請修改其中一組尺寸，例如改成 30 × 45cm。");
  setText("sfg-rev-formula","");
  $("sfg-rev-apply").disabled=true;$("sfg-rev-save").disabled=true;updateReference(null);return;
 }
 const materialDelta=(a2-a1)*rateMaterials,extraDelta=extra2-extra1;
 const rate=(net2-net1)/dk,implied=net1-k1*rate;
 const good=Number.isFinite(rate)&&rate>0&&Number.isFinite(implied);
 if(!good){
  last=null;setText("sfg-rev-rate","無有效單價");setText("sfg-rev-implied","—");
  setText("sfg-rev-feedback","扣除配件費後，推算出的框價不大於零，請確認兩次是否為同一款框、尺寸與金額是否填對。");
  setText("sfg-rev-formula","");
  $("sfg-rev-apply").disabled=true;$("sfg-rev-save").disabled=true;updateReference(null);return;
 }
 last={rate:Number(rate.toFixed(2)),rawRate:rate,frameName:selection().name,custom:selection().custom,quotes:[Number(p1),Number(p2)]};
 setText("sfg-rev-rate",money(rate));
 setText("sfg-rev-implied",money(implied));
 const gap=implied-fixed;
 const consistency=Math.abs(gap)<=3;
 setText("sfg-rev-feedback",consistency?
 "兩筆報價符合所填固定費假設（可能仍有報價進位、折扣或最低收費），可作為初步反推。":
 "兩筆單獨反推不一致。價差推估有「"+money(implied)+"」共同固定費，與你輸入的 "+money(fixed)+" 不同；請確認工資、起價或其他費用，套用前先核對。");
 setText("sfg-rev-formula",
  "係數："+k1.toFixed(3)+" → "+k2.toFixed(3)+"；配件費差 "+money(materialDelta)+"；其他變動費差 "+money(extraDelta)+"。單價＝（"+money(Number(p2))+"－"+money(Number(p1))+"－"+money(materialDelta)+"－"+money(extraDelta)+"）÷"+dk.toFixed(3)+"＝"+money(rate)+"。");
 $("sfg-rev-apply").disabled=false;$("sfg-rev-save").disabled=selection().custom;
 updateReference(rate);
}
function apply(){
 if(!last||!Number.isFinite(last.rate)||last.rate<=0||last.frameName!==selection().name)return false;
 $("sfg-frame-rate").value=String(last.rate);
 sfgCalculate();
 setText("sfg-rev-message","已套用 "+money(last.rate)+" 到目前的裱框試算（只變更本頁欄位，尚未儲存或修改 Airtable）。");
 return true;
}
function applySavedIfAny(){
 const x=selection();
 // 避免本機舊紀錄默默取代使用者指定的 Google 試算表單價。
 if(x.frame.rateSource&&x.frame.rateSource.startsWith("sheet-"))return;
 const entry=!x.custom?saved[x.name]:null;
 if(entry&&Number.isFinite(entry.rate)&&entry.rate>0){
  $("sfg-frame-rate").value=String(entry.rate);
  sfgCalculate();
  setText("sfg-price-source","價格來源：本機儲存的反推價（試算表尚無該款單價；不是正式報價）");
 }
}
["sfg-rev-l1","sfg-rev-w1","sfg-rev-p1","sfg-rev-l2","sfg-rev-w2","sfg-rev-p2",
 "sfg-rev-back-rate","sfg-rev-acrylic-rate","sfg-rev-fixed","sfg-rev-extra1","sfg-rev-extra2"].forEach(id=>$(id).addEventListener("input",()=>{setText("sfg-rev-message","");calculate();}));
["sfg-rev-back","sfg-rev-acrylic"].forEach(id=>$(id).addEventListener("change",()=>{setText("sfg-rev-message","");calculate();}));
$("sfg-rev-apply").addEventListener("click",apply);
$("sfg-rev-save").addEventListener("click",()=>{
 const x=selection();if(!last||x.custom||x.name!==last.frameName)return;
 const candidate={...saved,[x.name]:{rate:last.rate,date:new Date().toISOString().slice(0,10),quoted:last.quotes}};
 try{localStorage.setItem(key,JSON.stringify(candidate));saved=candidate;}
 catch{setText("sfg-rev-message","無法存入此瀏覽器；可先使用「套用到裱框試算」。");return;}
 applySavedIfAny();updateSaved();calculate();
 setText("sfg-rev-message","已儲存 "+x.name+" 的反推單價 "+money(last.rate)+"。如有 Google 試算表價格，下次選框仍優先使用試算表；若要使用反推價，請按「套用到裱框試算」。未修改 Google 試算表或 Airtable。");
});
$("sfg-rev-clear").addEventListener("click",()=>{
 const x=selection();if(x.custom||!Object.prototype.hasOwnProperty.call(saved,x.name))return;
 const candidate={...saved};delete candidate[x.name];
 try{localStorage.setItem(key,JSON.stringify(candidate));saved=candidate;}
 catch{setText("sfg-rev-message","無法更新瀏覽器儲存資料。");return;}
 $("sfg-frame-rate").value=x.frame.rate===null?"":String(x.frame.rate);
 sfgCalculate();updateSaved();calculate();
 setText("sfg-rev-message","已清除 "+x.name+" 的本機反推價，恢復頁面原有參考單價。");
});
$("sfg-frame-grid").addEventListener("click",event=>{
 if(!event.target.closest("[data-sfg-frame]"))return;
 applySavedIfAny();calculate();
 setText("sfg-rev-message","");
});
$("sfg-custom").addEventListener("click",()=>{
 if(!sfgCustomMode)applySavedIfAny();
 calculate();setText("sfg-rev-message","");
});
$("sfg-custom-name").addEventListener("input",calculate);
applySavedIfAny();
calculate();
if(location.hash==="#songfeng-reverse"){
 const tab=$("sfg");if(tab)tab.click();
 const details=$("sfg-reverse");details.open=true;
 requestAnimationFrame(()=>details.scrollIntoView({block:"start",behavior:"auto"}));
}
})();