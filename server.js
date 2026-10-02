// 零依赖本地服务。公开热榜接口仅适合原型演示；正式上线应使用官方开放平台或商业舆情服务，并遵守来源的 robots 协议与服务条款。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './src/data.js';
import './src/dedupe.js';
import './src/prompts.js';
import './src/llm.js';
const {defaults,normalizeNews,normalizeSourceSettings,normalizeEvaluationSettings}=globalThis.HotData;
const {dedupeBatch,recentPublication}=globalThis.HotDedupe;
const {chatEndpoint,friendlyError}=globalThis.HotLLM;

const root=path.dirname(fileURLToPath(import.meta.url)),dataDir=path.join(root,'data');
const configPath=path.join(dataDir,'config.json'),logPath=path.join(dataDir,'activity.jsonl');
const evalPath=path.join(dataDir,'evaluations.json');
const port=Number(process.env.PORT)||8787;
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
function mergeConfig(value={}){return {...defaults,...value,...normalizeSourceSettings(value),tokenPricing:{...defaults.tokenPricing,...value.tokenPricing},promptTemplates:{...defaults.promptTemplates,...value.promptTemplates},evaluation:normalizeEvaluationSettings(value.evaluation)}}
async function config(){try{const value=mergeConfig(await readJson(configPath));validateConfig(value);return value}catch{return {...mergeConfig(),apiKey:''}}}
async function storedConfig(){let raw;try{raw=await fs.readFile(configPath,'utf8')}catch(error){if(error.code==='ENOENT')return {raw:null,value:mergeConfig()};throw error}let parsed;try{parsed=JSON.parse(raw)}catch{throw new Error('现有服务端配置文件不是有效 JSON，请先修复文件')}const value=mergeConfig(parsed);validateConfig(value);return {raw,value}}
async function writeConfig(next,previousRaw){
  await fs.mkdir(dataDir,{recursive:true});
  await fs.writeFile(configPath+'.bak',previousRaw??JSON.stringify(mergeConfig(),null,2));
  const temporary=`${configPath}.tmp-${process.pid}-${Date.now()}`;
  try{await fs.writeFile(temporary,JSON.stringify(next,null,2));await fs.rename(temporary,configPath)}catch(error){await fs.rm(temporary,{force:true}).catch(()=>{});throw error}
  hotCache.at=0;
}
async function log(record){await fs.mkdir(dataDir,{recursive:true});await fs.appendFile(logPath,JSON.stringify({time:new Date().toISOString(),...record})+'\n')}
async function records(limit=500){try{const rows=(await fs.readFile(logPath,'utf8')).trim().split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});return limit===null?rows:rows.slice(-limit)}catch{return []}}
async function evaluations(){try{const value=await readJson(evalPath);return {cases:Array.isArray(value.cases)?value.cases:[],runs:Array.isArray(value.runs)?value.runs:[]}}catch{return {cases:[],runs:[]}}}
async function saveEvaluations(value){if(!Array.isArray(value.cases)||!Array.isArray(value.runs)||value.cases.length>300||value.runs.length>100)throw new Error('评测数据数量超限');for(const item of value.cases){if(!item||!String(item.id||'').trim()||!String(item.news?.title||'').trim()||!Array.isArray(item.products)||!item.products.length)throw new Error('用例缺少编号、热点或商品')}if(value.runs.some(run=>!run||!String(run.id||'').trim()||!run.snapshot||!Array.isArray(run.results)||run.results.length>500))throw new Error('评测历史格式无效或单轮超过 500 条');await fs.mkdir(dataDir,{recursive:true});let previous=null;try{previous=await fs.readFile(evalPath,'utf8')}catch{}if(previous!==null)await fs.writeFile(evalPath+'.bak',previous);const temp=`${evalPath}.tmp-${process.pid}`;await fs.writeFile(temp,JSON.stringify(value,null,2));await fs.rename(temp,evalPath)}
async function body(req,limit=1024*1024){let s='';for await(const c of req){s+=c;if(s.length>limit)throw new Error('请求过大')}return JSON.parse(s||'{}')}
function publicConfig(c){const {mode,provider,baseUrl,model,temperature,stream,products,sources,rssFeeds,customRssUrl,tokenPricing,apiKey,promptTemplates,creativeStyles,tonePresets,evaluation}=c;return {mode,provider,baseUrl,model,temperature,stream,autoThreshold:c.autoThreshold??defaults.autoThreshold,products,sources,rssFeeds,customRssUrl:customRssUrl||'',tokenPricing,promptTemplates:{...defaults.promptTemplates,...promptTemplates},creativeStyles,tonePresets,evaluation,keyConfigured:Boolean(apiKey)}}
const builtInSources=['baidu','weibo','zhihu','ithome'];
function validateSourceSettings(c){
  if(!Array.isArray(c.sources)||c.sources.some(id=>!builtInSources.includes(id))||new Set(c.sources).size!==c.sources.length)throw new Error('平台热榜来源无效');
  if(!Array.isArray(c.rssFeeds)||c.rssFeeds.length>30)throw new Error('订阅源最多 30 个');
  const ids=new Set(),urls=new Set();
  for(const feed of c.rssFeeds){
    if(!feed||typeof feed.id!=='string'||!/^rss-[a-zA-Z0-9-]{1,80}$/.test(feed.id)||ids.has(feed.id))throw new Error('订阅源编号无效或重复');ids.add(feed.id);
    if(typeof feed.name!=='string'||!feed.name.trim()||feed.name.length>80)throw new Error('订阅源名称须为 1 到 80 字');
    if(typeof feed.enabled!=='boolean')throw new Error('订阅源启停状态无效');
    if(typeof feed.url!=='string'||feed.url.length>2048)throw new Error('订阅源地址格式不正确');
    let url;try{url=new URL(feed.url)}catch{throw new Error(`订阅源「${feed.name}」地址格式不正确`)}
    if(url.protocol!=='https:'||url.username||url.password||!url.hostname||url.hash)throw new Error(`订阅源「${feed.name}」须使用无账号信息的 HTTPS 地址`);
    if(urls.has(url.href))throw new Error('订阅源地址不能重复');urls.add(url.href);
  }
  if(!c.sources.length&&!c.rssFeeds.some(feed=>feed.enabled))throw new Error('至少启用一个抓取来源');
}
function validateConfig(c){
  if(!['mock','proxy','direct'].includes(c.mode))throw new Error('模式无效');
  if(!['deepseek','openai','qwen','custom'].includes(c.provider))throw new Error('服务商无效');
  if(typeof c.stream!=='boolean')throw new Error('流式输出设置无效');
  if(!Array.isArray(c.products)||!c.products.length)throw new Error('商品列表不能为空');
  if(c.products.some(p=>!p?.id||!String(p.name||'').trim()||!Number.isFinite(Number(p.price))||Number(p.price)<=0||!Array.isArray(p.tags)))throw new Error('商品数据缺少编号、名称、有效售价或标签');
  if(new Set(c.products.map(p=>String(p.id))).size!==c.products.length)throw new Error('商品编号不能重复');
  if(c.products.some(p=>p.originalPrice!==undefined&&(!Number.isFinite(Number(p.originalPrice))||Number(p.originalPrice)<=0||Number(p.originalPrice)<Number(p.price))))throw new Error('商品原价必须大于 0 且不低于售价');
  validateSourceSettings(c);
  if(!Number.isFinite(Number(c.temperature))||c.temperature<0||c.temperature>2)throw new Error('温度须在 0 到 2 之间');
  if(c.autoThreshold!==undefined&&(!Number.isSafeInteger(c.autoThreshold)||c.autoThreshold<0))throw new Error('自动热度阈值须为非负整数');
  if(!c.tokenPricing||['inputPerMillion','outputPerMillion','totalPerMillion'].some(key=>!Number.isFinite(c.tokenPricing[key])||c.tokenPricing[key]<0||c.tokenPricing[key]>100000))throw new Error('Token 单价须为 0 到 100000 的数字');
  if(!c.evaluation||['minLength','maxLength','maxTags','minEmoji','maxEmoji','machineWeight','reviewWeight','maxRepairRounds','repairTemperature','reviewTemperature'].some(key=>!Number.isFinite(Number(c.evaluation[key])))||c.evaluation.minLength<1||c.evaluation.maxLength<c.evaluation.minLength||c.evaluation.maxLength>1000||c.evaluation.maxTags<1||c.evaluation.maxTags>10||c.evaluation.minEmoji<0||c.evaluation.maxEmoji<c.evaluation.minEmoji||c.evaluation.maxEmoji>10||c.evaluation.maxRepairRounds<0||c.evaluation.maxRepairRounds>5||c.evaluation.repairTemperature<0||c.evaluation.repairTemperature>2||c.evaluation.reviewTemperature<0||c.evaluation.reviewTemperature>2||['reviewPrompt','repairPrompt'].some(key=>typeof c.evaluation[key]!=='string'||!c.evaluation[key].trim()||c.evaluation[key].length>12000))throw new Error('评测配置不完整或超出有效范围');
  if(!c.promptTemplates||!['system','user','product'].every(key=>typeof c.promptTemplates[key]==='string'&&c.promptTemplates[key].trim()&&c.promptTemplates[key].length<=12000))throw new Error('提示词模板须完整且每项不超过 12000 字');
  if(!Array.isArray(c.creativeStyles)||!c.creativeStyles.length||c.creativeStyles.length>12||c.creativeStyles.some(style=>!style||typeof style.id!=='string'||!style.id||typeof style.name!=='string'||!style.name.trim()||style.name.length>40||typeof style.instruction!=='string'||!style.instruction.trim()||style.instruction.length>1000)||new Set(c.creativeStyles.map(style=>style.id)).size!==c.creativeStyles.length)throw new Error('至少保留一个完整的创作风格，最多 12 个');
  if(!Array.isArray(c.tonePresets)||!c.tonePresets.length||c.tonePresets.length>30||c.tonePresets.some(tone=>typeof tone!=='string'||!tone.trim()||tone.length>40)||new Set(c.tonePresets).size!==c.tonePresets.length)throw new Error('至少保留一个不重复的语调，最多 30 个');
  if(!c.model||!c.baseUrl)throw new Error('模型名和接口地址不能为空');
  const u=new URL(c.baseUrl);if(u.protocol!=='https:'&&!/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(c.baseUrl))throw new Error('接口地址须为 HTTPS');
}
const sourceDefs={
  baidu:{name:'百度热搜',url:'https://top.baidu.com/api/board?platform=pc&tab=realtime',parse:async response=>{
    const x=await response.json();return (x.data?.cards||[]).flatMap(card=>card.content||[]).filter(r=>r.word).slice(0,50).map((r,i)=>({title:r.word,summary:cleanSummary(r.desc),publishedAt:null,rank:i+1,heat:r.hotScore||'',url:r.url||''}));}},
  weibo:{name:'微博热搜',url:'https://weibo.com/ajax/side/hotSearch',parse:async response=>{
    const x=await response.json();return (x.data?.realtime||[]).filter(r=>r.word).slice(0,30).map((r,i)=>({title:r.word,rank:i+1,heat:r.num?String(r.num):'',url:`https://s.weibo.com/weibo?q=${encodeURIComponent(r.word)}`}));}},
  zhihu:{name:'知乎热榜',url:'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=30',parse:async response=>{
    const x=await response.json();return (x.data||[]).filter(r=>r.target?.title).slice(0,30).map((r,i)=>({title:r.target.title,summary:cleanSummary(r.target.excerpt),publishedAt:validDate(r.target.created),rank:i+1,heat:r.detail_text||'',url:r.target.url?.replace('api.zhihu.com/questions/','www.zhihu.com/question/')||''}));}},
  ithome:{name:'IT之家 RSS',url:'https://www.ithome.com/rss/',parse:async response=>parseRss(await response.text())}
};
function decodeXml(s){return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos|#(\d+));/g,(m,n)=>n?String.fromCodePoint(Number(n)):({ '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[m]||m)).replace(/<[^>]+>/g,'').trim()}
function cleanSummary(value){return decodeXml(String(value||'')).replace(/&nbsp;|\u00a0/g,' ').replace(/\s+/g,' ').trim().slice(0,220)}
function validDate(value){if(!value)return null;const date=new Date(typeof value==='number'?value*1000:value);return Number.isNaN(date.getTime())?null:date.toISOString()}
function parseRss(xml){const blocks=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>|<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];return blocks.slice(0,30).map((m,i)=>{const b=m[1]||m[2],title=decodeXml(b.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),link=decodeXml(b.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]||'')||b.match(/<link[^>]*href="([^"]+)"/i)?.[1]||'',description=b.match(/<(?:description|summary|content:encoded)\b[^>]*>([\s\S]*?)<\/(?:description|summary|content:encoded)>/i)?.[1]||'',published=b.match(/<(?:pubDate|published|updated)\b[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i)?.[1]||'';return {title,summary:cleanSummary(description),publishedAt:validDate(decodeXml(published)),url:link,rank:i+1,heat:''}}).filter(x=>x.title)}
const hotCache={at:0,value:null};
let autoPublishQueue=Promise.resolve();
function serialAutoPublish(entry){const task=autoPublishQueue.then(async()=>{if(recentPublication(entry.title,await records()))return {ok:false,duplicate:true};await log(entry);return {ok:true}});autoPublishQueue=task.catch(()=>{});return task}
function sourceError(error){
  if(error.name==='TimeoutError'||error.name==='AbortError')return '请求超时（7 秒）';
  if(/HTTP 401|HTTP 403/.test(error.message))return '对方拒绝访问（HTTP 401/403）';
  if(/HTTP 404/.test(error.message))return '地址不存在（HTTP 404）';
  if(/HTTP 429/.test(error.message))return '对方限流（HTTP 429）';
  if(/HTTP \d+/.test(error.message))return `对方返回 ${error.message}`;
  if(/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate|redirect/i.test(error.message))return '地址无法访问、证书无效或对方拒绝连接';
  return error.message==='来源返回空列表'?'未找到可识别的 RSS/Atom 条目':`解析失败：${error.message}`;
}
async function fetchSource(id,feed){const def=feed?{name:feed.name,url:feed.url,parse:async r=>parseRss(await r.text())}:sourceDefs[id];const start=Date.now();
  if(!def?.url)return {id,name:def?.name||id,status:'failed',count:0,duration:0,error:'未配置来源地址',items:[]};
  try{const response=await fetch(def.url,{signal:AbortSignal.timeout(7000),redirect:feed?'error':'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; HotMarketingPrototype/1.0)','Accept':'application/json, application/rss+xml, application/xml, text/xml, */*'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const items=(await def.parse(response)).map(x=>({...x,source:def.name,id:`${id}-${x.rank}-${x.title}`}));if(!items.length)throw new Error('来源返回空列表');return {id,name:def.name,status:'success',count:items.length,duration:Date.now()-start,items};}
  catch(e){return {id,name:def.name,status:'failed',count:0,duration:Date.now()-start,error:sourceError(e),items:[]}}}
async function runSources(settings){return Promise.all([...settings.sources.map(id=>fetchSource(id)),...settings.rssFeeds.filter(feed=>feed.enabled).map(feed=>fetchSource(feed.id,feed))])}
async function fetchHot(settings,force=false){if(!force&&hotCache.value&&Date.now()-hotCache.at<120000)return {...hotCache.value,cached:true};
  const outcomes=await runSources(settings);
  const all=outcomes.flatMap(s=>s.items),news=dedupeBatch(normalizeNews(all));news.forEach((item,i)=>{item.sourceRank=item.rank;item.rank=i+1});
  const result={news,sources:outcomes.map(({items,...rest})=>rest),blocked:news.filter(x=>x.risk.level==='blocked').length,deduped:all.length-news.length,mode:news.length?'live':'demo',at:new Date().toISOString(),cached:false};
  hotCache.value=result;hotCache.at=Date.now();await log({type:'fetch',sourceStatus:result.sources,returned:news.length,blocked:result.blocked,deduped:result.deduped,mode:result.mode});return result;
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
async function staticFile(req,res){const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+pathname);if(!target.startsWith(root+path.sep)&&target!==root)return json(res,403,{error:'禁止访问'});if(target.startsWith(dataDir+path.sep)||target===dataDir)return json(res,403,{error:'禁止访问'});
  const file=pathname==='/'?path.join(root,'index.html'):target;try{const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes)}catch{json(res,404,{error:'文件不存在'})}}
async function handler(req,res){try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&pathname==='/api/config'){let stored=null;try{stored=mergeConfig(await readJson(configPath));validateConfig(stored)}catch{}return json(res,200,{config:stored?publicConfig(stored):null,source:stored?'server':'unavailable'})}
  if(req.method==='PUT'&&pathname==='/api/config'){
    const next=await body(req),previous=await storedConfig();const merged=mergeConfig({...previous.value,...next,apiKey:previous.value.apiKey});validateConfig(merged);
    await writeConfig(merged,previous.raw);return json(res,200,{config:publicConfig(merged),source:'server'});
  }
  if(req.method==='POST'&&pathname==='/api/config/restore'){
    let backupRaw;try{backupRaw=await fs.readFile(configPath+'.bak','utf8')}catch(error){if(error.code==='ENOENT')return json(res,404,{error:'尚无服务端备份可恢复'});throw error}
    let backup;try{backup=mergeConfig(JSON.parse(backupRaw));validateConfig(backup)}catch{return json(res,400,{error:'服务端备份格式无效，原配置未更改'})}
    const current=await storedConfig();await writeConfig(backup,current.raw);return json(res,200,{config:publicConfig(backup),source:'server'});
  }
  if(req.method==='GET'&&pathname==='/api/hot'){const settings=await config();return json(res,200,await fetchHot(settings,new URL(req.url,'http://localhost').searchParams.has('force')))}
  if(req.method==='POST'&&pathname==='/api/sources/test'){
    const draft=await body(req),settings={sources:draft.sources,rssFeeds:draft.rssFeeds};validateSourceSettings(settings);
    const outcomes=await runSources(settings);return json(res,200,{sources:outcomes.map(({items,...rest})=>rest)});
  }
  if(req.method==='GET'&&pathname==='/api/records')return json(res,200,{records:await records(new URL(req.url,'http://localhost').searchParams.has('all')?null:500)});
  if(req.method==='GET'&&pathname==='/api/evaluations')return json(res,200,await evaluations());
  if(req.method==='PUT'&&pathname==='/api/evaluations'){const value=await body(req,4*1024*1024);await saveEvaluations(value);return json(res,200,{ok:true})}
  if(req.method==='POST'&&pathname==='/api/log'){const entry=await body(req);if(!['generate','publish'].includes(entry.type))return json(res,400,{error:'流水类型无效'});const clean={type:entry.type,title:String(entry.title||'').slice(0,300),keywords:Array.isArray(entry.keywords)?entry.keywords.slice(0,8).map(word=>String(word).slice(0,40)):[],products:Array.isArray(entry.products)?entry.products:[],mode:String(entry.mode||''),model:String(entry.model||'').slice(0,120),creativeStyle:String(entry.creativeStyle||'').slice(0,80),status:entry.status==='failed'?'failed':'success',duration:Number(entry.duration)||0,usage:entry.usage||null,copy:String(entry.copy||'').slice(0,500),repairTrace:Array.isArray(entry.repairTrace)?entry.repairTrace.slice(0,5).map(row=>({round:Number(row.round)||0,before:Number(row.before)||0,after:Number(row.after)||0,accepted:Boolean(row.accepted),fixed:Array.isArray(row.fixed)?row.fixed.slice(0,8).map(String):[],remaining:Array.isArray(row.remaining)?row.remaining.slice(0,8).map(String):[]})):[],validationScore:Number.isFinite(Number(entry.validationScore))?Number(entry.validationScore):null};if(clean.type==='publish'&&clean.mode==='auto-simulation')return json(res,200,await serialAutoPublish(clean));await log(clean);return json(res,200,{ok:true})}
  if(req.method==='POST'&&pathname==='/api/chat/test'){
    const settings=await config();if(!settings.apiKey)return json(res,401,{error:'服务端未配置密钥，请在 data/config.json 中设置 apiKey。'});
    const payload=await body(req),model=String(payload.model||settings.model).trim();
    if(!model||model.length>120)return json(res,400,{error:'模型名须为 1 到 120 个字符'});
    const started=performance.now();let upstream;
    try{upstream=await fetch(chatEndpoint(settings.baseUrl),{method:'POST',headers:{Authorization:`Bearer ${settings.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:'请只回复“连接成功”。'}],temperature:0,max_tokens:16,stream:false,...(settings.baseUrl.includes('api.deepseek.com')?{thinking:{type:'disabled'}}:{})}),signal:AbortSignal.timeout(15000)})}
    catch(error){return json(res,502,{error:friendlyError(0,error.message)})}
    if(!upstream.ok){const detail=await upstream.text().catch(()=>'');return json(res,upstream.status,{error:friendlyError(upstream.status,detail)})}
    let result;try{result=await upstream.json()}catch{return json(res,502,{error:'模型服务返回了无法识别的内容。'})}
    return json(res,200,{ok:true,model:result.model||model,duration:Math.round(performance.now()-started)});
  }
  if(req.method==='POST'&&(pathname==='/api/chat'||pathname==='/api/chat/preview')){
    const settings=await config();if(!settings.apiKey)return json(res,401,{error:'API key missing'});const payload=await body(req);
    const preview=pathname==='/api/chat/preview';
    const model=preview?String(payload.model||'').trim():settings.model;
    if(preview&&(!model||model.length>120))return json(res,400,{error:'试运行模型名须为 1 到 120 个字符'});
    if(preview&&(!Array.isArray(payload.messages)||payload.messages.length!==2||!payload.messages.every(message=>['system','user'].includes(message.role)&&typeof message.content==='string'&&message.content.length<=30000)))return json(res,400,{error:'试运行提示词格式无效'});
    const stream=preview&&payload.stream!==undefined?payload.stream!==false:settings.stream!==false;
    const disconnect=new AbortController();res.on('close',()=>{if(!res.writableEnded)disconnect.abort()});
    const upstream=await fetch(chatEndpoint(settings.baseUrl),{method:'POST',headers:{Authorization:`Bearer ${settings.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:preview&&payload.temperature!==undefined?Math.max(0,Math.min(2,Number(payload.temperature)||0)):settings.temperature,stream,...(stream?{stream_options:{include_usage:true}}:{}),...(settings.baseUrl.includes('api.deepseek.com')?{thinking:{type:'disabled'}}:{}),messages:payload.messages}),signal:AbortSignal.any([AbortSignal.timeout(90000),disconnect.signal])});
    res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'text/event-stream; charset=utf-8','Cache-Control':'no-cache'});
    if(!upstream.body)return res.end();for await(const chunk of upstream.body)res.write(chunk);return res.end();
  }
  if(req.method==='GET')return staticFile(req,res);return json(res,405,{error:'不支持该操作'});
}catch(e){if(!res.destroyed)json(res,400,{error:e.message})}}
http.createServer(handler).listen(port,'127.0.0.1',()=>console.log(`热点营销工作台：http://127.0.0.1:${port}`));
