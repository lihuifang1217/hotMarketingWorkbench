(()=>{
const fallbackTemplates=globalThis.HotData?.defaultPromptTemplates||{
  system:'你是资深电商媒体微博编辑。当前表达语调：{{语调}}。',
  user:'热点标题：{{热点标题}}\n热点摘要：{{热点摘要}}\n话题标签：{{话题标签}}\n表达语调：{{语调}}\n商品清单：\n{{商品清单}}',
  product:'{{商品序号}}. {{商品名称}}（¥{{商品价格}}）：{{商品卖点}}'
};
function renderTemplate(template,values={}){
  return String(template??'').replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(placeholder,key)=>Object.prototype.hasOwnProperty.call(values,key)?String(values[key]??''):placeholder);
}
function topicTags(news){
  const supplied=Array.isArray(news?.keywords)?news.keywords:typeof news?.keywords==='string'?news.keywords.split(/[,，、\s]+/):[];
  const clean=supplied.map(word=>String(word).replace(/^#|#$/g,'').trim()).filter(Boolean);
  if(clean.length)return clean.slice(0,3).map(word=>`#${word}#`).join(' ');
  const title=String(news?.title||'热点话题').replace(/[，。！？、\s]/g,'').slice(0,16);
  return `#${title||'热点话题'}#`;
}
function normalizeTemplates(templates={}){return {...fallbackTemplates,...templates}}
function buildPromptContext(news,products,variant='活力种草',templates={},creativeStyle=null){
  const active=normalizeTemplates(templates);
  const productList=products.map((product,index)=>renderTemplate(active.product,{
    商品序号:index+1,商品名称:product.name||'',商品价格:product.price??'',商品卖点:product.selling||'',商品分类:product.category||'',商品标签:Array.isArray(product.tags)?product.tags.join('、'):''
  })).join('\n');
  const values={热点标题:news?.title||'',热点摘要:news?.summary||'',话题标签:topicTags(news),商品清单:productList,语调:variant,创作风格:creativeStyle?.name||'',风格要求:creativeStyle?.instruction||''};
  let system=renderTemplate(active.system,values),user=renderTemplate(active.user,values);
  // 已保存的旧模板没有风格占位符时，仍要让每个候选版本收到独立的创作要求。
  if(creativeStyle){
    if(!active.user.includes('{{创作风格}}'))user+=`\n本次创作风格：${creativeStyle.name}`;
    if(!active.user.includes('{{风格要求}}'))user+=`\n本次创作要求：${creativeStyle.instruction}`;
  }
  return {templates:active,values,productList,system,user};
}
function buildMessages(news,products,variant='活力种草',templates={},creativeStyle=null) {
  const prompt=buildPromptContext(news,products,variant,templates,creativeStyle);
  return [
    {role:'system',content:prompt.system},
    {role:'user',content:prompt.user}
  ];
}
function mockCopy(news,products,variant='活力种草',templates={},creativeStyle=null) {
  const p=products[0],tags=topicTags(news);
  const openings={'活力种草':'热点来了，生活灵感也跟上！','理性推荐':'最近关注到这个话题，分享一个实用选择。','轻松互动':'这个热点你刷到了吗？我先来交作业！'};
  const rules=`${buildPromptContext(news,products,variant,templates,creativeStyle).system} ${creativeStyle?.instruction||''}`;
  const instruction=String(creativeStyle?.instruction||'');
  const styleLead=/价格|转化|促销/.test(instruction)?`从真实价格 ¥${p.price} 看，挑选${p.name}也要看日常是否用得上。`:/互动|评论|问题/.test(instruction)?`如果让你选一件贴合这个热点的好物，你会选什么？`:/故事|叙事|场景/.test(instruction)&&creativeStyle?.id!=='hotspot'?`从这个话题想到日常里的一个小场景：${p.name}正好派得上用场。`:creativeStyle?.id==='hotspot'||!creativeStyle?`${openings[variant]||openings['活力种草']}`:`今天聊点实用的：跟着热点发现更顺手的生活选择。`;
  let copy=`${tags} ${styleLead} ✨ ${p.name}，${p.selling}。${products.length>1?`还可以搭配${products.slice(1).map(x=>x.name).join('、')}，把体验感安排到位。`:''}你会怎么选？评论区聊聊👇`;
  const required=[...rules.matchAll(/必须(?:包含|带上)[「“"]([^」”"\n]{1,30})[」”"]/g)].map(match=>match[1]);
  for(const phrase of [...new Set(required)])if(!copy.includes(phrase))copy+=` ${phrase}`;
  if(/(?:不要|不|避免)使用\s*(?:Emoji|emoji|表情)/.test(rules))copy=copy.replace(/[✨👇🎉🔥💡✅❤️👍]/gu,'').replace(/\s{2,}/g,' ');
  const limit=Number(rules.match(/(?:控制|限制)在\s*(\d{1,3})\s*字/)?.[1]);if(limit>0&&copy.length>limit)copy=copy.slice(0,limit);
  return copy;
}

globalThis.HotPrompts = {renderTemplate,buildPromptContext,buildMessages,mockCopy,topicTags};

})();
