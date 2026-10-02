import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './src/data.js';

const source=fileURLToPath(new URL('.',import.meta.url));
const root=await mkdtemp(join(tmpdir(),'hot-config-test-'));
let service;
try{
  await mkdir(join(root,'src'));await mkdir(join(root,'data'));
  for(const file of ['server.js','src/data.js','src/dedupe.js','src/prompts.js','src/llm.js'])await copyFile(join(source,file),join(root,file));
  const partial={products:globalThis.HotData.defaults.products,promptTemplates:{system:'自定义规范'}};
  const raw=JSON.stringify(partial,null,2);await writeFile(join(root,'data/config.json'),raw);
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  service=spawn(process.execPath,[join(root,'server.js')],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let timer;try{await Promise.race([once(service.stdout,'data'),once(service,'exit').then(()=>{throw new Error('测试服务启动失败')}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('测试服务启动超时')),5000)})])}finally{clearTimeout(timer)}
  const base=`http://127.0.0.1:${port}`;
  const get=async()=>fetch(base+'/api/config').then(response=>response.json());
  const put=async value=>fetch(base+'/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const loaded=await get();assert.equal(loaded.source,'server');assert.equal(loaded.config.model,globalThis.HotData.defaults.model);assert.equal(loaded.config.promptTemplates.system,'自定义规范');assert.equal(loaded.config.promptTemplates.user,globalThis.HotData.defaults.promptTemplates.user);assert.equal(loaded.config.creativeStyles.length,globalThis.HotData.defaults.creativeStyles.length);
  const saved=await put({model:'backup-test'});assert.equal(saved.status,200);assert.equal((await saved.json()).config.model,'backup-test');
  assert.equal(await readFile(join(root,'data/config.json.bak'),'utf8'),raw);
  const before=await readFile(join(root,'data/config.json'),'utf8');
  const rejected=await put({products:[]});assert.equal(rejected.status,400);assert.match((await rejected.json()).error,/商品列表不能为空/);assert.equal(await readFile(join(root,'data/config.json'),'utf8'),before);
  const duplicateProducts=[...globalThis.HotData.defaults.products,globalThis.HotData.defaults.products[0]];
  const duplicate=await put({products:duplicateProducts});assert.equal(duplicate.status,400);assert.match((await duplicate.json()).error,/编号不能重复/);assert.equal(await readFile(join(root,'data/config.json'),'utf8'),before);
  const invalidOriginal=globalThis.HotData.defaults.products.map((product,index)=>index?product:{...product,originalPrice:product.price-1});
  const wrongPrice=await put({products:invalidOriginal});assert.equal(wrongPrice.status,400);assert.match((await wrongPrice.json()).error,/原价必须大于 0 且不低于售价/);assert.equal(await readFile(join(root,'data/config.json'),'utf8'),before);
  const restored=await fetch(base+'/api/config/restore',{method:'POST'});assert.equal(restored.status,200);assert.equal((await restored.json()).config.model,globalThis.HotData.defaults.model);assert.equal((await get()).config.promptTemplates.system,'自定义规范');
  assert.equal(JSON.parse(await readFile(join(root,'data/config.json.bak'),'utf8')).model,'backup-test');
  await writeFile(join(root,'data/config.json.bak'),'{bad-json');const good=await readFile(join(root,'data/config.json'),'utf8');
  const invalidBackup=await fetch(base+'/api/config/restore',{method:'POST'});assert.equal(invalidBackup.status,400);assert.match((await invalidBackup.json()).error,/备份格式无效/);assert.equal(await readFile(join(root,'data/config.json'),'utf8'),good);
  console.log('配置验证通过：缺失区块补齐、保存前备份、空商品库/重复编号/错误原价拒写、回滚和坏备份保护');
}finally{
  service?.kill('SIGTERM');if(service)await Promise.race([once(service,'exit'),new Promise(resolve=>setTimeout(resolve,1000))]);
  await rm(root,{recursive:true,force:true});
}
