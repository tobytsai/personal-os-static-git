/* Private, opt-in reminder sync. No credentials or private sheet IDs belong in this file. */
(function(root){
'use strict';
const HEADERS='id,title,date,phone,done,url,source,order_id,message_id,received_at,updated_at,deleted'.split(',');
const SCOPE='https://www.googleapis.com/auth/drive.file';
function validDate(s){return s==='' || (/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s);}
function safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
function decode(values){
 if(!values[0]||HEADERS.some((h,i)=>values[0][i]!==h))throw Error('提醒表格式不符：請選擇具有 reminders 工作表與正確欄名的私人試算表。');
 const records=new Map();
 values.slice(1).forEach((cells,i)=>{if(!cells[0])return;const x={_row:i+2};HEADERS.forEach((h,j)=>x[h]=String(cells[j]??''));x.done=x.done.toUpperCase()==='TRUE';x.deleted=x.deleted.toUpperCase()==='TRUE';
 const previous=records.get(x.id);if(previous)throw Error('提醒表含重複 ID，已停止寫入；請先在試算表合併重複列。');records.set(x.id,x);});return records;
}
function dueStatus(item){if(item.done)return '已完成';if(!item.date||!validDate(item.date))return '未設定期限';const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const days=Math.round((Date.parse(item.date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);return days<0?'已逾期 '+Math.abs(days)+' 天':days===0?'今天到期':'剩餘 '+days+' 天';}
function dirtyFields(original,current){return Object.fromEntries(Object.entries(current).filter(([k,v])=>v!==(original[k]??'')));}
function encode(x){return HEADERS.map(h=>h==='done'||h==='deleted'?(x[h]?'TRUE':'FALSE'):String(x[h]??''));}
class SheetStore{
 constructor(id,request){if(!/^[\w-]+$/.test(id))throw Error('試算表 ID 無效');this.base='https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/';this.request=request;this.queue=Promise.resolve();}
 async read(){const r=await this.request(this.base+encodeURIComponent("'reminders'!A:L"));return decode(r.values||[]);}
 mutate(id,patch,create=false){const operation=async()=>{const rows=await this.read(),existing=rows.get(id);if(create&&existing)return rows;if(!create&&(!existing||existing.deleted))throw Error('這則提醒已在其他裝置刪除，請重新整理。');
 const next={...(existing||{}),...patch,id,updated_at:new Date().toISOString()};if(!next.title?.trim()||!validDate(next.date||''))throw Error('請確認提醒內容與期限。');
 if(existing){ // Only changed cells: do not overwrite unrelated remote fields.
 const changes=Object.keys({...patch,updated_at:next.updated_at}).filter(k=>HEADERS.includes(k)&&k!=='id').map(k=>({range:"'reminders'!"+String.fromCharCode(65+HEADERS.indexOf(k))+existing._row,values:[[encode(next)[HEADERS.indexOf(k)]]]}));
 await this.request(this.base.slice(0,-1)+':batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data:changes})});
 }else await this.request(this.base+encodeURIComponent("'reminders'!A:L")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:[encode(next)]})});
 return this.read();};const p=this.queue.then(operation);this.queue=p.catch(()=>{});return p;}
}
function mount({key,entries}){
 const $=id=>document.getElementById(id),list=$('reminder-list'),form=$('reminder-form'),err=$('reminder-error');
 const configKey='tobyHomeReminderCloudConfigV1';let config={};try{config=JSON.parse(localStorage.getItem(configKey)||'{}')}catch{}
 let local=entries.map(x=>({...x})),visible=local,editing=null,opened={},pendingId=null,store=null,token='',expires=0,generation=0,busy=false,authPending=false;
 // Top 3 stores only reminder IDs in this browser, separate from the private Sheet.
 // Maintain distinct pin sets for local reminders and each selected cloud sheet.
 const focusKey='tobyHomeFocusPinsV1',focusHost=$('focus-items'),focusCounter=$('focus-count');
 let focusData={};try{const stored=JSON.parse(localStorage.getItem(focusKey)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))focusData=stored;}catch{}
 function focusScope(){return store&&config.sheet?'cloud:'+config.sheet:'local';}
 function savedPins(){const value=focusData[focusScope()];return Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&v.length>0&&v.length<180))].slice(0,3):[];}
 function availablePins(){const live=new Set(visible.filter(x=>x&&!x.done&&!x.deleted).map(x=>x.id));return savedPins().filter(id=>live.has(id));}
 function storePins(next){const updated={...focusData,[focusScope()]:next};try{localStorage.setItem(focusKey,JSON.stringify(updated));}catch{notice('這台裝置無法儲存重點釘選，請檢查瀏覽器儲存設定。');return false;}focusData=updated;return true;}
 function toggleFocus(id){
   if(busy||authPending)return;
   const pins=availablePins(),exists=pins.includes(id);
   if(!exists&&pins.length>=3){notice('今日重點最多三件；請先取消一件釘選。');return;}
   const next=exists?pins.filter(x=>x!==id):[...pins,id];
   if(storePins(next))render();
 }
 function renderFocus(){
   if(!focusHost||!focusCounter)return;
   const ids=availablePins(),byId=new Map(visible.map(x=>[x.id,x]));
   focusCounter.textContent=ids.length+' / 3';focusHost.replaceChildren();
   if(!ids.length){
     const empty=document.createElement('p');empty.className='focus-empty';
     empty.textContent='還沒有重點任務。到「提醒事項」按「☆ 設為重點」，即可釘選到這裡。';
     focusHost.append(empty);return;
   }
   ids.forEach(id=>{
     const item=byId.get(id),card=document.createElement('article');
     card.className='focus-item';
     const title=document.createElement('div');title.className='focus-item-title';title.textContent=item.title;
     const meta=document.createElement('div');meta.className='focus-item-meta';
     meta.textContent=(item.date?'期限：'+item.date:'未設定期限')+'｜'+dueStatus(item);
     const actions=document.createElement('div');actions.className='focus-item-actions';
     actions.append(button('完成',()=>run(()=>change(id,{done:true}))),button('取消釘選',()=>toggleFocus(id)));
     card.append(title,meta,actions);focusHost.append(card);
   });
   focusHost.querySelectorAll('button').forEach(btn=>btn.disabled=busy||authPending);
 }

 const panel=document.createElement('details');panel.className='reminder-cloud';panel.innerHTML='<summary>☁ 私人雲端同步設定</summary><p>只存取你選取的 Google 試算表；不會公開提醒。本機提醒不會自動上傳。</p><div class="reminder-cloud-fields"><label>Google Web OAuth Client ID<input id="reminder-client" autocomplete="off" placeholder="…apps.googleusercontent.com"></label><label>Google Picker API key<input id="reminder-api-key" autocomplete="off"></label><label>Google Cloud 專案編號<input id="reminder-project" inputmode="numeric" autocomplete="off"></label></div><p><a href="./reminder-cloud-help.html" target="_blank" rel="noopener">首次設定說明</a> · <a href="./reminder-line-help.html" target="_blank" rel="noopener">🔔 LINE 到期提醒設定</a> · 請勿輸入 client secret 或登入密碼。</p><div class="reminder-actions" id="reminder-cloud-actions"></div>';
 list.before(panel);const status=document.createElement('p');status.id='reminder-cloud-status';status.setAttribute('role','status');panel.after(status);
 const fields=[$('reminder-client'),$('reminder-api-key'),$('reminder-project')];fields.forEach((el,i)=>el.value=config[['client','apiKey','project'][i]]||'');
 function notice(s){status.textContent=s;}
 function fail(e){notice(e.message||'連線失敗，請稍後重試。');}
 function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;}
 function closeForm(){form.hidden=true;form.reset();editing=null;pendingId=null;err.hidden=true;}
 function disconnect(){generation++;token='';expires=0;store=null;authPending=false;visible=local;closeForm();notice('本機模式；本頁的 Google 存取權杖已清除。Google 帳戶授權可至帳戶安全性設定撤銷。');render();}
 async function request(url,options={}){if(!token||Date.now()>=expires)throw Error('Google 登入已到期，請按「連線 Google」重新授權；未自動重送寫入。');const current=generation;let response;try{response=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)})}catch{throw Error('網路中斷：寫入結果可能尚未確認，請重新整理後再試。')}
 if(current!==generation)throw Error('連線已變更，請重新整理。');if(response.status===401){token='';expires=0;throw Error('Google 登入已到期，請重新連線。');}if(!response.ok)throw Error(response.status===403?'無法存取：請確認 API 已啟用，並使用「選擇提醒表」授權該檔案。':'Google Sheets 操作失敗（'+response.status+'），請重新整理後再試。');return response.json();}
 async function refresh(){if(!store)throw Error('請先登入並選擇提醒表。');const current=generation,rows=await store.read();if(current!==generation)return;visible=[...rows.values()].filter(x=>!x.deleted);render();notice('雲端模式 · 已重新整理 '+new Date().toLocaleTimeString('zh-TW')+'；不會自動推播。');}
 async function run(fn){if(busy||authPending)return;busy=true;render();try{await fn()}catch(e){fail(e)}finally{busy=false;render();}}
 function taipeiDay(offset=0){
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);
 }
 function snoozedDate(date){
   const today=taipeiDay(),base=validDate(date)&&date>=today?date:today;
   const d=new Date(base+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
 }
 function quickValue(raw){
   let title=String(raw||'').trim(),date='';
   const suffix=/(?:^|\s)@(今天|明天|後天|\d{4}-\d{2}-\d{2})\s*$/.exec(title);
   if(suffix){
     const when=suffix[1];
     date=when==='今天'?taipeiDay():when==='明天'?taipeiDay(1):when==='後天'?taipeiDay(2):when;
     title=title.slice(0,suffix.index).trim();
   }
   if(!title||title.length>120||!validDate(date))throw Error('請輸入 1～120 字的提醒內容，並確認 @日期 有效。');
   return {title,date,phone:'',done:false,deleted:false,source:'manual'};
 }
 function render(){
 list.replaceChildren();if(!visible.length){const p=document.createElement('p');p.textContent=store?'雲端沒有提醒；本機提醒仍保留，可自行選擇上傳。':'目前沒有提醒。';list.append(p);}
 [...visible].sort((a,b)=>Number(a.done)-Number(b.done)||String(a.date||'9999').localeCompare(String(b.date||'9999'))).forEach(item=>{
 const row=document.createElement('article');row.className='reminder-item'+(item.done?' done':'');const info=document.createElement('div'),title=document.createElement('div'),meta=document.createElement('div');title.className='reminder-title';title.textContent=item.title;meta.className='reminder-meta';meta.textContent=(item.date?'期限：'+item.date:'未設定期限')+'｜'+dueStatus(item);
 if(item.phone){const a=document.createElement('a');a.href='tel:'+String(item.phone).replace(/[^+0-9]/g,'');a.textContent=item.phone;meta.append('｜',a)}const url=safeUrl(item.url);if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=new URL(url).hostname==='mail.google.com'?'查看 Gmail 通知':'查看相關連結';meta.append('｜',a)}
 const actions=document.createElement('div');actions.className='reminder-actions';actions.append(button(item.done?'恢復未完成':'標記完成',()=>run(()=>change(item.id,{done:!item.done}))));if(!item.done){const snooze=button('延後 1 天',()=>run(()=>change(item.id,{date:snoozedDate(item.date)})));snooze.className='reminder-snooze';actions.append(snooze);const focused=availablePins().includes(item.id),pin=button(focused?'📌 取消重點':'☆ 設為重點',()=>toggleFocus(item.id));pin.className='reminder-pin';pin.setAttribute('aria-pressed',String(focused));actions.append(pin);}actions.append(button('編輯',()=>showForm(item)),button('刪除',()=>{if(confirm('確定刪除這則提醒？雲端會保留刪除標記避免再次匯入。'))run(()=>change(item.id,{deleted:true}))}));info.append(title,meta);row.append(info,actions);list.append(row);
 });renderFocus();document.querySelectorAll('.reminders button').forEach(b=>b.disabled=busy||(authPending&&b.textContent!=='中斷連線／回本機'));fields.forEach(f=>f.disabled=busy||authPending||!!token);
 }
 async function change(id,patch,create=false){if(store){const current=generation,rows=await store.mutate(id,patch,create);if(current!==generation)return;visible=[...rows.values()].filter(x=>!x.deleted);notice('已儲存至私人雲端提醒表。');}else{const next=local.map(x=>({...x})),i=next.findIndex(x=>x.id===id);if(i>=0)Object.assign(next[i],patch);else if(create)next.push({...patch,id});else throw Error('提醒不存在');const filtered=next.filter(x=>!x.deleted);try{localStorage.setItem(key,JSON.stringify(filtered))}catch{throw Error('本機儲存失敗，請檢查瀏覽器設定。')}local=filtered;visible=local;}if(patch.done===true||patch.deleted===true){const pins=savedPins();if(pins.includes(id))storePins(pins.filter(x=>x!==id));}render();}
 function showForm(item){if(busy||authPending)return;editing=item?.id||null;pendingId=item?.id||'r-'+crypto.randomUUID();form.hidden=false;err.hidden=true;form.elements.title.value=item?.title||'';form.elements.date.value=item?.date||'';form.elements.phone.value=item?.phone||'';opened={title:form.elements.title.value,date:form.elements.date.value,phone:form.elements.phone.value};form.elements.title.focus();}
 const quickForm=$('reminder-quick-form'),quickInput=$('reminder-quick-input');
 if(quickForm&&quickInput)quickForm.onsubmit=e=>{
   e.preventDefault();if(busy||authPending)return;
   let patch;try{patch=quickValue(quickInput.value);}catch(error){notice(error.message);quickInput.focus();return;}
   run(async()=>{
     await change('r-'+crypto.randomUUID(),patch,true);
     quickForm.reset();notice('提醒已新增'+(patch.date?' · 期限 '+patch.date:'')+'。');
   });
 };
 const focusChoose=$('focus-choose');
 if(focusChoose)focusChoose.onclick=()=>{
   const content=$('reminder-content'),toggle=$('reminder-toggle');
   if(content&&content.hidden&&toggle)toggle.click();
   list.scrollIntoView?.({behavior:'smooth',block:'start'});
 };
 $('reminder-add').onclick=()=>showForm(null);$('reminder-cancel').onclick=closeForm;
 form.onsubmit=e=>{e.preventDefault();const patch={title:form.elements.title.value.trim(),date:form.elements.date.value,phone:form.elements.phone.value.trim()};if(!patch.title||!validDate(patch.date)){err.hidden=false;err.textContent='請確認提醒內容與期限。';return}run(async()=>{await change(pendingId,editing?dirtyFields(opened,patch):{...patch,done:false,deleted:false,source:'manual'},!editing);closeForm()})};
 function saveConfig(){const [client,apiKey,project]=fields.map(f=>f.value.trim());if(!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(client)||!apiKey||!/^\d+$/.test(project))throw Error('請先填寫有效的 Web Client ID、Picker API key 與專案編號。');config={...config,client,apiKey,project};localStorage.setItem(configKey,JSON.stringify(config));}
 function connect(){if(busy||authPending)return;try{saveConfig();if(!root.google?.accounts?.oauth2)throw Error('Google 登入程式尚未載入，請稍後重試。');authPending=true;const current=++generation;render();notice('請完成 Google 登入；尚未上傳任何本機提醒。');const finish=()=>{authPending=false;render();};const client=google.accounts.oauth2.initTokenClient({client_id:config.client,scope:SCOPE,include_granted_scopes:false,callback:async r=>{if(current!==generation)return;finish();if(r.error||!r.access_token){notice('Google 未完成授權，請重試。');return}if(!google.accounts.oauth2.hasGrantedAllScopes(r,SCOPE)){notice('未取得選取檔案權限。');return}token=r.access_token;expires=Date.now()+Math.max(0,Number(r.expires_in||3600)-60)*1000;if(config.sheet){store=new SheetStore(config.sheet,request);closeForm();visible=[];await run(refresh)}else notice('已登入；請按「選擇提醒表」。');render();},error_callback:()=>{if(current!==generation)return;finish();notice('登入視窗未完成或被封鎖；請再次按連線 Google。')}});client.requestAccessToken({prompt:''});}catch(e){authPending=false;fail(e);render();}}
 let pickerReady;
 function loadPicker(){if(root.google?.picker)return Promise.resolve();if(!pickerReady)pickerReady=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://apis.google.com/js/api.js';s.onload=()=>gapi.load('picker',{callback:resolve,onerror:reject,timeout:15000,ontimeout:reject});s.onerror=reject;document.head.append(s);}).catch(()=>{pickerReady=null;throw Error('Google 檔案選擇器載入失敗，請重試。')});return pickerReady;}
 async function pick(){if(!token||Date.now()>=expires)throw Error('請先按「連線 Google」。');await loadPicker();const current=generation;const view=new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMimeTypes('application/vnd.google-apps.spreadsheet');const id=await new Promise((resolve)=>{new google.picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(config.apiKey).setAppId(config.project).setOrigin(location.origin).setCallback(data=>{if(current!==generation){resolve(null);return}if(data.action===google.picker.Action.PICKED)resolve(data.docs?.[0]?.id||null);else if(data.action===google.picker.Action.CANCEL)resolve(null);}).build().setVisible(true);});if(!id||current!==generation)return;const candidate=new SheetStore(id,request);await candidate.read();if(current!==generation)return;config.sheet=id;localStorage.setItem(configKey,JSON.stringify(config));store=candidate;closeForm();await refresh();}

 $('reminder-cloud-actions').append(button('連線 Google',connect),button('選擇提醒表',()=>run(pick)),button('重新整理雲端',()=>run(refresh)),button('上傳本機提醒',()=>{if(!store){notice('請先連線並選擇提醒表。');return}if(confirm('將目前 '+local.length+' 則本機提醒新增至所選私人試算表？既有相同 ID（包括已完成或已刪除）不會覆蓋。'))run(async()=>{for(const item of local)await store.mutate(item.id,{...item,source:item.source||'local-import',deleted:false},true);await refresh()})}),button('中斷連線／回本機',disconnect));
 notice('本機模式 · 雲端同步尚未連線。');render();
}
const api={HEADERS,SCOPE,dirtyFields,validDate,safeUrl,decode,encode,SheetStore,mount};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HomeReminderSync=api;
})(typeof window==='undefined'?globalThis:window);
