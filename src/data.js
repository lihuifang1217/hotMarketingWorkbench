(()=>{
const defaultProducts = [
  {id:'p1',image:'assets/products/p1.svg',url:'product.html?id=p1',name:'冰丝凉感防晒衣',category:'穿搭',price:129,originalPrice:169,emoji:'🧥',color:'#dbeafe',tags:['冰丝','凉感','防晒','轻薄','夏日','高温','户外'],selling:'接触瞬间清凉，轻薄透气，通勤与出游都能穿'},
  {id:'p2',image:'assets/products/p2.svg',url:'product.html?id=p2',name:'随行冰感保温杯',category:'生活',price:89,originalPrice:119,emoji:'🧊',color:'#dcfce7',tags:['冰饮','降温','便携','高温','消暑'],selling:'长效保冷，随时喝一口冰爽'},
  {id:'p3',image:'assets/products/p3.svg',url:'product.html?id=p3',name:'轻量速干运动鞋',category:'运动',price:269,originalPrice:329,emoji:'👟',color:'#ede9fe',tags:['运动','跑步','夜跑','健身','速干','透气'],selling:'轻量缓震，城市慢跑也自在'},
  {id:'p4',image:'assets/products/p4.svg',url:'product.html?id=p4',name:'折叠露营月亮椅',category:'户外',price:199,originalPrice:259,emoji:'🏕️',color:'#fef3c7',tags:['露营','户外','野餐','便携','旅行'],selling:'一折即走，久坐舒适的户外休憩位'},
  {id:'p5',image:'assets/products/p5.svg',url:'product.html?id=p5',name:'新中式纹样帆布包',category:'文创',price:79,originalPrice:99,emoji:'👜',color:'#fee2e2',tags:['国风','文创','非遗','传统','穿搭','颜值'],selling:'传统纹样融入日常穿搭，轻巧又能装'},
  {id:'p6',image:'assets/products/p6.svg',url:'product.html?id=p6',name:'儿童护眼阅读台灯',category:'亲子',price:159,originalPrice:199,emoji:'💡',color:'#e0f2fe',tags:['学生','开学','学习','亲子','儿童','护眼'],selling:'柔和照明，陪孩子安心阅读'},
  {id:'p7',image:'assets/products/p7.svg',url:'product.html?id=p7',name:'便携手持小风扇',category:'生活',price:49,originalPrice:69,emoji:'🪭',color:'#fce7f3',tags:['高温','降温','消暑','便携','夏日'],selling:'随手带走的小凉风，通勤排队都适用'},
  {id:'p8',image:'assets/products/p8.svg',url:'product.html?id=p8',name:'瑜伽训练弹力带',category:'运动',price:39,originalPrice:49,emoji:'🏋️',color:'#e7f5e9',tags:['健身','运动','瑜伽','训练'],selling:'多档阻力，在家也能轻松开练'},
  {id:'p9',image:'assets/products/p9.svg',url:'product.html?id=p9',name:'轻羽防滑羽毛球鞋',category:'运动',price:239,originalPrice:299,emoji:'🏸',color:'#e7f3ff',tags:['羽毛球','防滑','运动','透气','训练'],selling:'球场防滑抓地，轻盈启动更从容'}
];

const demoNews = [
  {id:'d1',title:'多地持续高温，清凉穿搭与防晒用品搜索量上涨',summary:'高温天气带动清凉穿搭、防晒衣与降温小物的消费关注。',source:'演示热榜',rank:1,heat:'98.6万',url:'',time:new Date().toISOString()},
  {id:'d2',title:'城市夜跑持续升温，年轻人解锁运动新方式',summary:'夜跑成为都市青年日常运动选择，轻量装备和舒适体验受到讨论。',source:'演示热榜',rank:2,heat:'82.1万',url:'',time:new Date().toISOString()},
  {id:'d3',title:'周末露营与郊野野餐成为短途出游热门选择',summary:'短途出游热度上升，便携露营用品进入更多家庭的周末清单。',source:'演示热榜',rank:3,heat:'76.4万',url:'',time:new Date().toISOString()},
  {id:'d4',title:'国风文创热度走高，传统纹样融入日常穿搭',summary:'传统文化元素被年轻消费者用于日常搭配，国风文创持续受到关注。',source:'演示热榜',rank:4,heat:'65.3万',url:'',time:new Date().toISOString()},
  {id:'d5',title:'新学期开启，亲子阅读和护眼学习场景受关注',summary:'家长关注新学期阅读环境，书桌照明与护眼学习习惯成为话题。',source:'演示热榜',rank:5,heat:'54.9万',url:'',time:new Date().toISOString()},
  {id:'d6',title:'某地发生重大地震，多方展开紧急救援',summary:'地震发生后，多方救援力量赶赴现场开展应急处置。',source:'演示热榜',rank:6,heat:'49.2万',url:'',time:new Date().toISOString()},
  {id:'d7',title:'重要经济政策发布引发市场讨论',summary:'新政策发布后引发社会与市场讨论，相关议题仍待人工判断。',source:'演示热榜',rank:7,heat:'42.7万',url:'',time:new Date().toISOString()}
];

const defaultPromptTemplates={
  system:"你是资深电商媒体微博编辑。只输出最终微博正文，不要输出思考过程、分析、标题或 Markdown。不得借灾难、疫情、战争、犯罪或政治事件营销。必须使用素材指定的话题标签，最多三个；至少提到一件绑定商品，结尾向读者提问或邀请评论。正文须在 140 到 180 字之间；写完自己数一遍，超了就删，宁可少写一个卖点也不能超。金额只能原样使用素材里给出的数字；素材没给的价格、折扣、销量、库存一律不许出现。不得使用广告法违禁词，不得虚构功效。以下是合规句式范例，162 字；实际生成时必须换成当前素材：#多地持续高温清凉穿搭与防晒用品搜# 高温通勤想轻松一点？✨ 冰丝凉感防晒衣，轻薄透气，接触瞬间清凉，通勤与出游都能穿。选夏日衣服时，可以先想想自己最常遇到的使用场景，再看看这些卖点是否贴合需求。每天出门怎么搭、周末出游带什么，各人都有自己的习惯，把实际需要放在前面，分享适合自己的生活选择。你最在意哪一个卖点？评论区聊聊👇 当前表达语调：{{语调}}。",
  user:'热点标题：{{热点标题}}\n热点摘要：{{热点摘要}}\n话题标签：{{话题标签}}\n表达语调：{{语调}}\n商品清单：\n{{商品清单}}\n请围绕热点与商品的真实关联写一条微博文案。',
  product:'{{商品序号}}. {{商品名称}}（¥{{商品价格}}）：{{商品卖点}}'
};
const defaultCreativeStyles=[
  {id:'hotspot',name:'热点借势',instruction:'先接住热点情绪，再自然过渡到商品，突出真实使用体验。'},
  {id:'promotion',name:'促销导向',instruction:'突出已提供的价格与购买理由，强调转化，但不得虚构优惠、库存或紧迫感。'},
  {id:'interaction',name:'互动话题',instruction:'围绕热点提出具体问题，邀请评论互动，商品植入自然。'}
];
const defaultTonePresets=['活力种草','理性推荐','轻松互动'];
const providerPresets={
  deepseek:{name:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
  openai:{name:'OpenAI',baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini'},
  qwen:{name:'阿里云百炼（通义千问）',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'},
  custom:{name:'自定义兼容接口',baseUrl:'',model:''}
};
const legacyEvaluationDefaults={minLength:30,maxLength:180,maxTags:3,minEmoji:0,maxEmoji:3,machineWeight:50,reviewWeight:50,maxRepairRounds:2,repairTemperature:0.2,reviewTemperature:0.1,reviewPrompt:'你是严格的微博营销文案评审。只返回 JSON 对象，不要解释或 Markdown。格式：{"relevance":1,"fidelity":1,"appeal":1,"naturalness":1,"comment":"一句点评"}。四个分数是 1 到 5 的整数。核对热点与商品素材，价格或卖点虚构必须降低素材还原度。',repairPrompt:'你是微博文案纠错编辑。只返回修正后的微博正文。逐项修复所列问题；写完自己数一遍，超字数就删，宁可少写一个卖点也不能超。金额只能原样使用素材提供的数字；未提供的价格、折扣、销量、库存一律不许出现。不得使用广告法违禁词，保留指定话题标签，并以互动提问结尾。'};
const defaultEvaluation={...legacyEvaluationDefaults,minLength:140,maxLength:180,reviewPrompt:"你是资深的电商内容评审专家,负责为「热点借势微博营销文案」打分。\n\n请阅读给定的热点新闻、商品资料与待评文案,从以下 4 个维度各打 1~5 分(整数,5 分最好):\n\n- relevance 热点关联度:是否真正借势该热点,而不是生硬贴一个标签。\n- coverage 卖点与价格覆盖准确度:是否准确使用了商品卖点与给定价格,有无编造功效、销量或数字。\n- appeal 传播吸引力:钩子、节奏与互动设计是否能带来点击、评论与转发。\n- tone 语气自然度:是否像真人运营在发微博,而不是 AI 腔或企业公告腔。\n\n输出要求:\n\n1. 只输出一个 JSON 对象,不要任何解释文字,不要 markdown 代码块。\n2. 严格使用如下格式(comment 为一句话点评,不超过 40 字):\n   {\"relevance\":4,\"coverage\":5,\"appeal\":4,\"tone\":5,\"comment\":\"点评\"}。",repairPrompt:"你刚才写的这条微博文案没有通过发布前的合规校验,请针对下面列出的问题逐条修正后重新输出。\n\n【原文案】\n\n{{copy}}\n\n【未通过的检查项】\n\n{{failures}}\n\n【可用素材】(价格只能使用这里出现的数字)\n\n{{products}}\n\n【必须包含的话题标签】{{topics}}\n\n修正要求:\n\n1. 只修问题,尽量保留原文的语气、结构与卖点表达,不要重写成另一篇。\n\n2. 修完后必须同时满足:全文 {{minLength}}~{{maxLength}} 字、价格与素材完全一致、无绝对化用语、话题标签 1~3 个且包含给定话题、结尾有互动引导。\n\n3. 如果是超字数,优先删掉重复的形容词与次要卖点,不要删掉话题标签和互动引导。\n\n4. 只输出修正后的文案正文纯文本,不要解释、不要说明改了什么。"};
const previousRepairPrompt=defaultEvaluation.repairPrompt.replace('全文 {{minLength}}~{{maxLength}} 字','全文 140~220 字');
const defaults = {mode:'mock',provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',temperature:0.85,stream:true,autoThreshold:5000000,products:defaultProducts,sources:['baidu','weibo','zhihu','ithome'],rssFeeds:[],tokenPricing:{inputPerMillion:1,outputPerMillion:2,totalPerMillion:1.5},promptTemplates:defaultPromptTemplates,creativeStyles:defaultCreativeStyles,tonePresets:defaultTonePresets,evaluation:defaultEvaluation};

// 只升级上一版内置提示词；运营自定义内容保持原样。
function normalizeEvaluationSettings(value={}){
  if(!value||typeof value!=='object')value={};
  const result={...defaultEvaluation,...value};
  for(const key of ['reviewPrompt','repairPrompt'])if(result[key]===legacyEvaluationDefaults[key])result[key]=defaultEvaluation[key];
  if(value.repairPrompt===legacyEvaluationDefaults.repairPrompt&&value.minLength===30&&value.maxLength===180){result.minLength=140;result.maxLength=180}
  if(value.repairPrompt===previousRepairPrompt){result.repairPrompt=defaultEvaluation.repairPrompt;if(value.minLength===140&&value.maxLength===220)result.maxLength=180}
  return result;
}

function normalizeSourceSettings(config={}){
  const sources=Array.isArray(config.sources)?config.sources.filter(id=>id!=='customRss'):[...defaults.sources];
  const rssFeeds=Array.isArray(config.rssFeeds)?config.rssFeeds.map(feed=>({...feed})):[];
  // 兼容早期仅能配置一个 customRssUrl 的配置文件。
  if(config.customRssUrl&&!rssFeeds.some(feed=>feed.url===config.customRssUrl))rssFeeds.push({id:'rss-legacy',name:'自定义 RSS',url:config.customRssUrl,enabled:Array.isArray(config.sources)&&config.sources.includes('customRss')});
  return {sources,rssFeeds};
}

function classifyNews(title) {
  const blocked = [
    ['灾难或事故',/地震|洪水|泥石流|台风.*(伤亡|遇难)|坠机|爆炸|火灾|起火|重大事故|遇难|伤亡|溺亡|离世|猝死|塌方|山体滑坡|\b(?:earthquake|flood|landslide|plane crash|air crash|explosion|wildfire|fatal accident|disaster)\b/i],
    ['疫情或公共卫生事件',/疫情|传染病|病毒暴发|确诊病例|疾控紧急|\b(?:pandemic|epidemic|disease outbreak|bioweapons?)\b/i],
    ['战争或武装冲突',/战争|战事|空袭|轰炸|武装冲突|导弹袭击|\b(?:war|warfare|airstrike|missile attack|armed conflict|war zone)\b/i],
    ['犯罪事件',/命案|杀人|强奸|拐卖|绑架|凶杀|枪击|恶性犯罪|受贿|贪污|诈骗|死缓|性侵|抢劫|殴打|\b(?:murder|rape|kidnapping|shooting|sexual assault|terrorist attack)\b/i]
  ];
  for (const [reason,pattern] of blocked) if(pattern.test(title)) return {level:'blocked',reason};
  if(/政府|政策|选举|外交|总统|总理|国会|人大|政治|争议|抗议|维权|冲突|裁员|股市|房价|经济政策|药检|兴奋剂|\b(?:government|election|president|prime minister|parliament|politics|protest|controversy|sanction|stock market|layoffs|white house|Trump)\b/i.test(title)) return {level:'review',reason:'时政、财经或争议性议题，需人工判断'};
  return {level:'safe',reason:'可进入人工选题'};
}

function normalizeNews(items) {return items.map((item,i)=>({...item,id:item.id||`n${i}-${item.title}`,rank:Number(item.rank)||i+1,summary:String(item.summary||'').trim(),publishedAt:item.publishedAt||item.time||null,risk:classifyNews(item.title),sources:item.sources||[item.source]}));}

function productImage(product){
  const value=String(product?.image||'');
  if(product?.artMode!=='emoji'&&(/^assets\/products\/[a-zA-Z0-9_-]+\.svg$/.test(value)||/^https:\/\//i.test(value)))return value;
  if(product?.emoji){
    const color=/^#[0-9a-f]{6}$/i.test(String(product.color||''))?product.color:'#eef2ff';
    const icon=String(product.emoji).slice(0,16).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="160" height="160" rx="22" fill="url(#g)"/><text x="80" y="105" text-anchor="middle" font-size="76">${icon}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  return 'assets/products/placeholder.svg';
}
function productUrl(product){const value=String(product?.url||'');return /^https:\/\//i.test(value)||/^product\.html\?id=[a-zA-Z0-9_-]+$/.test(value)?value:`product.html?id=${encodeURIComponent(product?.id||'')}`}

globalThis.HotData = {defaultProducts, defaultPromptTemplates, providerPresets, demoNews, defaults, normalizeEvaluationSettings, normalizeSourceSettings, classifyNews, normalizeNews, productImage, productUrl};

})();
