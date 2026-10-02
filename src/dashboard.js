(()=>{
'use strict';

const defaultPricing=globalThis.HotData?.defaults?.tokenPricing||{inputPerMillion:1,outputPerMillion:2,totalPerMillion:1.5};
const safeCount=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
function startOfDay(date){const copy=new Date(date);copy.setHours(0,0,0,0);return copy}
function rangeStart(range,now){
  if(range==='all')return null;
  const start=startOfDay(now);
  if(range==='seven')start.setDate(start.getDate()-6);
  if(range==='thirty')start.setDate(start.getDate()-29);
  return start;
}
function filterRecords(records,range,now=new Date()){
  const start=rangeStart(range,now),end=now.getTime();
  return (Array.isArray(records)?records:[]).filter(row=>{
    const time=new Date(row?.time).getTime();
    return Number.isFinite(time)&&time<=end&&(!start||time>=start.getTime());
  });
}
function dayKey(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
function monthKey(date){return dayKey(date).slice(0,7)}
function trendBuckets(records,range,now){
  const publishes=records.filter(row=>row.type==='publish'&&row.status!=='failed');
  const first=records.length?new Date(records.reduce((minimum,row)=>Math.min(minimum,new Date(row.time).getTime()),Infinity)):now;
  const monthly=range==='all'&&now-first>60*86400000;
  if(range==='today')return Array.from({length:24},(_,hour)=>({key:String(hour).padStart(2,'0'),label:`${String(hour).padStart(2,'0')}时`,value:publishes.filter(row=>new Date(row.time).getHours()===hour).length}));
  const count=range==='seven'?7:range==='thirty'?30:null;
  const start=count?startOfDay(now):startOfDay(first);
  const buckets=[];
  if(monthly){start.setDate(1);for(let cursor=new Date(start);cursor<=now;cursor.setMonth(cursor.getMonth()+1)){const key=monthKey(cursor);buckets.push({key,label:key.slice(2).replace('-','/'),value:0})}}
  else for(let cursor=new Date(start);cursor<=now;cursor.setDate(cursor.getDate()+1)){const key=dayKey(cursor);buckets.push({key,label:key.slice(5).replace('-','/'),value:0})}
  const byKey=new Map(buckets.map(bucket=>[bucket.key,bucket]));
  publishes.forEach(row=>{const date=new Date(row.time),key=monthly?monthKey(date):dayKey(date),bucket=byKey.get(key);if(bucket)bucket.value++});
  return buckets;
}
function usageOf(row){
  const usage=row.usage||{},input=safeCount(usage.prompt_tokens??usage.input_tokens),output=safeCount(usage.completion_tokens??usage.output_tokens);
  const reported=safeCount(usage.total_tokens),total=reported||input+output;
  return {input,output,unknown:Math.max(0,total-input-output),total};
}
function summarize(records,range='seven',pricing=defaultPricing,now=new Date()){
  const rows=filterRecords(records,range,now),sources=new Map(),models=new Map(),products=new Map();
  const metrics={fetches:0,imported:0,generations:0,publishes:0,blocked:0,deduped:0,tokens:0,simulatedTokens:0,pricedTokens:0,cost:0};
  for(const row of rows){
    if(row.type==='fetch'){
      metrics.fetches++;metrics.imported+=safeCount(row.returned);metrics.blocked+=safeCount(row.blocked);metrics.deduped+=safeCount(row.deduped);
      for(const source of Array.isArray(row.sourceStatus)?row.sourceStatus:[]){if(source.status!=='success')continue;const name=String(source.name||source.id||'未知来源');sources.set(name,(sources.get(name)||0)+safeCount(source.count))}
    }else if(row.type==='generate'){
      metrics.generations++;const mode=String(row.mode||''),mock=mode==='mock'||mode==='auto-mock';
      const model=mock?'本地模拟':String(row.model||'历史未记录模型');models.set(model,(models.get(model)||0)+1);
      const usage=usageOf(row);metrics.tokens+=usage.total;
      if(mock)metrics.simulatedTokens+=usage.total;
      else{metrics.pricedTokens+=usage.total;metrics.cost+=(usage.input*safeCount(pricing.inputPerMillion)+usage.output*safeCount(pricing.outputPerMillion)+usage.unknown*safeCount(pricing.totalPerMillion))/1e6}
    }else if(row.type==='publish'&&row.status!=='failed'){
      metrics.publishes++;
      for(const name of new Set((Array.isArray(row.products)?row.products:[]).map(item=>String(item||'').trim()).filter(Boolean)))products.set(name,(products.get(name)||0)+1);
    }
  }
  const sorted=map=>[...map].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'zh-CN'));
  return {rows,metrics,sources:sorted(sources),models:sorted(models),products:sorted(products),trend:trendBuckets(rows,range,now),recent:[...rows].sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,12)};
}
globalThis.HotDashboard={defaultPricing,filterRecords,summarize};
})();
