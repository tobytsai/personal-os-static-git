'use strict';
// Public, source-dated TWSE/TPEx market data only. Never read browser user data.
const fs = require('node:fs');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');
const ROOT = path.resolve(__dirname, '..');
const LATEST = path.join(ROOT, 'public/data/stocks-latest.json');
const HISTORY = path.join(ROOT, 'public/data/stocks-history');
const today = new Intl.DateTimeFormat('sv-SE', {
  timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const requested = process.env.STOCK_TRADE_DATE || today;
const ymd = requested.replace(/-/g,'');
const sources = {
  stocks:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  index:'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX',
  tpex:'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes',
  flows:'https://www.twse.com.tw/rwd/zh/fund/BFI82U?dayDate='+ymd+'&type=day&response=json',
  daily:'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date='+ymd+'&type=ALLBUT0999&response=json'
};
const nap = value => String(value ?? '').trim();
const number = value => {
  if(value==null) return null;
  const cleaned = nap(value).replace(/,/g,'').replace(/[−－]/g,'-');
  if(!cleaned || /^(?:--?|—|X|N\/A|不適用)$/i.test(cleaned))return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
function iso(input){
  const v=nap(input).replace(/[.\/-]/g,'');
  if(/^\d{7}$/.test(v))return String(Number(v.slice(0,3))+1911)+'-'+v.slice(3,5)+'-'+v.slice(5,7);
  if(/^\d{8}$/.test(v))return v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6,8);
  return '';
}
async function getJSON(url){
  let last;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),20000);
      try{
        const response=await fetch(url,{headers:{
          'User-Agent':'TaiwanStockResearch/1.0 (GitHub scheduled open-data snapshot)',
          'Accept':'application/json',
          'Cache-Control':'no-cache'
        },signal:ctl.signal});
        if(!response.ok)throw Error('HTTP '+response.status);
        return await response.json();
      }finally{clearTimeout(timer)}
    }catch(e){
      last=e;
      if(attempt<2)await delay(1200*(attempt+1));
    }
  }
  throw new Error(url+' '+(last?.message||last));
}
function defaultStocks(){
  const file=fs.readFileSync(path.join(ROOT,'public/stock-workspace.js'),'utf8');
  const match=file.match(/const DEFAULTS=\[([\s\S]*?)\]\.map\(/);
  if(!match)throw new Error('Cannot parse publicly defined default watchlist');
  const items=[...match[1].matchAll(/\['([0-9A-Z.]+)','([^']+)','([^']+)'\]/g)]
    .map(m=>({code:m[1],name:m[2],sector:m[3]}));
  if(items.length<10)throw new Error('Watchlist unexpectedly short: '+items.length);
  return items;
}
function asQuote(raw,market){
  const twse=market==='TWSE';
  const code=nap(twse?raw.Code:raw.SecuritiesCompanyCode);
  const date=iso(raw.Date);
  const close=number(twse?raw.ClosingPrice:raw.Close);
  const chg=number(raw.Change);
  if(!code||!date||close===null||close<=0)return null;
  const result={
    Code:code,Name:nap(twse?raw.Name:raw.CompanyName),
    Date:date,ClosingPrice:close,Change:chg,
    OpeningPrice:number(twse?raw.OpeningPrice:raw.Open),
    HighestPrice:number(twse?raw.HighestPrice:raw.High),
    LowestPrice:number(twse?raw.LowestPrice:raw.Low),
    TradeVolume:number(twse?raw.TradeVolume:raw.TradingShares),
    TradeValue:number(twse?raw.TradeValue:raw.TransactionAmount),
    market,source:twse?sources.stocks:sources.tpex
  };
  if(result.TradeVolume!==null && result.TradeVolume<0)return null;
  return result;
}

const clean = v=>nap(v).replace(/<[^>]+>/g,'').replace(/&nbsp;/gi,' ').trim();
function parseDailyReport(report,watch){
  if(report?.stat!=='OK'||!Array.isArray(report.tables))return {};
  if(report.date&&iso(report.date)!==requested){
    console.warn('Requested daily report returned different date: '+report.date);
    return {};
  }
  const wanted=new Set(watch.map(x=>x.code));
  const table=report.tables.find(t=>Array.isArray(t.fields)&&Array.isArray(t.data)
    &&t.fields.includes('證券代號')&&t.fields.includes('收盤價')&&t.fields.includes('成交股數'));
  if(!table)return {};
  const getIndex=n=>table.fields.indexOf(n);
  const col={
    code:getIndex('證券代號'),name:getIndex('證券名稱'),
    vol:getIndex('成交股數'),val:getIndex('成交金額'),
    open:getIndex('開盤價'),high:getIndex('最高價'),low:getIndex('最低價'),
    close:getIndex('收盤價'),chg:getIndex('漲跌價差')
  };
  const sign=table.fields.findIndex(x=>x.includes('漲跌(')||x.includes('漲跌(＋')||x.includes('漲跌(+'));
  const out={};
  for(const cells of table.data){
    if(!Array.isArray(cells))continue;
    const code=clean(cells[col.code]);
    if(!wanted.has(code))continue;
    const raw=n=>col[n]<0?'':clean(cells[col[n]]);
    let delta=number(raw('chg'));
    if(delta!==null&&sign>=0){
      const direction=clean(cells[sign]);
      if(/-|\u2212|▼|▽|跌/.test(direction))delta=-Math.abs(delta);
      else if(/\+|▲|△|漲/.test(direction))delta=Math.abs(delta);
      else if(/X|不比價/.test(direction))delta=null;
    }
    const close=number(raw('close'));
    if(close===null||close<=0)continue;
    out[code]={
      Code:code,Name:raw('name'),Date:requested,ClosingPrice:close,Change:delta,
      OpeningPrice:number(raw('open')),HighestPrice:number(raw('high')),
      LowestPrice:number(raw('low')),TradeVolume:number(raw('vol')),
      TradeValue:number(raw('val')),market:'TWSE',source:sources.daily
    };
  }
  return out;
}
function parseDailyIndex(report){
  if(report?.stat!=='OK'||!Array.isArray(report.tables))return null;
  if(report.date&&iso(report.date)!==requested)return null;
  for(const t of report.tables){
    if(!Array.isArray(t.fields)||!Array.isArray(t.data))continue;
    const name=t.fields.indexOf('指數');
    const close=t.fields.indexOf('收盤指數');
    const percent=t.fields.indexOf('漲跌百分比');
    if(name<0||close<0||percent<0)continue;
    const row=t.data.find(c=>Array.isArray(c)&&clean(c[name])==='發行量加權股價指數');
    if(!row)continue;
    const value=number(clean(row[close]));
    const p=number(clean(row[percent]));
    if(value===null||p===null)continue;
    const sign=t.fields.indexOf('漲跌');
    const deltaSign=sign>=0&&/-|\u2212|▼|跌/.test(clean(row[sign]))?-1:1;
    const pointsCol=t.fields.indexOf('漲跌點數');
    return {'日期':requested,'指數':'發行量加權股價指數',
      '收盤指數':value,'漲跌百分比':deltaSign*Math.abs(p),
      '漲跌點數':pointsCol>=0?deltaSign*Math.abs(number(clean(row[pointsCol]))||0):null,
      source:sources.daily};
  }
  return null;
}

function indexRow(rows){
  if(!Array.isArray(rows))return null;
  const row=rows.find(x=>nap(x['指數'])==='發行量加權股價指數');
  if(!row||iso(row['日期'])!==requested)return null;
  const close=number(row['收盤指數']);
  if(close===null)return null;
  const plusminus=nap(row['漲跌']);
  const points=Math.abs(number(row['漲跌點數'])??0)*(plusminus==='-'?-1:1);
  const percent=Math.abs(number(row['漲跌百分比'])??0)*(plusminus==='-'?-1:1);
  return {
    '日期':requested,'指數':'發行量加權股價指數',
    '收盤指數':close,'漲跌點數':points,'漲跌百分比':percent,
    source:sources.index
  };
}
function flowsFromOfficial(report){
  if(report?.stat!=='OK'||!Array.isArray(report.data)||!Array.isArray(report.fields))return null;
  if(report.date&&iso(report.date)!==requested)return null;
  const fields=report.fields.map(nap);
  let label=fields.findIndex(x=>/單位名稱|單位/.test(x));
  let net=fields.findIndex(x=>/買賣差額/.test(x));
  if(label<0)label=0;
  if(net<0)net=fields.length-1;
  const totals={foreign:null,trust:null,dealerSelf:null,dealerHedge:null,total:null};
  for(const row of report.data){
    if(!Array.isArray(row))continue;
    const name=nap(row[label]);
    const value=number(row[net]);
    if(value===null)continue;
    if(/外資及陸資/.test(name)&&!/自營商/.test(name))totals.foreign=value;
    else if(/^投信/.test(name))totals.trust=value;
    else if(/自營商/.test(name)&&/自行買賣/.test(name))totals.dealerSelf=value;
    else if(/自營商/.test(name)&&/避險/.test(name))totals.dealerHedge=value;
    else if(/^合計/.test(name))totals.total=value;
  }
  if(totals.total===null||totals.foreign===null)return null;
  return {date:requested,unit:'TWD',...totals,source:sources.flows};
}
async function main(){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(requested)||requested>today)throw new Error('Invalid future date '+requested);
  const watch=defaultStocks();
  const query=await Promise.allSettled([
    getJSON(sources.stocks),getJSON(sources.index),getJSON(sources.tpex),getJSON(sources.flows),
    getJSON(sources.daily)
  ]);
  for(let i=0;i<query.length;i++)
    if(query[i].status==='rejected')console.warn('Source unavailable:',Object.keys(sources)[i],String(query[i].reason));
  const listed=query[0].status==='fulfilled'?query[0].value:[];
  const otc=query[2].status==='fulfilled'?query[2].value:[];
  const daily=query[4].status==='fulfilled'?query[4].value:null;
  console.log('Official source dates:', JSON.stringify({
    request:requested,
    twse:iso(Array.isArray(listed)?listed.find(x=>x?.Date)?.Date:''),
    index:iso(query[1].status==='fulfilled'&&Array.isArray(query[1].value)?query[1].value.find(x=>x?.['日期'])?.['日期']:''),
    tpex:iso(Array.isArray(otc)?otc.find(x=>x?.Date)?.Date:''),
    datedReport:daily?.stat||'no response',
    datedDate:daily?.date||null
  }));
  const quotes={};
  for(const [rows,market] of [[listed,'TWSE'],[otc,'TPEx']]){
    if(!Array.isArray(rows))continue;
    for(const raw of rows){
      if(!watch.some(s=>s.code===nap(market==='TWSE'?raw.Code:raw.SecuritiesCompanyCode)))continue;
      const q=asQuote(raw,market);
      if(q&&q.Date===requested)quotes[q.Code]=q;
    }
  }
  const sameDayListed=parseDailyReport(daily,watch);
  for(const [code,record] of Object.entries(sameDayListed))quotes[code]=record;
  const count=Object.keys(quotes).length;
  if(count===0){
    console.log('No verified quotes for '+requested+'; existing site data unchanged.');
    return;
  }
  if(count<Math.ceil(watch.length*.65)) {
    throw Error('Only '+count+' of '+watch.length+' quotes verified. Refusing incomplete publication.');
  }
  const index=parseDailyIndex(daily)||(query[1].status==='fulfilled'?indexRow(query[1].value):null);
  const flows=query[3].status==='fulfilled'?flowsFromOfficial(query[3].value):null;
  const old=fs.existsSync(LATEST)?JSON.parse(fs.readFileSync(LATEST,'utf8')):null;
  if(old?.tradeDate>requested) {
    console.log('Repository has newer quote date '+old.tradeDate+'; refusing overwrite.');
    return;
  }
  const missing=watch.filter(s=>!quotes[s.code]).map(s=>s.code);
  const snapshot={
    version:1,tradeDate:requested,generatedAt:new Date().toISOString(),
    marketStatus:'closed',quoteSourceDate:requested,
    watchlistCount:watch.length,quoteCount:count,missingCodes:missing,
    quotes,index,institutional:flows,sources
  };
  const quality=x=>Object.keys(x?.quotes||{}).length*10+(x?.index?3:0)+(x?.institutional?2:0);
  if(old?.tradeDate===requested){
    if(quality(snapshot)<=quality(old)){
      console.log('No data improvements for '+requested+'; unchanged.');
      return;
    }
    // Never drop previously verified same-day fields when optional upstream is unavailable.
    snapshot.index ||= old.index;
    snapshot.institutional ||= old.institutional;
    for(const [code,q] of Object.entries(old.quotes||{}))
      if(!snapshot.quotes[code])snapshot.quotes[code]=q;
    snapshot.quoteCount=Object.keys(snapshot.quotes).length;
    snapshot.missingCodes=watch.filter(s=>!snapshot.quotes[s.code]).map(s=>s.code);
  }
  fs.mkdirSync(HISTORY,{recursive:true});
  fs.writeFileSync(LATEST,JSON.stringify(snapshot,null,2)+'\n');
  fs.writeFileSync(path.join(HISTORY,requested+'.json'),JSON.stringify(snapshot,null,2)+'\n');
  console.log('SAVED '+requested+
    ' observed '+count+'/'+watch.length+
    ' index '+Boolean(snapshot.index)+' institutional '+Boolean(snapshot.institutional));
  for(const [code,x] of Object.entries(snapshot.quotes))
    console.log(code+' '+x.Name+' close '+x.ClosingPrice+' change '+x.Change+' volume '+x.TradeVolume);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
