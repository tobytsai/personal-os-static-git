import fs from 'node:fs';
const root='validation/lighthouse';
const metrics={
 performance:r=>r.categories.performance.score*100,
 accessibility:r=>r.categories.accessibility.score*100,
 bestPractices:r=>r.categories['best-practices'].score*100,
 LCP_ms:r=>r.audits['largest-contentful-paint'].numericValue,
 FCP_ms:r=>r.audits['first-contentful-paint'].numericValue,
 TBT_ms:r=>r.audits['total-blocking-time'].numericValue,
 CLS:r=>r.audits['cumulative-layout-shift'].numericValue,
 totalBytes:r=>r.audits['total-byte-weight'].numericValue
};
function med(values){const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length===3?a[1]:null;}
const output={method:'3 interleaved runs per version per preset, same local server/data/assets, lab measurements not field CWV',results:{}};
for(const mode of ['mobile','desktop']){
 const values={};for(const v of ['before','after']){
 const reports=[1,2,3].map(i=>JSON.parse(fs.readFileSync(root+'/'+mode+'-'+v+'-'+i+'.json','utf8')));
 if(reports.some(r=>r.runtimeError))throw Error('Lighthouse runtime error '+mode+' '+v);
 values[v]=Object.fromEntries(Object.entries(metrics).map(([k,get])=>[k,med(reports.map(get))]));
 }output.results[mode]=values;
}
fs.writeFileSync(root+'/summary.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Product catalogue Lighthouse — local median\n\n`\n'+JSON.stringify(output.results,null,2)+'\n`\n');
