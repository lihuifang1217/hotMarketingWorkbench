import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// 在测试沙箱中暴露闭包状态，生产页面不增加调试接口。
const listeners={},elements=new Map();
const element=selector=>{
  if(!elements.has(selector))elements.set(selector,{textContent:'',outerHTML:'',disabled:false,toggleAttribute(){},closest(){return {querySelector(){return null}}}});
  return elements.get(selector);
};
const context=vm.createContext({console,location:{protocol:'file:'},document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(type,handler)=>listeners[type]=handler},localStorage:{getItem:()=>null,setItem(){}},AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,URL});
for(const path of ['src/data.js','src/matching.js','src/dedupe.js','src/prompts.js','src/llm.js','src/auto.js','src/evaluation.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
let releaseLog;
context.testLog=()=>new Promise(resolve=>{releaseLog=resolve});
const source=fs.readFileSync('src/app.js','utf8').replace('\ninit();',`\nrender=()=>{};toast=()=>{};saveRecord=entry=>globalThis.testLog(entry);globalThis.testApp={state,repairCopy,selectCandidate,selectVariant,resetAfterProduct};`);
vm.runInContext(source,context,{filename:'src/app.js'});
const {state,repairCopy,selectCandidate,selectVariant,resetAfterProduct}=context.testApp;
const {HotData:D,HotEvaluation:E}=context;
const news=D.normalizeNews(D.demoNews)[0],products=[D.defaultProducts[0]];
state.settings={...D.defaults,mode:'mock',products:D.defaultProducts};state.news=[news];state.selectedNews=news.id;state.products=[products[0].id];
const bad=`最佳！${products[0].name}只要999元！${'赶快购买'.repeat(65)}`;
const other='这是版本二的独立内容';
const first={id:'v1',name:'版本一',status:'done',text:bad,validation:E.verify(bad,news,products),metrics:null,repairTrace:[]};
const second={id:'v2',name:'版本二',status:'done',text:other,validation:E.verify(other,news,products),metrics:null,repairTrace:[]};
state.candidates=[first,second];state.activeCandidate='v1';state.copy=bad;state.validation=first.validation;
const before=state.validation.score;
const job=repairCopy();
for(let i=0;i<8&&!releaseLog;i++)await Promise.resolve();
assert.ok(releaseLog,'应在状态更新之后写流水');
assert.equal(first.text,state.copy);assert.equal(first.validation.score,100);assert.equal(first.repairTrace.length,1);
selectCandidate('v2');assert.equal(state.activeCandidate,'v1','修正流水写入中禁止切换');
releaseLog();await job;
const fixed=state.copy;
selectCandidate('v2');assert.equal(state.copy,other);assert.equal(state.repairTrace.length,0);
selectCandidate('v1');assert.equal(state.copy,fixed);assert.equal(state.validation.score,100);assert.equal(state.repairTrace.length,1);
listeners.input({target:{id:'copyEditor',value:bad}});
assert.equal(first.text,bad);assert.equal(first.validation.score,before);assert.equal(first.repairTrace.length,0);
selectCandidate('v2');selectCandidate('v1');assert.equal(state.copy,bad);assert.equal(state.validation.score,before);
// 修正期间更换素材，旧请求即使迟到，也不能恢复旧文案。
let releaseRepair;const originalRepair=E.repair;
E.repair=()=>new Promise(resolve=>releaseRepair=resolve);
context.testLog=async()=>{};
const staleJob=repairCopy();resetAfterProduct();
releaseRepair({text:fixed,machine:E.verify(fixed,news,products),rounds:[]});await staleJob;
assert.equal(state.copy,'');assert.equal(state.validation,null);assert.equal(state.candidates.length,0);assert.equal(state.repairing,false);
E.repair=originalRepair;
// 每个语调保留整组候选、选用版本、修正记录与耗时/消耗信息。
const [toneA,toneB]=state.settings.tonePresets;
state.variant=toneA;state.copy=fixed;state.validation=E.verify(fixed,news,products);
state.metrics={duration:1234,usage:{total_tokens:88}};
state.repairTrace=[{round:1,before,after:100}];state.generatedOnce=true;
state.candidates=[{...first,text:fixed,validation:state.validation,metrics:state.metrics,repairTrace:state.repairTrace},{...second}];state.activeCandidate='v1';
selectVariant(toneB);
assert.equal(state.copy,'');assert.equal(state.candidates.length,0);assert.equal(state.generatedOnce,false);
selectVariant(toneA);
assert.equal(state.copy,fixed);assert.equal(state.validation.score,100);assert.equal(state.candidates.length,2);
assert.equal(state.activeCandidate,'v1');assert.equal(state.repairTrace.length,1);assert.equal(state.metrics.duration,1234);assert.equal(state.metrics.usage.total_tokens,88);assert.equal(state.generatedOnce,true);
selectCandidate('v2');const activeA=state.activeCandidate;
selectVariant(toneB);
listeners.input({target:{id:'copyEditor',value:'语调二的独立编辑内容'}});
selectVariant(toneA);assert.equal(state.copy,other);assert.equal(state.activeCandidate,activeA);
listeners.input({target:{id:'copyEditor',value:'语调一的最新手动编辑内容'}});
selectVariant(toneB);assert.equal(state.copy,'语调二的独立编辑内容');
selectVariant(toneA);assert.equal(state.copy,'语调一的最新手动编辑内容');
// 重新生成只替换当前语调，不删除其它语调的草稿。
resetAfterProduct(true);state.toneDrafts.delete(state.variant);
state.copy='语调一重新生成后的内容';state.generatedOnce=true;
selectVariant(toneB);assert.equal(state.copy,'语调二的独立编辑内容');
selectVariant(toneA);assert.equal(state.copy,'语调一重新生成后的内容');
// 素材的细节变化也不能复用旧草稿（不只是检查编号）。
selectVariant(toneB);news.summary+=' 新摘要';
selectVariant(toneA);assert.equal(state.copy,'');assert.equal(state.candidates.length,0);
state.copy=fixed;selectVariant(toneB);
state.settings.products=state.settings.products.map(product=>product.id===products[0].id?{...product,price:product.price+1}:product);
selectVariant(toneA);assert.equal(state.copy,'');assert.equal(state.validation,null);
// 正常更换热点或商品会一次清除全部语调缓存。
state.copy=fixed;selectVariant(toneB);assert.ok(state.toneDrafts.size>0);
resetAfterProduct();assert.equal(state.toneDrafts.size,0);
selectVariant(toneA);assert.equal(state.copy,'');assert.equal(state.candidates.length,0);
// 未生成的手写草稿被主动清空后，不能从旧缓存中复活。
state.copy='手写草稿';selectVariant(toneB);selectVariant(toneA);
listeners.input({target:{id:'copyEditor',value:''}});
selectVariant(toneB);selectVariant(toneA);assert.equal(state.copy,'');
console.log(JSON.stringify({before,after:100,rounds:1,versionRoundTrip:'passed',manualEditRoundTrip:'passed',staleRepair:'discarded',toneRoundTrip:'passed',independentToneEdits:'passed',regenerationIsolation:'passed',materialChangeInvalidation:'passed'}));
