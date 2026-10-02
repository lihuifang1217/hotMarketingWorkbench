import assert from 'node:assert/strict';
import './src/data.js';
import './src/matching.js';
import './src/dedupe.js';
import './src/prompts.js';
import './src/llm.js';
import './src/auto.js';

const {normalizeNews,demoNews,defaultProducts,defaults,productImage,productUrl}=globalThis.HotData;
const {matchProducts}=globalThis.HotMatching;
const {titleSimilarity,dedupeBatch,recentPublication}=globalThis.HotDedupe;
const {generate,testConnection,friendlyError,chatEndpoint}=globalThis.HotLLM;
const {renderTemplate,buildPromptContext,mockCopy}=globalThis.HotPrompts;
const {parseHeat,decide}=globalThis.HotAuto;
const news=normalizeNews(demoNews);
assert.equal(news[5].risk.level,'blocked');
assert.equal(news[6].risk.level,'review');
assert.equal(matchProducts(news[6],defaultProducts).length,0);
assert.equal(matchProducts(news[1],defaultProducts)[0].product.name,'轻量速干运动鞋');
assert.ok(matchProducts(news[0],defaultProducts)[0].reason.includes('高温消暑'));
assert.ok(titleSimilarity('多地持续高温，防晒用品搜索量上涨','多地高温防晒用品搜索量持续上涨')>.55);
const one=dedupeBatch([{title:'多地持续高温防晒用品搜索量上涨',source:'A',rank:1},{title:'多地持续高温防晒用品搜索量上涨',source:'B',rank:2}]);
assert.equal(one.length,1);assert.equal(one[0].sources.length,2);
assert.ok(recentPublication('多地持续高温防晒用品搜索量上涨',[{type:'publish',title:'多地高温防晒用品搜索量持续上涨',time:new Date().toISOString()}]));
assert.match(friendlyError(401),/密钥无效/);assert.match(friendlyError(429),/频繁/);
assert.match(friendlyError(400,'Model Not Exist'),/模型名不存在/);
assert.match(friendlyError(402,'insufficient balance'),/余额不足/);
assert.equal(chatEndpoint('https://api.deepseek.com'),'https://api.deepseek.com/chat/completions');
assert.equal(chatEndpoint('https://api.openai.com'),'https://api.openai.com/v1/chat/completions');
assert.equal(chatEndpoint('https://example.com/v1'),'https://example.com/v1/chat/completions');
assert.equal(productImage(defaultProducts[6]),'assets/products/p7.svg');
assert.equal(productUrl(defaultProducts[6]),'product.html?id=p7');
assert.equal(productImage({image:'javascript:alert(1)'}),'assets/products/placeholder.svg');
assert.equal(productUrl({id:'custom',url:'javascript:alert(1)'}),'product.html?id=custom');
assert.equal(parseHeat('98.6万'),986000);assert.equal(parseHeat('1.2亿'),120000000);assert.equal(parseHeat('热榜话题'),null);
const autoSettings={autoThreshold:500000,products:defaultProducts};
assert.equal(decide(news[0],autoSettings,[]).status,'ready');
assert.equal(decide(news[0],{...autoSettings,autoThreshold:1000000},[]).status,'skipped');
assert.equal(decide(news[5],{...autoSettings,autoThreshold:0},[]).status,'skipped');
assert.equal(decide(news[6],{...autoSettings,autoThreshold:0},[]).status,'skipped');
assert.match(decide(news[0],autoSettings,[{type:'publish',title:news[0].title,time:new Date().toISOString()}]).reason,/三天/);
assert.equal(decide({...news[0],heat:''},autoSettings,[]).status,'skipped');
assert.match(decide({title:'Gucci新款中国制造运动鞋7050元/双',heat:'5142916',risk:{level:'safe'}},autoSettings,[]).reason,/90%/);
const testTemplates={system:'新规范：{{语调}}；{{未知规范}}',user:'{{热点标题}}\n{{商品清单}}\n{{不存在的占位符}}',product:'[{{商品序号}}] {{商品名称}} / {{商品卖点}}'};
const promptPreview=buildPromptContext(news[0],defaultProducts.slice(0,2),'理性推荐',testTemplates);
assert.match(promptPreview.productList,/\[1\] 冰丝凉感防晒衣/);
assert.match(promptPreview.user,/\[2\] 随行冰感保温杯/);
assert.match(promptPreview.user,/\{\{不存在的占位符\}\}/);
assert.equal(renderTemplate('A{{已知}}B{{未知}}',{已知:'1'}),'A1B{{未知}}');
assert.match(mockCopy(news[0],[defaultProducts[0]],'活力种草',{...testTemplates,system:'文案结尾必须包含「理性消费」。'}),/理性消费$/);
assert.ok(defaults.creativeStyles.length>=1&&defaults.tonePresets.length>=1);
const extraStyle={id:'story-test',name:'叙事版',instruction:'使用故事口吻和生活场景'};
const stylePrompt=buildPromptContext(news[0],[defaultProducts[0]],'理性推荐',testTemplates,extraStyle);
assert.match(stylePrompt.user,/本次创作风格：叙事版/);
assert.match(stylePrompt.user,/本次创作要求：使用故事口吻和生活场景/);
assert.notEqual(mockCopy(news[0],[defaultProducts[0]],'理性推荐',testTemplates,extraStyle),mockCopy(news[0],[defaultProducts[0]],'理性推荐',testTemplates,defaults.creativeStyles[1]));

const originalFetch=globalThis.fetch;
let sentPayload;
let sentUrl;
globalThis.fetch=async(url,options)=>{sentUrl=url;sentPayload=JSON.parse(options.body);return new Response(new ReadableStream({start(controller){for(const part of [
  'data: {"choices":[{"delta":{"reasoning_content":"内部思考"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"#话题# 好物来啦 ✨"}}]}\n\n',
  'data: {"choices":[],"usage":{"total_tokens":42}}\n\n',
  'data: [DONE]\n\n'])controller.enqueue(new TextEncoder().encode(part));controller.close()}}),{status:200,headers:{'Content-Type':'text/event-stream'}})};
try{
  let visible='';
  const directSettings={mode:'direct',baseUrl:'https://example.com',model:'demo',temperature:.85,apiKey:'test',variant:'活力种草',creativeStyle:extraStyle,promptTemplates:testTemplates};
  const result=await generate({news:news[0],products:[defaultProducts[0]],settings:directSettings,onToken:part=>visible+=part});
  assert.equal(visible,'#话题# 好物来啦 ✨');
  assert.equal(result.usage.total_tokens,42);
  assert.ok(!visible.includes('内部思考'));
  assert.equal(sentPayload.messages[0].content,'新规范：活力种草；{{未知规范}}');
  assert.match(sentPayload.messages[1].content,/\{\{不存在的占位符\}\}/);
  assert.match(sentPayload.messages[1].content,/本次创作要求：使用故事口吻和生活场景/);
  visible='';
  await generate({news:news[0],products:[defaultProducts[0]],settings:{...directSettings,mode:'proxy',model:'wrong-model',proxyEndpoint:'/api/chat/preview'},onToken:part=>visible+=part});
  assert.equal(sentUrl,'/api/chat/preview');
  assert.equal(sentPayload.model,'wrong-model');
  assert.equal(visible,'#话题# 好物来啦 ✨');
  globalThis.fetch=async()=>new Response('{"error":{"message":"Model Not Exist"}}',{status:400});
  await assert.rejects(generate({news:news[0],products:[defaultProducts[0]],settings:{...directSettings,mode:'proxy',proxyEndpoint:'/api/chat/preview'},onToken:()=>{}}),/模型名不存在/);
  globalThis.fetch=async()=>new Response('{"error":{"message":"Invalid API key"}}',{status:401});
  await assert.rejects(testConnection(directSettings),/密钥无效/);
  globalThis.fetch=async(url,options)=>{sentPayload=JSON.parse(options.body);return new Response(JSON.stringify({model:'provider-actual-model',choices:[{message:{content:'#话题# 非流式正文'}}],usage:{total_tokens:12}}),{status:200,headers:{'Content-Type':'application/json'}})};
  visible='';const nonstream=await generate({news:news[0],products:[defaultProducts[0]],settings:{...directSettings,stream:false},onToken:part=>visible+=part});
  assert.equal(sentPayload.stream,false);assert.ok(!('stream_options' in sentPayload));assert.equal(visible,'#话题# 非流式正文');assert.equal(nonstream.model,'provider-actual-model');
}finally{globalThis.fetch=originalFetch}
console.log('验证通过：自动热度/风险/匹配门槛/去重、提示词嵌套、试运行流式输出与模型错误翻译');
