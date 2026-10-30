(()=>{
'use strict';
const $=id=>document.getElementById(id);
if(!$('stkWorkspace'))return;
const DEFAULTS=[
 ['2382','廣達','AI伺服器／組裝'],['2609','陽明','航運'],
 ['2454','聯發科','半導體'],['2308','台達電','電源／電力'],
 ['2330','台積電','半導體'],['1513','中興電','電源／電力'],
 ['6526','達發','半導體'],['3231','緯創','AI伺服器／組裝'],
 ['2376','技嘉','AI伺服器／組裝'],['2317','鴻海','AI伺服器／組裝'],
 ['2357','華碩','電腦／品牌'],['2369','菱生','半導體'],
 ['8422','可寧衛*','環保／循環'],['2344','華邦電','記憶體'],
 ['2324','仁寶','AI伺服器／組裝']
].map(([code,name,sector])=>({code,name,sector,priority:false,note:''}));
const WATCH_KEY='tobyStocksWatchV20261030', JOURNAL_KEY='tobyStocksJournalV20261030';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={
 read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}},
 write(k,obj){try{localStorage.setItem(k,JSON.stringify(obj));return true}catch{return false}}
};
function valid(x){return x&&/^[0-9A-Za-z.]{2,10}$/.test(x.code)&&typeof x.name==='string'&&x.name.length<60}
let stored=store.read(WATCH_KEY,null);
let stocks=Array.isArray(stored)?stored.filter(valid).slice(0,100):DEFAULTS.map(x=>({...x}));
const existing=new Set(stocks.map(x=>x.code));
if(!Array.isArray(stored)){store.write(WATCH_KEY,stocks)}
let journals=store.read(JOURNAL_KEY,{});
if(!journals||typeof journals!=='object'||Array.isArray(journals))journals={};
let prices={},indexData=null,quoteDate='',indexDate='',loading=false;
let filter='全部',search='',sort='original',priorityOnly=false;
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateKey=today();
const prettyDate=x=>{if(/^\d{7}$/.test(String(x||'')))return (Number(x.slice(0,3))+1911)+'-'+x.slice(3,5)+'-'+x.slice(5,7);return String(x||'')};
const num=x=>{const n=Number(String(x??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:null};
const fmt=(x,d=2)=>x===null||x===undefined||!Number.isFinite(x)?'—':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:d});
const signed=x=>x==null||!Number.isFinite(x)?'—':(x>0?'+':'')+fmt(x,2);
const dayNote=()=>journals[dateKey]||{};
function persistStocks(){store.write(WATCH_KEY,stocks)}
function status(){const d=new Date();const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',hour:'2-digit',hourCycle:'h23'}).format(d));const minute=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',minute:'2-digit'}).format(d));const day=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',weekday:'short'}).format(d);const t=hour*60+minute;
let name='非交易時段',details='休市日或交易時段以外';
if(!['Sat','Sun'].includes(day)){
 if(t<510){name='盤前準備';details='09:00 開始一般交易'}
 else if(t<540){name='委託時段';details='08:30 起可委託，09:00 開始一般交易'}
 else if(t<=810){name='盤中交易';details='09:00–13:30；此頁非即時報價'}
 else if(t<870){name='盤後整理';details='收盤後資料可能稍晚更新'}
 else{name='盤後研究';details='準備次日觀察清單'}
}
$('stkMarketClock').textContent=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
$('stkMarketState').textContent=name;
$('stkMarketStateDesc').textContent=details;
}
function renderIndex(){
 const n=$('stkIndex');const v=indexData&&num(indexData['收盤指數']);const p=indexData&&num(indexData['漲跌百分比']);
 n.textContent=v===null||v===undefined?'—':fmt(v,2);
 const diff=$('stkIndexChange');diff.textContent=p===null||p===undefined?'尚無官方資料':signed(p)+'%';
 diff.className=(p>0?'stk-positive':p<0?'stk-negative':'');
 $('stkQuoteDate').textContent=quoteDate||'尚未取得';
 $('stkIndexDate').textContent=indexDate||'尚未取得';
 $('stkUpdated').textContent='來源：證交所公開盤後資料（非即時）；最新可取得交易日 '+(quoteDate||'—');
 $('stkSnapshotDate').textContent='行情資料日：'+(quoteDate||'尚未取得')+'；非盤中即時報價';
}
function getPrice(code){
 const x=prices[code];if(!x)return null;
 const close=num(x.ClosingPrice),change=num(x.Change),volume=num(x.TradeVolume);
 const prev=close!==null&&change!==null?close-change:null;
 const pct=prev!==null&&prev>0?100*change/prev:null;
 return {close,change,pct,volume,open:num(x.OpeningPrice),high:num(x.HighestPrice),low:num(x.LowestPrice)};
}
function renderWatch(){
 const groups=['全部',...new Set(stocks.map(x=>x.sector))];
 $('stkGroups').innerHTML=groups.map(g=>'<button type="button" class="stk-chip '+(g===filter?'active':'')+'" data-group="'+esc(g)+'">'+esc(g)+'</button>').join('');
 const list=stocks.filter(x=>(filter==='全部'||x.sector===filter)&&(!priorityOnly||x.priority)&&(!search||(x.code+' '+x.name+' '+x.sector+' '+(x.note||'')).toLowerCase().includes(search.toLowerCase())));
 list.sort((a,b)=>{if(sort==='code')return a.code.localeCompare(b.code,'zh-TW',{numeric:true});
 if(sort==='change'||sort==='volume'){const av=getPrice(a.code),bv=getPrice(b.code);return (sort==='change'?(bv?.pct??-Infinity)-(av?.pct??-Infinity):(bv?.volume??-1)-(av?.volume??-1))||a.code.localeCompare(b.code)}
 if(sort==='priority')return Number(!!b.priority)-Number(!!a.priority);
 return stocks.indexOf(a)-stocks.indexOf(b)});
 $('stkWatchCount').textContent='目前顯示 '+list.length+' / '+stocks.length+' 檔';
 const rows=list.map(s=>{
 const d=getPrice(s.code);const delta=d?.pct,changeCls=delta>0?'stk-positive':delta<0?'stk-negative':'';
 const quote='https://tw.stock.yahoo.com/quote/'+encodeURIComponent(s.code+'.TW');
 return '<tr><td><button type="button" class="stk-action '+(s.priority?'active':'')+'" data-priority="'+esc(s.code)+'" aria-label="'+(s.priority?'取消重點':'設為重點')+'">'+(s.priority?'★':'☆')+'</button></td>'+
 '<td><a class="stk-stockname" href="'+quote+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+'</a><div class="stk-small">'+esc(s.code)+'</div></td>'+
 '<td>'+esc(s.sector)+'</td><td><strong>'+fmt(d?.close)+'</strong></td><td class="'+changeCls+'">'+(d?signed(d.change)+' / '+signed(delta)+'%':'—')+'</td>'+
 '<td>'+(d?.volume!==null&&d?.volume!==undefined?fmt(d.volume/1000,0):'—')+'</td>'+
 '<td><button type="button" class="stk-action" title="'+esc(s.note||'點擊編輯筆記')+'" data-note="'+esc(s.code)+'">✎ '+(s.note?'有筆記':'筆記')+'</button></td>'+
 '<td><button type="button" class="stk-action" data-remove="'+esc(s.code)+'">移除</button></td></tr>';
 }).join('');
 $('stkWatchRows').innerHTML=rows||'<tr><td colspan="8" style="text-align:center;color:#7b8592;padding:23px">沒有符合條件的觀察股</td></tr>';
 $('stkPriorityCount').textContent=stocks.filter(x=>x.priority).length+' 檔重點觀察';
}
function reportText(){
 const ds=stocks.map(s=>({s,d:getPrice(s.code)})).filter(x=>x.d&&x.d.close!==null&&x.d.pct!==null);
 const ups=ds.filter(x=>x.d.pct>0),downs=ds.filter(x=>x.d.pct<0),flat=ds.length-ups.length-downs.length;
 const sorted=[...ds].sort((a,b)=>b.d.pct-a.d.pct);
 const highlights=(items)=>items.map(({s,d})=>s.name+' '+s.code+' '+signed(d.pct)+'%').join('、')||'無';
 return [
 '【市場收盤速覽｜官方資料 '+(quoteDate||'尚未載入')+'】',
 indexData?'加權指數 '+fmt(num(indexData['收盤指數']))+'（'+signed(num(indexData['漲跌百分比']))+'%）':'加權指數：尚未載入',
 '觀察股：有行情 '+ds.length+' 檔，上漲 '+ups.length+'、下跌 '+downs.length+'、平盤 '+flat+'；不含未取得行情標的。',
 '相對較強：'+highlights(sorted.slice(0,3)),
 '相對較弱：'+highlights(sorted.slice(-3).reverse()),
 '（依官方最近交易日資料計算，非即時報價；不同交易日請勿直接比較。）'
 ].join('\n');
}
function renderReport(){
 $('stkAutoReport').value=reportText();
}
async function loadQuotes(){
 if(loading)return;loading=true;$('stkReload').disabled=true;$('stkReload').textContent='讀取中…';
 $('stkDataStatus').textContent='正在從臺灣證券交易所載入最近交易日的收盤資料…';
 const targets=[
 ['stocks','https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'],
 ['index','https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX']
 ];
 const res=await Promise.allSettled(targets.map(async ([k,url])=>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),14000);
 try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);const rows=await response.json();if(!Array.isArray(rows))throw Error('資料格式不符');return {k,rows}}
 finally{clearTimeout(timer)}
 }));
 const ok=[],bad=[];
 for(let i=0;i<res.length;i++){
 const r=res[i];if(r.status==='rejected'){bad.push(targets[i][0]);continue}
 const {k,rows}=r.value;if(k==='stocks'){
  const p={};for(const row of rows){if(row&&row.Code)p[String(row.Code)]=row}
  prices=p;quoteDate=prettyDate(rows.find(x=>x&&x.Date)?.Date)||'—';ok.push('個股');
 }else{
  indexData=rows.find(x=>x['指數']==='發行量加權股價指數')||null;
  indexDate=prettyDate(indexData?.['日期'])||'—';ok.push('加權指數');
 }
 }
 $('stkDataStatus').textContent=ok.length?'已更新：'+ok.join('、')+'。'+(bad.length?'部分資料讀取失敗，可使用外部行情連結。':'請注意這是盤後資料，不是即時價格。'):'官方行情無法讀取（可能為網路、瀏覽器跨網域限制或網站暫時無回應）。可點個股名稱查看外部行情。';
 renderIndex();renderWatch();renderReport();
 loading=false;$('stkReload').disabled=false;$('stkReload').textContent='↻ 更新官方盤後資料';
}
function updateJournal(){
 const obj={...dayNote()};
 document.querySelectorAll('[data-stk-journal]').forEach(e=>{obj[e.dataset.stkJournal]=e.type==='checkbox'?e.checked:e.value});
 journals[dateKey]=obj;
 $('stkSaveState').textContent=store.write(JOURNAL_KEY,journals)?'當日紀錄已保存在此瀏覽器':'儲存失敗：請確認瀏覽器允許本機儲存';
}
function restoreJournal(){
 const obj=dayNote();$('stkDate').textContent=dateKey;
 document.querySelectorAll('[data-stk-journal]').forEach(e=>{const x=obj[e.dataset.stkJournal];if(e.type==='checkbox')e.checked=!!x;else e.value=x||''});
}
function textDump(){
 const j=dayNote();
 const fields=[['pre-us','美股與國際'],['pre-events','重大事件'],['pre-plan','今日觀察與價位'],['post-index','大盤與量價'],['post-flows','法人與籌碼'],['post-review','個股觀察與原因'],['post-plan','明日觀察與風險']];
 const notes=fields.map(([k,l])=>l+'：'+(j[k]||'（未填）')).join('\n');
 return '股票啟動器｜'+dateKey+'\n\n'+reportText()+'\n\n【盤前／盤後紀錄】\n'+notes+
 '\n\n【重點股票】\n'+(stocks.filter(x=>x.priority).map(x=>x.code+' '+x.name+(x.note?'｜'+x.note:'')).join('\n')||'未標記')+
 '\n\n資料註記：此報告為人工紀錄及交易所最近公開盤後資訊；不代表即時行情或投資建議。';
}
async function copyText(){
 const value=textDump();
 try{await navigator.clipboard.writeText(value);$('stkSaveState').textContent='已複製盤前／盤後整理到剪貼簿'}
 catch{const box=$('stkAutoReport');box.value=value;box.focus();box.select();$('stkSaveState').textContent='已選取整理內容，可手動複製'}
}
function exportBackup(){
 const obj={exportedAt:new Date().toISOString(),watchlist:stocks,journals};
 const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='股票啟動器備份-'+dateKey+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importBackup(file){
 if(!file)return;
 try{
  const j=JSON.parse(await file.text());
  if(!Array.isArray(j.watchlist)||!j.watchlist.every(valid)||typeof j.journals!=='object'||!j.journals||Array.isArray(j.journals))throw Error('不是有效的股票啟動器備份');
  if(!confirm('匯入將取代此瀏覽器現有的觀察股與每日筆記，確定繼續？'))return;
  stocks=j.watchlist.slice(0,100);journals=j.journals;
  persistStocks();store.write(JOURNAL_KEY,journals);restoreJournal();renderWatch();renderReport();
  $('stkSaveState').textContent='已匯入 '+stocks.length+' 檔觀察股與分析筆記';
 }catch(e){$('stkSaveState').textContent='匯入失敗：'+(e?.message||'無法解析檔案')}
 finally{$('stkImport').value=''}
}
$('stkWatchRows').addEventListener('click',e=>{
 const btn=e.target.closest('button');if(!btn)return;
 const c=btn.dataset.priority||btn.dataset.remove||btn.dataset.note;
 const s=stocks.find(x=>x.code===c);if(!s)return;
 if(btn.hasAttribute('data-priority'))s.priority=!s.priority;
 if(btn.hasAttribute('data-note')){const value=prompt(s.name+'（'+s.code+'）觀察筆記：\n例如：關注價位、財報日期、籌碼變化',s.note||'');if(value===null)return;s.note=value.slice(0,600)}
 if(btn.hasAttribute('data-remove')){if(!confirm('要把 '+s.name+'（'+s.code+'）從觀察股移除嗎？'))return;stocks=stocks.filter(x=>x.code!==c)}
 persistStocks();renderWatch();renderReport();
});
$('stkGroups').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(!b)return;filter=b.dataset.group;renderWatch()});
$('stkSearch').addEventListener('input',e=>{search=e.target.value.trim();renderWatch()});
$('stkSort').addEventListener('change',e=>{sort=e.target.value;renderWatch()});
$('stkPriorityOnly').addEventListener('change',e=>{priorityOnly=e.target.checked;renderWatch()});
$('stkReload').addEventListener('click',loadQuotes);
$('stkAddButton').addEventListener('click',()=>{
 const code=$('stkAddCode').value.trim().toUpperCase(),name=$('stkAddName').value.trim(),sector=$('stkAddSector').value;
 if(!/^[0-9A-Z.]{2,10}$/.test(code)){alert('請輸入有效的股票代碼');return}
 if(!name){alert('請填入公司名稱');return}
 if(stocks.some(x=>x.code===code)){alert('觀察清單已經有這檔股票');return}
 if(stocks.length>=100){alert('最多保留 100 檔觀察股');return}
 stocks.push({code,name:name.slice(0,59),sector,priority:false,note:''});persistStocks();filter='全部';search='';$('stkSearch').value='';$('stkAddCode').value='';$('stkAddName').value='';renderWatch();
});
document.querySelectorAll('[data-stk-journal]').forEach(e=>e.addEventListener('input',updateJournal));
$('stkCopy').addEventListener('click',copyText);
$('stkBackup').addEventListener('click',exportBackup);
$('stkImport').addEventListener('change',e=>importBackup(e.target.files?.[0]));
$('stkQuoteDate').textContent='尚未載入';
restoreJournal();status();renderWatch();renderIndex();renderReport();loadQuotes();
setInterval(status,60000);
})();