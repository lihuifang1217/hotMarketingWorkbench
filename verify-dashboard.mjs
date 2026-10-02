import assert from 'node:assert/strict';
import fs from 'node:fs';
import './src/data.js';
import './src/dashboard.js';

const {summarize}=globalThis.HotDashboard;
const now=new Date(2026,9,1,12),at=(year,month,day,hour=10)=>new Date(year,month-1,day,hour).toISOString();
const rows=[
  {time:at(2026,9,1),type:'fetch',returned:9,blocked:1,deduped:3,sourceStatus:[{name:'旧来源',status:'success',count:10}]},
  {time:at(2026,9,25),type:'fetch',returned:2,blocked:0,deduped:0,sourceStatus:[{name:'来源甲',status:'success',count:2}]},
  {time:at(2026,9,30),type:'generate',mode:'mock',usage:{total_tokens:100}},
  {time:at(2026,10,1,9),type:'fetch',returned:4,blocked:2,deduped:1,sourceStatus:[{name:'来源甲',status:'success',count:5},{name:'失败源',status:'failed',count:0}]},
  {time:at(2026,10,1,10),type:'generate',mode:'proxy',model:'测试模型',usage:{prompt_tokens:1000,completion_tokens:500,total_tokens:1500}},
  {time:at(2026,10,1,10),type:'generate',mode:'direct',usage:{total_tokens:2000}},
  {time:at(2026,10,1,11),type:'publish',products:['商品甲','商品乙'],status:'success'},
  {time:at(2026,10,1,11),type:'publish',products:['商品甲'],status:'failed'}
];
const pricing={inputPerMillion:1,outputPerMillion:2,totalPerMillion:1.5};
const today=summarize(rows,'today',pricing,now);
assert.deepEqual([today.metrics.fetches,today.metrics.imported,today.metrics.generations,today.metrics.publishes,today.metrics.blocked,today.metrics.deduped,today.metrics.tokens],[1,4,2,1,2,1,3500]);
assert.equal(today.metrics.cost,.005);
assert.equal(today.sources[0].value,5);
assert.equal(today.models.length,2);
assert.equal(today.products.find(item=>item.name==='商品甲').value,1);
assert.equal(today.trend.reduce((sum,item)=>sum+item.value,0),1);
assert.equal(summarize(rows,'seven',pricing,now).rows.length,7);
assert.equal(summarize(rows,'thirty',pricing,now).rows.length,7);
assert.equal(summarize(rows,'all',pricing,now).rows.length,8);
const empty=summarize([],'all',pricing,now);
assert.equal(empty.metrics.cost,0);assert.equal(empty.metrics.fetches,0);assert.deepEqual(empty.products,[]);

const actual=fs.readFileSync(new URL('./data/activity.jsonl',import.meta.url),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const all=summarize(actual,'all',pricing,new Date(Math.max(...actual.map(row=>new Date(row.time).getTime()))+86400000));
for(const [metric,type] of [['fetches','fetch'],['generations','generate'],['publishes','publish']])assert.equal(all.metrics[metric],actual.filter(row=>row.type===type&&!(type==='publish'&&row.status==='failed')).length);
for(const [metric,field] of [['imported','returned'],['blocked','blocked'],['deduped','deduped']])assert.equal(all.metrics[metric],actual.filter(row=>row.type==='fetch').reduce((sum,row)=>sum+(Number(row[field])||0),0));
console.log(`看板验证通过：四档时间筛选、风险/去重/Token/费用/排行/趋势/空态；与 ${actual.length} 条真实流水逐项核对`);
