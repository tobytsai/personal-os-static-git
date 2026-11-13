const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');const {HEADERS,encode}=require('../public/home-reminder-sync.js');
function setup(reminders=[{id:'local',title:'Local',date:'',done:false}]){const ids=new Map(),all=[];class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;all.push(this)}set id(x){this._id=x;ids.set(x,this)}get id(){return this._id}set innerHTML(s){for(const m of s.matchAll(/id="([^"]+)"/g)){const el=new Element(m[1].includes('actions')?'div':'input');el.id=m[1]}}append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}before(){}after(){}setAttribute(){}focus(){}querySelectorAll(selector){const found=[];const visit=n=>{if(!n||typeof n==='string')return;if(selector==='button'&&n.tag==='button')found.push(n);for(const c of n.children||[])visit(c)};visit(this);return found}reset(){Object.values(this.elements||{}).forEach(x=>x.value='')}get textContent(){return this._text||this.children.map(x=>typeof x==='string'?x:x.textContent).join('')}set textContent(x){this._text=x}}
const document={createElement:t=>new Element(t),getElementById:id=>ids.get(id),querySelectorAll:()=>all.filter(x=>x.tag==='button'),head:new Element()};for(const id of ['reminder-list','reminder-form','reminder-error','reminder-add','reminder-cancel','focus-items','focus-count','focus-choose']){const e=new Element();e.id=id}ids.get('reminder-form').elements={title:new Element('input'),date:new Element('input'),phone:new Element('input')};const saved=new Map(),localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};let authCount=0,pickerCount=0,pickerCallback,authOptions,denied=false,writes=0;let rows=[HEADERS.slice(),encode({id:'remote',title:'Remote',date:'',url:'javascript:alert(1)'})];const google={accounts:{oauth2:{initTokenClient:o=>{authOptions=o;return{requestAccessToken(){authCount++}}},hasGrantedAllScopes:()=>true}},picker:{ViewId:{SPREADSHEETS:1},Action:{PICKED:'picked',CANCEL:'cancel'},DocsView:class{setMimeTypes(){return this}},PickerBuilder:class{addView(){return this}setOAuthToken(){return this}setDeveloperKey(){return this}setAppId(){return this}setOrigin(){return this}setCallback(f){pickerCallback=f;return this}build(){return this}setVisible(){pickerCount++}}}};const context={document,localStorage,google,URL,Date,Map,Promise,AbortSignal,crypto:require('node:crypto').webcrypto,location:{origin:'https://example.test'},confirm:()=>true,fetch:async(url,opts={})=>{if(denied){denied=false;return{ok:false,status:401}}if(opts.method){writes++;const b=JSON.parse(opts.body);if(url.includes(':append'))rows.push(...b.values);else for(const d of b.data){const [,c,r]=d.range.match(/!([A-L])(\d+)/);rows[+r-1][c.charCodeAt(0)-65]=d.values[0][0]}}return{ok:true,json:async()=>({values:structuredClone(rows)})}}};context.window=context;vm.runInNewContext(fs.readFileSync(__dirname+'/../public/home-reminder-sync.js','utf8'),context);context.HomeReminderSync.mount({key:'local',entries:reminders});const click=label=>{const b=[...all].reverse().find(x=>x.tag==='button'&&x.textContent===label);assert.ok(b,label);if(!b.disabled)b.onclick();};const tick=()=>new Promise(r=>setTimeout(r,5));return{ids,all,saved,click,tick,get authCount(){return authCount},get pickerCount(){return pickerCount},auth(){authOptions.callback({access_token:'MOCK_SECRET',expires_in:3600})},pick(id){pickerCallback({action:id?'picked':'cancel',docs:id?[{id}]:[]})},get writes(){return writes},get rows(){return rows},deny(){denied=true}};}
test('DOM mocks: explicit connect/picker, lock repeated picker, import, unsafe URLs, expiry and reconnect',async()=>{const f=setup();assert.equal(f.authCount,0);assert.match(f.ids.get('reminder-list').textContent,/Local/);for(const [id,v] of [['reminder-client','test.apps.googleusercontent.com'],['reminder-api-key','mock'],['reminder-project','123']])f.ids.get(id).value=v;f.click('連線 Google');f.click('連線 Google');assert.equal(f.authCount,1);f.auth();await f.tick();f.click('選擇提醒表');await f.tick();f.click('選擇提醒表');assert.equal(f.pickerCount,1);f.pick('test-sheet');await f.tick();assert.equal(f.writes,0);assert.match(f.ids.get('reminder-list').textContent,/Remote/);assert.doesNotMatch(f.ids.get('reminder-list').textContent,/Local/);assert.equal(f.all.filter(x=>x.tag==='a'&&x.href==='javascript:alert(1)').length,0);f.click('標記完成');f.click('標記完成');await f.tick();assert.equal(f.writes,1);assert.equal(f.rows[1][4],'TRUE');f.click('上傳本機提醒');await f.tick();assert.equal(f.rows.length,3);f.click('上傳本機提醒');await f.tick();assert.equal(f.rows.length,3);f.deny();f.click('重新整理雲端');await f.tick();assert.match(f.ids.get('reminder-cloud-status').textContent,/已到期/);f.click('連線 Google');f.auth();await f.tick();assert.equal(f.authCount,2);assert.ok(![...f.saved.values()].join().includes('MOCK_SECRET'));f.click('中斷連線／回本機');assert.match(f.ids.get('reminder-list').textContent,/Local/);assert.doesNotMatch(f.ids.get('reminder-list').textContent,/Remote/);});
test('DOM mocks: cancelled picker unlocks and can retry',async()=>{const f=setup();for(const [id,v] of [['reminder-client','test.apps.googleusercontent.com'],['reminder-api-key','mock'],['reminder-project','123']])f.ids.get(id).value=v;f.click('連線 Google');f.auth();await f.tick();f.click('選擇提醒表');await f.tick();f.pick(null);await f.tick();f.click('選擇提醒表');await f.tick();assert.equal(f.pickerCount,2);f.pick('test-sheet');await f.tick();assert.match(f.ids.get('reminder-list').textContent,/Remote/)});

test('Top 3 pins only three IDs locally, supports removing and completing focus tasks',async()=>{
 const entries=Array.from({length:4},(_,i)=>({id:'focus-'+(i+1),title:'Task '+(i+1),date:'',done:false}));
 const f=setup(entries);
 assert.equal(f.ids.get('focus-count').textContent,'0 / 3');
 for(let i=0;i<3;i++)f.click('☆ 設為重點');
 assert.equal(f.ids.get('focus-count').textContent,'3 / 3');
 const pins=JSON.parse(f.saved.get('tobyHomeFocusPinsV1'));
 assert.equal(pins.local.length,3);
 assert.ok(pins.local.every(id=>/^focus-[1-4]$/.test(id)));
 assert.equal(f.ids.get('focus-items').children.length,3);
 f.click('☆ 設為重點');
 assert.equal(f.ids.get('focus-count').textContent,'3 / 3','fourth pin must be rejected');
 assert.match(f.ids.get('reminder-cloud-status').textContent,/最多三件/);
 f.click('取消釘選');
 assert.equal(f.ids.get('focus-count').textContent,'2 / 3');
 f.click('完成');await f.tick();
 assert.equal(f.ids.get('focus-count').textContent,'1 / 3','completed pinned item should be unpinned');
 assert.equal(JSON.parse(f.saved.get('tobyHomeFocusPinsV1')).local.length,1);
 const saved=JSON.parse(f.saved.get('local'));
 assert.equal(saved.filter(x=>x.done).length,1);
 assert.equal(saved.length,4,'focus actions must not duplicate tasks');
 assert.equal(f.writes,0,'pinning should never write to Google Sheets');
});
test('Top 3 pin preference can be recovered independently of reminder data',()=>{
 const f=setup([{id:'keep',title:'Keep',date:'',done:false}]);
 f.click('☆ 設為重點');
 const value=JSON.parse(f.saved.get('tobyHomeFocusPinsV1'));
 assert.deepEqual(value.local,['keep']);
 assert.equal(JSON.stringify(value).includes('Keep'),false,'task titles must not be duplicated in focus preferences');
});
test('mobile action bar has five controls and independently loaded JS',()=>{
 const fs=require('node:fs'),html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
 const js=fs.readFileSync(__dirname+'/../public/personal-os-mobile.js','utf8');
 assert.ok(/personal-os-mobile\.js/.test(html));
 assert.ok(/personal-os-focus-mobile\.css/.test(html));
 for(const action of ['search','reminders','calendar','favorites','tools']){
   assert.ok(html.includes('data-mobile-action="'+action+'"'),action+' button exists');
 }
 assert.doesNotThrow(()=>new Function(js));
 assert.ok(/safe-area-inset-bottom/.test(fs.readFileSync(__dirname+'/../public/assets/personal-os-focus-mobile.css','utf8')));
});
