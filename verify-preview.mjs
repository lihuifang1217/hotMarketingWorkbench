import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {createServer as createPortServer} from 'node:net';
import './src/data.js';
import './src/prompts.js';
import './src/llm.js';
import './src/evaluation.js';

const projectRoot=fileURLToPath(new URL('.',import.meta.url));
const testRoot=await mkdtemp(join(tmpdir(),'hot-preview-test-'));
const requests=[],authorizationHeaders=[];
const upstream=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const payload=JSON.parse(raw);requests.push(payload);authorizationHeaders.push(req.headers.authorization);
  if(payload.stream===false){
    if(req.headers.authorization!=='Bearer fake-local-test-key'){res.writeHead(401,{'Content-Type':'application/json'});res.end('{"error":{"message":"Invalid API key"}}');return}
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({model:'upstream-actual-model',choices:[{message:{content:payload.messages?.[0]?.content?.includes('严格的微博营销文案评审')?'评审如下：```json\n{"relevance":4,"fidelity":5,"appeal":3,"naturalness":4,"comment":"素材准确"}\n```':'连接成功'}}],usage:{total_tokens:5}}));return;
  }
  if(payload.model==='wrong-model'){
    res.writeHead(404,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:{message:'Model Not Exist'}}));
    return;
  }
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end('data: {"choices":[{"delta":{"reasoning_content":"内部思考"}}]}\n\ndata: {"choices":[{"delta":{"content":"#试运行# 测试文案"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":28,"completion_tokens":9,"total_tokens":37}}\n\ndata: [DONE]\n\n');
});
let backend;
try{
  await mkdir(join(testRoot,'src'));
  await mkdir(join(testRoot,'data'));
  for(const file of ['server.js','src/data.js','src/dedupe.js','src/prompts.js','src/llm.js']){
    await copyFile(join(projectRoot,file),join(testRoot,file));
  }
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const upstreamPort=upstream.address().port;
  const portProbe=createPortServer();
  portProbe.listen(0,'127.0.0.1');await once(portProbe,'listening');
  const backendPort=portProbe.address().port;
  await new Promise(resolve=>portProbe.close(resolve));
  await writeFile(join(testRoot,'data/config.json'),JSON.stringify({...globalThis.HotData.defaults,mode:'proxy',baseUrl:`http://127.0.0.1:${upstreamPort}`,model:'stored-model',apiKey:'fake-local-test-key'}));
  backend=spawn(process.execPath,[join(testRoot,'server.js')],{env:{...process.env,PORT:String(backendPort)},stdio:['ignore','pipe','pipe']});
  let startupTimer;
  try{
    await Promise.race([once(backend.stdout,'data'),once(backend,'exit').then(()=>{throw new Error('测试服务启动失败')}),new Promise((_,reject)=>{startupTimer=setTimeout(()=>reject(new Error('测试服务启动超时')),5000)})]);
  }finally{clearTimeout(startupTimer)}
  const endpoint=`http://127.0.0.1:${backendPort}/api/chat/preview`;
  const messages=globalThis.HotPrompts.buildMessages(globalThis.HotData.demoNews[0],[globalThis.HotData.defaultProducts[0]],'活力种草');
  const run=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'trial-model',messages})});
  assert.equal(run.status,200);
  const stream=await run.text();
  assert.match(stream,/#试运行# 测试文案/);
  assert.match(stream,/"total_tokens":37/);
  assert.equal(requests[0].model,'trial-model');
  assert.equal(requests[0].messages[0].content,messages[0].content);
  const bad=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'wrong-model',messages})});
  assert.equal(bad.status,404);
  assert.match(globalThis.HotLLM.friendlyError(bad.status,await bad.text()),/模型名不存在/);
  assert.equal(requests[1].model,'wrong-model');
  const testEndpoint=`http://127.0.0.1:${backendPort}/api/chat/test`;
  const testResponse=await fetch(testEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'trial-model'})});
  assert.equal(testResponse.status,200);const testResult=await testResponse.json();
  assert.equal(testResult.model,'upstream-actual-model');assert.ok(testResult.duration>=0);assert.equal(requests[2].stream,false);
  const save=await fetch(`http://127.0.0.1:${backendPort}/api/config`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'updated-model',stream:false,apiKey:'browser-should-not-overwrite'})});
  assert.equal(save.status,200);const saved=await save.json();assert.equal(saved.config.model,'updated-model');assert.equal(saved.config.stream,false);assert.equal(saved.config.keyConfigured,true);assert.equal('apiKey' in saved.config,false);
  const nonstream=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'nonstream-model',messages})});
  assert.equal(nonstream.status,200);assert.equal((await nonstream.json()).model,'upstream-actual-model');assert.equal(requests[3].stream,false);assert.equal('stream_options' in requests[3],false);assert.equal(authorizationHeaders[3],'Bearer fake-local-test-key');
  const reviewMessages=globalThis.HotEvaluation.reviewMessages('测试正文',globalThis.HotData.demoNews[0],[globalThis.HotData.defaultProducts[0]]);
  const judge=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'judge-model',temperature:0.1,stream:false,messages:reviewMessages})});
  assert.equal(judge.status,200);assert.equal(globalThis.HotEvaluation.parseReview((await judge.json()).choices[0].message.content).score,80);
  assert.equal(requests[4].temperature,0.1);assert.equal(requests[4].stream,false);assert.equal(requests[4].model,'judge-model');
  await writeFile(join(testRoot,'data/config.json'),JSON.stringify({...globalThis.HotData.defaults,mode:'proxy',baseUrl:`http://127.0.0.1:${upstreamPort}`,model:'stored-model',apiKey:'wrong-key'}));
  const invalidKey=await fetch(testEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'trial-model'})});
  assert.equal(invalidKey.status,401);assert.match((await invalidKey.json()).error,/密钥无效/);
  const recordResult=await fetch(`http://127.0.0.1:${backendPort}/api/records`);
  assert.deepEqual((await recordResult.json()).records,[]);
  console.log('模型接口验证通过：流式与非流式输出、测试连接实际模型名与耗时、密钥不被浏览器覆盖、无效密钥翻译，且没有写入工作台流水');
}finally{
  backend?.kill('SIGTERM');
  if(backend)await Promise.race([once(backend,'exit'),new Promise(resolve=>setTimeout(resolve,1000))]);
  await new Promise(resolve=>upstream.close(resolve));
  await rm(testRoot,{recursive:true,force:true});
}
