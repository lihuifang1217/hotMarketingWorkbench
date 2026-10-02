(()=>{
const {buildMessages,mockCopy}=globalThis.HotPrompts;
function chatEndpoint(baseUrl){const base=baseUrl.replace(/\/$/,'');if(base.endsWith('/chat/completions'))return base;return `${base}${base.includes('api.deepseek.com')||base.endsWith('/v1')?'/chat/completions':'/v1/chat/completions'}`}
function friendlyError(status,message=''){
  const s=String(message).toLowerCase();
  if(status===401||s.includes('api key')||s.includes('api_key')||s.includes('authentication'))return '密钥无效或未配置，请检查密钥。';
  if(status===402||s.includes('balance')||s.includes('insufficient')||s.includes('quota exceeded')||s.includes('billing'))return '账户余额不足，请充值或切换服务商。';
  if(/model.{0,80}(not found|not exist|does not exist|invalid|unknown|unavailable)/.test(s)||s.includes('invalid_model'))return '模型名不存在，请检查模型名称。';
  if(status===404)return '模型名不存在或接口地址不正确，请检查模型名称与接口地址。';
  if(status===429||s.includes('rate limit')||s.includes('rate_limit')||s.includes('too many requests'))return '请求过于频繁，稍后再试。';
  if(s.includes('failed to fetch')||s.includes('fetch failed')||s.includes('cors')||s.includes('network'))return '无法连接模型服务商。浏览器直连可能受到跨域限制，请尝试本地服务中转。';
  return `生成失败，请检查服务连接和设置（状态 ${status||'未知'}）。`;
}
async function generate({news,products,settings,onToken,signal}){
  const start=performance.now();
  if(settings.mode==='mock'){
    await new Promise((resolve,reject)=>{const id=setTimeout(resolve,1500);signal?.addEventListener('abort',()=>{clearTimeout(id);reject(new DOMException('已取消','AbortError'))},{once:true})});
    const value=mockCopy(news,products,settings.variant,settings.promptTemplates,settings.creativeStyle);
    for(const char of value){if(signal?.aborted)throw new DOMException('已取消','AbortError');onToken(char);await new Promise(r=>setTimeout(r,20));}
    return {duration:Math.round(performance.now()-start),usage:{total_tokens:Math.ceil(value.length/2)},text:value};
  }
  const url=settings.mode==='proxy'?(settings.messages?'/api/chat/preview':(settings.proxyEndpoint||'/api/chat')):chatEndpoint(settings.baseUrl);
  const stream=settings.stream!==false;
  let response;
  try {response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(settings.mode==='direct'?{Authorization:`Bearer ${settings.apiKey||''}`}:{})},body:JSON.stringify({model:settings.model,temperature:Number(settings.temperature),stream,...(stream?{stream_options:{include_usage:true}}:{}),...(settings.mode==='direct'&&settings.baseUrl.includes('api.deepseek.com')?{thinking:{type:'disabled'}}:{}),messages:settings.messages||buildMessages(news,products,settings.variant,settings.promptTemplates,settings.creativeStyle)}),signal});}
  catch(error){if(error.name==='AbortError')throw error;throw new Error(friendlyError(0,error.message));}
  if(!response.ok){let body='';try{body=await response.text()}catch{}throw new Error(friendlyError(response.status,body));}
  if(!stream){let result;try{result=await response.json()}catch{throw new Error('模型服务返回了无法识别的内容。')}const value=result.choices?.[0]?.message?.content;if(typeof value!=='string'||!value.trim())throw new Error('模型没有返回正文，请检查模型名称与接口。');for(const char of value){if(signal?.aborted)throw new DOMException('已取消','AbortError');onToken(char);await new Promise(resolve=>setTimeout(resolve,12))}return {duration:Math.round(performance.now()-start),usage:result.usage||null,text:value,model:result.model||settings.model}}
  if(!response.body)throw new Error('服务未返回可读取的文案流。');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',usage=null,actualModel='';
  while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||'';
    for(const line of lines){const data=line.trim();if(!data.startsWith('data:'))continue;const raw=data.slice(5).trim();if(raw==='[DONE]')continue;try{const chunk=JSON.parse(raw);usage=chunk.usage||usage;actualModel=chunk.model||actualModel;const delta=chunk.choices?.[0]?.delta||{};const content=typeof delta.content==='string'?delta.content:'';if(content){text+=content;onToken(content)}}catch{}}
  }
  if(!text)throw new Error('模型没有返回正文，请检查模型是否支持流式对话。');
  return {duration:Math.round(performance.now()-start),usage,text,model:actualModel||settings.model};
}

async function testConnection(settings){
  if(settings.mode==='mock')return {ok:true,simulated:true,model:'本地模拟引擎',duration:0};
  const started=performance.now();let response;
  if(settings.mode==='direct'&&!settings.apiKey)throw new Error('浏览器直连密钥未填写，请先输入密钥。');
  const proxy=settings.mode==='proxy',url=proxy?'/api/chat/test':chatEndpoint(settings.baseUrl);
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(proxy?{}:{Authorization:`Bearer ${settings.apiKey}`})},body:JSON.stringify(proxy?{model:settings.model}:{model:settings.model,messages:[{role:'user',content:'请只回复“连接成功”。'}],temperature:0,max_tokens:16,stream:false,...(settings.baseUrl.includes('api.deepseek.com')?{thinking:{type:'disabled'}}:{})}),signal:AbortSignal.timeout(18000)})}
  catch(error){throw new Error(friendlyError(0,error.message))}
  if(!response.ok){const detail=await response.text().catch(()=>'');throw new Error(friendlyError(response.status,detail))}
  let result;try{result=await response.json()}catch{throw new Error('模型服务返回了无法识别的内容。')}
  return {ok:true,model:result.model||settings.model,duration:proxy?result.duration:Math.round(performance.now()-started)};
}

globalThis.HotLLM={chatEndpoint,friendlyError,generate,testConnection};

})();
