const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createHash} = require('node:crypto');

const source = fs.readFileSync(__dirname + '/home-reminder-line.gs', 'utf8');
const HEADER = ['id','title','date','phone','done','url','source','order_id','message_id','received_at','updated_at','deleted'];
const make = (id,title,date,done='FALSE',deleted='FALSE') => [id,title,date,'',done,'','','','','','',deleted];

function fixture(today = '2026-11-02', overrides = {}) {
  const kv = new Map(Object.entries({
    LINE_CHANNEL_ACCESS_TOKEN: 'test-token-not-real',
    LINE_TO_USER_ID: 'U' + 'a'.repeat(32),
    ...overrides.properties
  }));
  const rows = overrides.rows || [
    make('company','15號前申報公司帳','2026-11-15'),
    make('milk','林鳳營鮮乳分批領取','2026-12-01'),
    make('motorcycle1','BA-6950 機車定期排氣檢驗','2026-12-31'),
    make('motorcycle2','KT-3720 機車定期排氣檢驗','2027-01-31'),
    make('deleted','已刪除提醒','2026-11-02','FALSE','TRUE')
  ];
  const sent = [], logs = [], actions = {read:0, calls:0, records:0};
  const ss = {
    getId:()=> 'private-sheet-only-in-script-properties',
    getSheetByName:name=>name === 'reminders' ? sheet : null
  };
  const sheet = {
    getLastRow:()=> rows.length + 1,
    getRange:(r,c,h,w)=>{
      assert.equal(c, 1);
      assert.equal(w, 12);
      return {
        getDisplayValues:()=> [overrides.headers || HEADER],
        getValues:()=> {actions.read++;return rows.slice(r-2,r-2+h);}
      };
    }
  };
  class ClockDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(today+'T00:00:00Z');
    }
  }
  const props = {
    getProperty:k=>kv.get(k)||null,
    setProperty:(k,v)=>kv.set(k,v),
    setProperties:(obj)=> {actions.records++;Object.entries(obj).forEach(([k,v])=>kv.set(k,v));}
  };
  const triggers = [];
  function triggerBuilder(name) {
    return {
      timeBased(){return this;},
      everyDays(n){assert.equal(n,1);return this;},
      atHour(n){assert.equal(n,8);return this;},
      nearMinute(n){assert.equal(n,30);return this;},
      inTimezone(tz){assert.equal(tz,'Asia/Taipei');return this;},
      create(){const item={getHandlerFunction:()=>name};triggers.push(item);return item;}
    };
  }
  const context = vm.createContext({
    Date: ClockDate,
    console:{log:s=>logs.push(String(s))},
    PropertiesService:{getScriptProperties:()=>props},
    SpreadsheetApp:{
      getActiveSpreadsheet:()=>ss,
      openById:id=> {assert.equal(id,ss.getId());return ss;}
    },
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Utilities:{
      formatDate:(date,tz,format)=>{assert.equal(tz,'Asia/Taipei');assert.equal(format,'yyyy-MM-dd');return date.toISOString().slice(0,10);},
      DigestAlgorithm:{SHA_256:'sha256'}, Charset:{UTF_8:'UTF-8'},
      computeDigest:(type,value)=>Array.from(createHash('sha256').update(String(value)).digest(),x=>x>127?x-256:x)
    },
    UrlFetchApp:{fetch:(url,opts)=>{
      actions.calls++;
      assert.equal(url,'https://api.line.me/v2/bot/message/push');
      assert.match(opts.headers.Authorization,/Bearer test-token-not-real/);
      const body=JSON.parse(opts.payload);
      assert.equal(body.to,'U'+'a'.repeat(32));
      sent.push(body.messages[0].text);
      return {getResponseCode:()=> overrides.httpStatus||200};
    }},
    ScriptApp:{
      getProjectTriggers:()=>triggers,
      deleteTrigger:trigger=>triggers.splice(triggers.indexOf(trigger),1),
      newTrigger:triggerBuilder
    }
  });
  vm.runInContext(source, context, {filename:'home-reminder-line.gs'});
  return {context,kv,rows,sent,logs,actions,triggers};
}

test('quiet when no due threshold and never sends old deleted records',()=>{
  const t=fixture();
  assert.equal(t.context.checkLineReminders(),0);
  assert.equal(t.sent.length,0);
  assert.equal(t.actions.records,0);
});

test('company account is sent only at 7, 3, 1, and due date',()=>{
  const t=fixture('2026-11-08');
  assert.equal(t.context.checkLineReminders(),1);
  assert.equal(t.sent.length,1);
  assert.match(t.sent[0],/15號前申報公司帳/);
  assert.match(t.sent[0],/還有 7 天到期/);
  assert.equal(t.context.checkLineReminders(),0);
  assert.equal(t.sent.length,1);
});

test('vehicle 30-day alert is combined with milk due date in one LINE message',()=>{
  const t=fixture('2026-12-01');
  assert.equal(t.context.checkLineReminders(),2);
  assert.equal(t.sent.length,1);
  assert.match(t.sent[0],/林鳳營/);
  assert.match(t.sent[0],/BA-6950/);
  assert.doesNotMatch(t.sent[0],/KT-3720/);
  assert.match(t.sent[0],/今天到期/);
  assert.match(t.sent[0],/還有 30 天到期/);
});

test('ignores completed/removed records and invalid dates',()=>{
  const t=fixture('2026-11-08',{rows:[
    make('done','已完成','2026-11-15','TRUE','FALSE'),
    make('deleted','已刪除','2026-11-15','FALSE','TRUE'),
    make('invalid','日期不合法','2026-02-30','FALSE','FALSE'),
    make('undated','沒有日期','','FALSE','FALSE')
  ]});
  assert.equal(t.context.checkLineReminders(),0);
  assert.equal(t.sent.length,0);
});

test('changing a due date is treated as a new reminder stage',()=>{
  const t=fixture('2026-11-08',{rows:[make('id1','普通待辦','2026-11-15')]});
  assert.equal(t.context.checkLineReminders(),1);
  t.rows[0][2]='2026-11-11';
  assert.equal(t.context.checkLineReminders(),1);
  assert.equal(t.sent.length,2);
});

test('LINE errors do not mark any notification sent',()=>{
  const t=fixture('2026-11-08',{httpStatus:401});
  assert.throws(()=>t.context.checkLineReminders(),/HTTP 401/);
  assert.equal(t.actions.records,0);
});

test('invalid sheet header fails closed',()=>{
  const t=fixture('2026-11-08',{headers:['wrong',...HEADER.slice(1)]});
  assert.throws(()=>t.context.checkLineReminders(),/欄位名稱/);
  assert.equal(t.sent.length,0);
});

test('test LINE push does not mark real reminder sent',()=>{
  const t=fixture('2026-11-08');
  t.context.sendLineReminderTest();
  assert.equal(t.sent.length,1);
  assert.match(t.sent[0],/LINE 測試成功/);
  assert.equal(t.actions.records,0);
  assert.equal(t.context.checkLineReminders(),1);
});

test('install is idempotent and stores the private sheet ID in script properties only',()=>{
  const t=fixture();
  t.context.installLineReminderTrigger();
  t.context.installLineReminderTrigger();
  assert.equal(t.triggers.length,1);
  assert.equal(t.kv.get('REMINDERS_SPREADSHEET_ID'),'private-sheet-only-in-script-properties');
  t.context.stopLineReminderTrigger();
  assert.equal(t.triggers.length,0);
});
