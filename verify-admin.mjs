import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

class FakeClassList{
  values=new Set();
  add(value){this.values.add(value)}
  remove(value){this.values.delete(value)}
  toggle(value,on){if(on)this.add(value);else this.remove(value)}
  contains(value){return this.values.has(value)}
}

class FakeElement{
  constructor(){this.dataset={};this.classList=new FakeClassList();this.className='';this.textContent='';this.value='';this.checked=false;this.listeners={}}
  addEventListener(type,listener){this.listeners[type]=listener}
  insertAdjacentHTML(_position,html){this.innerHTML=(this.innerHTML||'')+html}
  setAttribute(name){if(name==='checked')this.checked=true}
}

const elements={
  adminApp:new FakeElement(),adminSourceBadge:new FakeElement(),adminFooterSource:new FakeElement(),
  adminContent:new FakeElement(),adminPrimaryAction:new FakeElement(),adminSaveState:new FakeElement(),
  adminToast:new FakeElement(),adminBaseUrl:new FakeElement(),adminModel:new FakeElement(),
  adminTemperature:new FakeElement(),adminThreshold:new FakeElement(),adminApiKey:new FakeElement(),
  adminProvider:new FakeElement(),adminStream:new FakeElement(),adminTestConnection:new FakeElement(),
  adminExport:new FakeElement(),adminImport:new FakeElement(),adminImportFile:new FakeElement(),
  adminRollback:new FakeElement(),adminImportResult:new FakeElement(),adminActionbar:new FakeElement()
};
elements.adminApp.dataset.page='settings';
const radios=['mock','proxy','direct'].map(value=>Object.assign(new FakeElement(),{value}));
const document={
  addEventListener(){},
  querySelector(selector){
    if(selector==='#adminApp')return elements.adminApp;
    if(selector==='.admin-actionbar')return elements.adminActionbar;
    if(selector==='input[name="adminMode"]:checked')return radios.find(input=>input.checked)||null;
    return selector.startsWith('#')?elements[selector.slice(1)]||null:null;
  },
  querySelectorAll(selector){
    if(selector==='input[name="adminMode"]')return radios;
    return [];
  }
};
const storage=new Map();
const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
const defaults={mode:'mock',provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',temperature:.85,stream:true,autoThreshold:5000000,products:[{id:'p1'}],sources:['baidu']};
const windowListeners={};
const context={globalThis:null,document,window:{addEventListener(type,listener){windowListeners[type]=listener}},location:{protocol:'file:'},localStorage,AbortSignal,setTimeout,clearTimeout,queueMicrotask,URL,console};
context.globalThis=context;
context.HotData={defaults,providerPresets:{deepseek:{name:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}}};
const adminSource=readFileSync(new URL('./src/admin.js',import.meta.url),'utf8');
vm.runInNewContext(adminSource,context);
await new Promise(resolve=>setImmediate(resolve));

assert.equal(elements.adminSourceBadge.textContent,'数据来源：浏览器本机');
assert.equal(elements.adminFooterSource.textContent,'浏览器本机');
assert.match(elements.adminSourceBadge.className,/browser/);
assert.ok(storage.has('hot-workbench-config-v1'));
assert.equal(elements.adminPrimaryAction.textContent,'保存模型与系统配置');
assert.match(elements.adminContent.innerHTML,/导出当前配置/);
assert.doesNotMatch(elements.adminApp.textContent,/后台加载失败/);
elements.adminModel.value='unsaved-model';elements.adminApp.listeners.input();await Promise.resolve();
assert.match(elements.adminSaveState.textContent,/有未保存的修改/);assert.equal(elements.adminActionbar.classList.contains('is-dirty'),true);
let prevented=false;windowListeners.beforeunload({preventDefault(){prevented=true},returnValue:null});assert.equal(prevented,true);
elements.adminModel.value='deepseek-flash';elements.adminApp.listeners.input();await Promise.resolve();
assert.equal(elements.adminActionbar.classList.contains('is-dirty'),false);
assert.match(adminSource,/title\.textContent=row\.title/);
assert.match(adminSource,/detail\.textContent=/);
assert.doesNotMatch(adminSource,/\$\{row\.title\}/);
console.log('后台离线验证通过：本机来源徽章、未保存提示与离开拦截、外部文本安全输出');
