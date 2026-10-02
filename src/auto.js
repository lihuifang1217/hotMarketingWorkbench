(()=>{
const {classifyNews}=globalThis.HotData;
const {matchProducts}=globalThis.HotMatching;
const {recentPublication}=globalThis.HotDedupe;
function parseHeat(value){
  const raw=String(value??'').replace(/,/g,'').trim();
  const match=raw.match(/(?:^|[^\d.])([\d]+(?:\.[\d]+)?)\s*(亿|万|千)?/);
  if(!match)return null;
  const count=Number(match[1])*({'亿':1e8,'万':1e4,'千':1}[match[2]]||1);
  return Number.isFinite(count)?Math.round(count):null;
}
function decide(news,settings,records){
  const risk=classifyNews(`${news.title||''} ${news.summary||''}`);
  if(risk.level!=='safe')return {status:'skipped',reason:risk.level==='blocked'?`禁止借势：${risk.reason}`:`需人工判断：${risk.reason}`};
  const heat=parseHeat(news.heat);
  if(heat===null)return {status:'skipped',reason:'来源未提供可量化热度'};
  if(heat<settings.autoThreshold)return {status:'skipped',reason:`热度 ${heat.toLocaleString('zh-CN')} 未达到阈值`};
  if(recentPublication(news.title,records))return {status:'skipped',reason:'近三天已发送相似热点'};
  const matches=matchProducts({...news,risk},settings.products);
  if(!matches.length)return {status:'skipped',reason:'未命中消费场景或没有匹配商品'};
  if(matches[0].score<90)return {status:'skipped',reason:`商品匹配度最高仅 ${matches[0].score}%，未达到自动发送要求（90%）`};
  return {status:'ready',reason:matches[0].reason,heat,match:matches[0]};
}
globalThis.HotAuto={parseHeat,decide};
})();
