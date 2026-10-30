/* Google Drive appDataFolder sync for stock watchlist & daily journals.
 * No tokens or private stock records are committed to GitHub.
 * Each browser owns one append-safe device file, other devices are read-only inputs.
 */
(()=>{
'use strict';
const bridge=window.TobyStockCloudBridge;
if(!bridge||!document.getElementById('stkCloudConnect'))return;
const $=id=>document.getElementById(id);
const FILE_PREFIX='toby-stock-workspace-v1-';
const CLIENT_KEY='tobyLauncherGoogleClientId';
const DEVICE_KEY='tobyStockCloudDeviceV1';
const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const MAX_STOCKS=100;
const getDevice=()=>{
 let id=localStorage.getItem(DEVICE_KEY);
 if(!id){
  id=crypto.randomUUID?crypto.randomUUID():(Date.now()+'-'+Math.random().toString(36).slice(2));
  localStorage.setItem(DEVICE_KEY,id);
 }
 return id;
};
const device=getDevice(),fileName=FILE_PREFIX+device+'.json';
let token='',expires=0,busy=false,again=false,debounce=null,ownFile=null,connected=false;
const clientInput=$('stkCloudClientId');
clientInput.value=localStorage.getItem(CLIENT_KEY)||'';
function state(text,isError=false){
 const box=$('stkCloudStatus');
 box.textContent=text;
 box.style.color=isError?'#9d323a':'#386358';
}
function updateControls(){
 $('stkCloudConnect').textContent=connected?'Google 已連線':'使用 Google 連線';
 $('stkCloudDisconnect').disabled=!connected;
 $('stkCloudSync').disabled=!connected||busy;
 $('stkCloudClientId').disabled=connected;
}
async function driveFetch(url,options={}){
 if(!token||Date.now()>expires){
  connected=false;updateControls();
  throw new Error('Google 授權已到期，請重新點「使用 Google 連線」');
 }
 const response=await fetch(url,{...options,headers:{
  Authorization:'Bearer '+token,...options.headers
 }});
 if(!response.ok){
  if(response.status===401){token='';connected=false;updateControls();throw new Error('Google 授權已到期，請重新連線')}
  const message=await response.text().catch(()=>''),short=message.slice(0,220);
  throw new Error('Google Drive API '+response.status+(short?'：'+short:''));
 }
 return response.json();
}
async function listCloudFiles(){
 const files=[];
 let page='';
 do{
  const qs=new URLSearchParams({spaces:'appDataFolder',fields:'nextPageToken,files(id,name,modifiedTime)',pageSize:'100'});
  if(page)qs.set('pageToken',page);
  const data=await driveFetch('https://www.googleapis.com/drive/v3/files?'+qs);
  files.push(...(data.files||[]).filter(f=>f.name?.startsWith(FILE_PREFIX)&&f.name?.endsWith('.json')));
  page=data.nextPageToken||'';
 }while(page);
 return files;
}
function isValidSnapshot(x){
 return x&&x.version===1&&Array.isArray(x.stocks)&&x.stocks.length<=MAX_STOCKS&&x.stocks.every(s=>
  s&&/^[0-9A-Za-z.]{2,10}$/.test(s.code)&&typeof s.name==='string'
 )&&x.journals&&typeof x.journals==='object'&&!Array.isArray(x.journals)
  &&x.meta&&typeof x.meta==='object';
}
async function loadCloudFile(file){
 const data=await driveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media');
 if(!isValidSnapshot(data))throw new Error('雲端資料格式不符：'+file.name+'；已停止合併，避免資料遺失');
 return data;
}
const finiteTime=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:0};
function mergeSnapshots(all){
 const stocksByCode=new Map(),removed={},journalsOut={},journalTimesOut={};
 const stockTimesOut={};
 for(const src of all){
  const meta=src.meta||{},stocks=src.stocks||[];
  for(const [code,time] of Object.entries(meta.tombstones||{})){
   if(/^[0-9A-Za-z.]{2,10}$/.test(code))removed[code]=Math.max(removed[code]||0,finiteTime(time));
  }
  for(const s of stocks){
   if(!s||!/^[0-9A-Za-z.]{2,10}$/.test(s.code))continue;
   const time=finiteTime(meta.stockTimes?.[s.code]);
   const previous=stocksByCode.get(s.code);
   // Equal timestamps keep the earlier candidate (local snapshot first).
   if(!previous||time>previous.time)stocksByCode.set(s.code,{value:{...s},time});
  }
  for(const [date,record] of Object.entries(src.journals||{})){
   if(!record||typeof record!=='object'||Array.isArray(record))continue;
   journalsOut[date]??={};journalTimesOut[date]??={};
   for(const [field,value] of Object.entries(record)){
    const time=finiteTime(meta.journalTimes?.[date]?.[field]??1);
    if(journalTimesOut[date][field]===undefined||time>journalTimesOut[date][field]){
     journalsOut[date][field]=value;journalTimesOut[date][field]=time;
    }
   }
  }
 }
 const validCodes=new Set([...stocksByCode.keys()].filter(code=>!removed[code]||stocksByCode.get(code).time>removed[code]));
 const stocks=[],seen=new Set();
 for(const src of all){
  for(const item of src.stocks||[]){
   const code=item.code;if(!validCodes.has(code)||seen.has(code))continue;
   stocks.push(stocksByCode.get(code).value);seen.add(code);
   stockTimesOut[code]=stocksByCode.get(code).time;
  }
 }
 if(stocks.length>MAX_STOCKS)throw new Error('合併後超過 '+MAX_STOCKS+' 檔，已停止同步，避免截斷資料');
 return {stocks,journals:journalsOut,meta:{stockTimes:stockTimesOut,tombstones:removed,journalTimes:journalTimesOut}};
}
const comparable=o=>JSON.stringify({stocks:o.stocks,journals:o.journals,meta:o.meta});
async function uploadCurrent(snapshot,existing){
 const data={version:1,deviceId:device,exportedAt:new Date().toISOString(),...snapshot};
 const json=JSON.stringify(data);
 if(new Blob([json]).size>4*1024*1024)throw new Error('雲端備份超過 4MB，請先匯出 JSON 整理');
 if(existing){
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(existing.id)+'?uploadType=media&fields=id,modifiedTime',{
   method:'PATCH',headers:{'Content-Type':'application/json; charset=UTF-8'},body:json
  });
 }
 const boundary='toby_cloud_'+Math.random().toString(36).slice(2);
 const metadata=JSON.stringify({name:fileName,mimeType:'application/json',parents:['appDataFolder']});
 const body=new Blob([
  '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
  metadata,
  '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
  json,
  '\r\n--'+boundary+'--'
 ],{type:'multipart/related; boundary='+boundary});
 return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',{
  method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
 });
}
async function syncCloud(manual=false){
 if(!connected||busy){if(busy&&connected)again=true;return}
 busy=true;updateControls();state('正在讀取各裝置的雲端資料並安全合併…');
 try{
  const files=await listCloudFiles();
  const self=files.filter(x=>x.name===fileName).sort((a,b)=>String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0];
  ownFile=self||null;
  // Treat read/parse failures as hard errors. Never write on partial remote reads.
  const fromDrive=await Promise.all(files.map(loadCloudFile));
  const local=bridge.getSnapshot();
  const combined=mergeSnapshots([local,...fromDrive]);
  if(comparable(local)!==comparable(combined))bridge.applySnapshot(combined);
  const oldSelf=self?fromDrive[files.indexOf(self)]:null;
  if(!oldSelf||comparable(oldSelf)!==comparable(combined)){
   const saved=await uploadCurrent(combined,self);
   ownFile={id:saved.id||self?.id,name:fileName};
  }
  $('stkCloudLastSync').textContent='上次成功同步：'+new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'});
  state('✓ 雲端同步完成：'+files.length+' 個裝置備份；目前 '+combined.stocks.length+' 檔觀察股與 '+Object.keys(combined.journals).length+' 日筆記。');
 }catch(error){
  state('同步未完成：'+(error?.message||String(error))+'。手機本機資料不會因此刪除。',true);
 }finally{
  busy=false;updateControls();
  if(again&&connected){again=false;queueSync(500)}
 }
}
function queueSync(ms=1600){
 if(!connected)return;
 if(debounce)clearTimeout(debounce);
 debounce=setTimeout(()=>{debounce=null;syncCloud()},ms);
}
bridge.onLocalChange(()=>queueSync());
function connect(){
 const clientId=clientInput.value.trim();
 if(!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)){
  state('請輸入有效的 Google OAuth「網頁應用程式」用戶端 ID。',true);
  clientInput.focus();return;
 }
 if(!window.google?.accounts?.oauth2){
  state('Google 登入程式尚未載入；請確認網路及瀏覽器允許彈出式登入視窗。',true);return;
 }
 localStorage.setItem(CLIENT_KEY,clientId);
 state('正在開啟 Google 授權視窗…');
 const client=google.accounts.oauth2.initTokenClient({
  client_id:clientId,scope:SCOPE,include_granted_scopes:false,
  callback:response=>{
   if(response.error||!response.access_token){state('Google 未授權：'+(response.error||'請重試'),true);return}
   token=response.access_token;
   expires=Date.now()+Math.max(60,Number(response.expires_in||3500)-90)*1000;
   connected=true;updateControls();
   syncCloud(true);
  },
  error_callback:e=>state('無法完成 Google 登入：'+(e?.type||'視窗遭封鎖或已關閉'),true)
 });
 client.requestAccessToken({prompt:''});
}
$('stkCloudConnect').addEventListener('click',()=>{
 if(connected){syncCloud(true);return}
 connect();
});
$('stkCloudSync').addEventListener('click',()=>syncCloud(true));
$('stkCloudDisconnect').addEventListener('click',()=>{
 token='';expires=0;connected=false;
 if(debounce)clearTimeout(debounce);
 updateControls();state('本機已結束連線；雲端備份與本機資料均保留。');
});
setInterval(()=>{
 if(connected&&!document.hidden)syncCloud();
},120000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&connected)queueSync(800);
});
updateControls();
state('尚未連線：資料仍安全保存在目前瀏覽器。第一次需授權 Google Drive 專用應用資料存取權。');
})();