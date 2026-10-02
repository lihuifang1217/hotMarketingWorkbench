(()=>{
'use strict';

const {defaults,demoNews,providerPresets,normalizeSourceSettings,normalizeEvaluationSettings}=globalThis.HotData;
const localConfigKey='hot-workbench-config-v1';
const localRecordsKey='hot-workbench-records-v1';
const root=document.querySelector('#adminApp');
const page=root?.dataset.page||'settings';
const sourceLabels={server:'服务端',browser:'浏览器本机',default:'内置默认值'};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const allowedSources=['baidu','weibo','zhihu','ithome'];
const sourceMeta={
  baidu:['百度热搜','公开热榜接口'],
  weibo:['微博热搜','公开热榜接口'],
  zhihu:['知乎热榜','公开热榜接口'],
  ithome:['IT之家 RSS','通用新闻订阅源'],
};
const promptPlaceholders={
  common:[['热点标题','当前热点的完整标题'],['热点摘要','热点来源提供的摘要'],['话题标签','根据热点整理的微博话题标签'],['商品清单','按“单件商品格式”逐件渲染后拼接'],['语调','工作台选择的主打语调'],['创作风格','当前候选版本的风格名称'],['风格要求','当前风格的创作要求']],
  product:[['商品序号','商品在清单中的顺序'],['商品名称','商品名称'],['商品价格','商品价格，不含货币符号'],['商品卖点','商品核心卖点'],['商品分类','商品所属分类'],['商品标签','商品标签，以顿号连接']]
};
let activeTemplateId='promptSystem';
let styleDraft=[],toneDraft=[];
let rssDraft=[];
let dashboardRange='seven';
let trialController=null;
const state={
  config:{...defaults,products:defaults.products.map(item=>({...item})),promptTemplates:{...defaults.promptTemplates},apiKey:''},
  source:'default',server:false,records:[],saving:false,dirty:false,baseline:''
};
const pages={
  settings:{title:'系统配置',description:'管理模型调用、生成参数与自动流水线的基础设置。',sections:[['calling','调用方式'],['model','模型参数'],['automation','自动流水线'],['backup','备份与恢复']]},
  prompts:{title:'提示词模板',description:'由运营维护模型角色、调用素材和单件商品的呈现格式。',sections:[['role','角色与规范'],['assembly','调用素材'],['product-template','单件商品'],['placeholders','占位符'],['preview','实时预览'],['trial','试运行'],['backup','备份与恢复']]},
  styles:{title:'创作风格与语调',description:'维护多版本文案的创作要求，以及工作台可选择的主打语调。',sections:[['creative-styles','创作风格'],['tone-presets','语调预设'],['style-rules','生效规则'],['backup','备份与恢复']]},
  sources:{title:'数据源管理',description:'选择公开热榜与新闻订阅源，配置抓取入口。',sections:[['platforms','平台热榜'],['rss','新闻订阅源'],['source-test','测试全部来源'],['policy','合规与风险'],['backup','备份与恢复']]},
  dashboard:{title:'运营数据看板',description:'用抓取、生成和发布流水复盘运营效率与模型消耗。',sections:[['dashboard-metrics','关键指标'],['dashboard-trend','发布趋势'],['dashboard-distribution','来源与模型'],['dashboard-products','商品排行'],['dashboard-recent','最近动态'],['dashboard-pricing','预估单价'],['backup','备份与恢复']]},
  records:{title:'运行记录',description:'查看抓取、文案生成与模拟发布留下的操作流水。',sections:[['summary','记录概览'],['record-list','流水明细'],['retention','留存说明']]},
  products:{title:'商品库',description:'维护当前商品、卖点与价格；保存后工作台使用同一份配置。',sections:[['summary','商品统计'],['catalog','商品列表'],['transfer','导入与导出'],['backup','备份与恢复']]}
};

function getLocal(key,fallback){try{const value=localStorage.getItem(key);return value?JSON.parse(value):fallback}catch{return fallback}}
function setLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
function api(path,options={}){return fetch(path,{...options,signal:options.signal||AbortSignal.timeout(7000)}).then(async response=>{if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||`HTTP ${response.status}`);return response.json()})}
function toast(message){const el=document.querySelector('#adminToast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2800)}
function formatTime(value){const date=new Date(value);return Number.isNaN(date.getTime())?'时间未知':date.toLocaleString('zh-CN',{hour12:false})}
function currentPage(){return pages[page]||pages.settings}

function seedBrowserConfig(){
  const local=getLocal(localConfigKey,null);
  if(local){state.config={...defaults,...local,...normalizeSourceSettings(local),evaluation:normalizeEvaluationSettings(local.evaluation),tokenPricing:{...defaults.tokenPricing,...local.tokenPricing},products:local.products?.length?local.products:defaults.products,promptTemplates:{...defaults.promptTemplates,...local.promptTemplates}};state.source='browser';return}
  const seeded={...defaults,products:defaults.products.map(item=>({...item})),promptTemplates:{...defaults.promptTemplates},apiKey:''};
  if(setLocal(localConfigKey,seeded)){state.config=seeded;state.source='browser'}
  else{state.config=seeded;state.source='default'}
}

async function loadData(){
  seedBrowserConfig();
  if(location.protocol!=='file:')try{
    const result=await api('/api/config');state.server=true;
    if(result.config){state.config={...defaults,...result.config,...normalizeSourceSettings(result.config),evaluation:normalizeEvaluationSettings(result.config.evaluation),tokenPricing:{...defaults.tokenPricing,...result.config.tokenPricing},products:result.config.products?.length?result.config.products:defaults.products,promptTemplates:{...defaults.promptTemplates,...result.config.promptTemplates},apiKey:state.config.apiKey||''};state.source='server'}
  }catch{}
  if(page==='records'||page==='dashboard')await loadRecords(false);
}

function shell(){
  const meta=currentPage();
  root.innerHTML=`<div class="admin-shell">
    <header class="admin-topbar">
      <a class="admin-brand" href="admin.html"><span class="admin-brand-mark">管</span><span><strong>热点营销后台</strong><small>HOTSPOT ADMIN</small></span></a>
      <div class="admin-top-actions"><span id="adminSourceBadge" class="admin-source-badge"></span><a class="button" href="index.html">← 返回工作台</a></div>
    </header>
    <div class="admin-body">
      <aside class="admin-sidebar">
        <nav aria-label="后台导航">
          <div class="admin-nav-group"><div class="admin-nav-title">本页配置</div>${meta.sections.map(([id,label],index)=>`<a class="admin-nav-anchor ${index===0?'active':''}" href="#${id}"><span>${String(index+1).padStart(2,'0')}</span>${label}</a>`).join('')}</div>
          <div class="admin-nav-group"><div class="admin-nav-title">后台页面</div>
            <a class="admin-page-link ${page==='settings'?'active':''}" href="admin.html">系统配置 <span>›</span></a>
            <a class="admin-page-link ${page==='prompts'?'active':''}" href="admin-prompts.html">提示词模板 <span>›</span></a>
            <a class="admin-page-link ${page==='styles'?'active':''}" href="admin-styles.html">创作风格与语调 <span>›</span></a>
            <a class="admin-page-link ${page==='sources'?'active':''}" href="admin-sources.html">数据源管理 <span>›</span></a>
            <a class="admin-page-link ${page==='dashboard'?'active':''}" href="admin-dashboard.html">运营数据看板 <span>›</span></a>
            <a class="admin-page-link" href="admin-evaluation.html">文案效果评测 <span>›</span></a>
            <a class="admin-page-link ${page==='products'?'active':''}" href="admin-products.html">商品库 <span>›</span></a>
            <a class="admin-page-link ${page==='records'?'active':''}" href="admin-records.html">运行记录 <span>›</span></a>
          </div>
        </nav>
        <div class="admin-side-note"><strong>配置优先级</strong><p>服务端 → 浏览器本机 → 内置默认值</p></div>
      </aside>
      <main class="admin-main">
        <div class="admin-heading"><div class="eyebrow">ADMIN / 后台管理</div><h1>${meta.title}</h1><p>${meta.description}</p></div>
        <div id="adminContent" class="admin-content"></div>
      </main>
    </div>
    <footer class="admin-actionbar"><div><strong id="adminSaveState" role="status">配置已载入</strong><small>当前数据来自 <span id="adminFooterSource"></span></small></div><div class="toolbar"><a class="button" href="index.html">返回工作台</a><button class="button primary" id="adminPrimaryAction"></button></div></footer>
  </div>`;
  updateSourceBadges();
}

function updateSourceBadges(){
  const label=sourceLabels[state.source];
  const badge=document.querySelector('#adminSourceBadge');
  badge.className=`admin-source-badge ${state.source}`;badge.textContent=`数据来源：${label}`;
  document.querySelector('#adminFooterSource').textContent=label;
}

function section(id,title,description,body){return `<section class="admin-section card" id="${id}"><div class="admin-section-head"><h2>${title}</h2><p>${description}</p></div>${body}</section>`}
function field(id,label,hint,type='text'){return `<label class="admin-field"><span>${label}</span><input id="${id}" type="${type}">${hint?`<small>${hint}</small>`:''}</label>`}
function promptEditor(id,label,hint){return `<label class="admin-prompt-field" for="${id}"><span>${label}</span><textarea id="${id}" spellcheck="false"></textarea><small>${hint}</small></label>`}
function placeholderButtons(items,scope){return `<div class="prompt-token-group"><strong>${scope}</strong><div>${items.map(([token,description])=>`<button class="prompt-token" type="button" data-token="${token}"><code>{{${token}}}</code><span>${description}</span></button>`).join('')}</div></div>`}

const resetLabels={calling:'接入方式',model:'模型参数',automation:'自动流水线',role:'角色与规范',assembly:'调用素材', 'product-template':'单件商品', 'creative-styles':'创作风格','tone-presets':'语调预设',platforms:'平台热榜',rss:'新闻订阅源','dashboard-pricing':'预估单价'};
function renderBackupTools(){
  if(page==='records')return;
  const backupNote=page==='products'?'导出的是已保存的整份配置，不含密钥。新增和编辑商品在弹窗内保存；服务端每次写入前都会自动保留上一版。':'导出的是已保存配置，不含任何密钥；浏览器直连密钥继续只保存在本机。分区块“恢复默认”只修改当前页面草稿，点击底部保存后才生效。快捷键：⌘/Ctrl + S。';
  document.querySelector('#adminContent').insertAdjacentHTML('beforeend',section('backup','备份与恢复','导出已保存的整份配置；导入前会校验，服务端保存前自动备份上一版。',`<div class="admin-backup-actions"><button class="button" id="adminExport" type="button">导出当前配置</button><button class="button" id="adminImport" type="button">导入配置文件</button><button class="button" id="adminRollback" type="button" ${state.server?'':'disabled'}>恢复上次服务端版本</button><input id="adminImportFile" type="file" accept=".json,application/json" hidden></div><p class="admin-backup-note">${backupNote}</p><p id="adminImportResult" class="admin-import-result" role="status"></p>`));
  for(const [id,label] of Object.entries(resetLabels)){
    const head=document.querySelector(`#${id} .admin-section-head`);if(!head)continue;
    const button=document.createElement('button');button.className='button small admin-reset';button.type='button';button.dataset.resetSection=id;button.textContent=`恢复默认：${label}`;button.addEventListener('click',()=>resetSection(id));head.append(button);
  }
  document.querySelector('#adminExport').addEventListener('click',()=>exportConfig().catch(error=>toast(`导出失败：${error.message}`)));
  document.querySelector('#adminImport').addEventListener('click',()=>document.querySelector('#adminImportFile').click());
  document.querySelector('#adminImportFile').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';importConfig(file)});
  document.querySelector('#adminRollback').addEventListener('click',rollbackConfig);
}
function pageDraft(){
  if(page==='settings')return {mode:document.querySelector('input[name="adminMode"]:checked')?.value,provider:document.querySelector('#adminProvider').value,baseUrl:document.querySelector('#adminBaseUrl').value,model:document.querySelector('#adminModel').value,temperature:document.querySelector('#adminTemperature').value,stream:document.querySelector('#adminStream').checked,apiKey:document.querySelector('#adminApiKey').value,autoThreshold:document.querySelector('#adminThreshold').value};
  if(page==='prompts')return promptValues();
  if(page==='styles')return {creativeStyles:styleDraft,tonePresets:toneDraft};
  if(page==='sources')return {sources:[...document.querySelectorAll('input[name="adminSource"]:checked')].map(input=>input.value),rssFeeds:rssDraft};
  if(page==='dashboard')return {tokenPricing:pricingDraft()};
  return {};
}
function updateDirty(){
  if(page==='records'||page==='products')return;
  state.dirty=JSON.stringify(pageDraft())!==state.baseline;
  document.querySelector('.admin-actionbar').classList.toggle('is-dirty',state.dirty);
  document.querySelector('#adminSaveState').textContent=state.dirty?'● 有未保存的修改':'配置已保存';
}
function markSaved(){state.baseline=JSON.stringify(pageDraft());state.dirty=false;document.querySelector('.admin-actionbar').classList.remove('is-dirty')}
function resetSection(id){
  if(id==='calling')document.querySelector('input[name="adminMode"][value="mock"]').checked=true;
  else if(id==='model'){document.querySelector('#adminProvider').value=defaults.provider;document.querySelector('#adminBaseUrl').value=defaults.baseUrl;document.querySelector('#adminModel').value=defaults.model;document.querySelector('#adminTemperature').value=defaults.temperature;document.querySelector('#adminStream').checked=defaults.stream;document.querySelector('#adminApiKey').value=''}
  else if(id==='automation')document.querySelector('#adminThreshold').value=defaults.autoThreshold;
  else if(id==='role'||id==='assembly'||id==='product-template'){document.querySelector('#'+({role:'promptSystem',assembly:'promptUser','product-template':'promptProduct'}[id])).value=defaults.promptTemplates[{role:'system',assembly:'user','product-template':'product'}[id]];updatePromptPreview()}
  else if(id==='creative-styles'){styleDraft=defaults.creativeStyles.map(item=>({...item}));renderStyleList()}
  else if(id==='tone-presets'){toneDraft=[...defaults.tonePresets];renderToneList()}
  else if(id==='platforms')document.querySelectorAll('input[name="adminSource"]').forEach(input=>{if(['baidu','weibo','zhihu'].includes(input.value))input.checked=defaults.sources.includes(input.value)});
  else if(id==='rss'){document.querySelector('input[name="adminSource"][value="ithome"]').checked=defaults.sources.includes('ithome');rssDraft=[];renderRssList()}
  else if(id==='dashboard-pricing'){for(const [key,value] of Object.entries(defaults.tokenPricing))document.querySelector(`#price-${key}`).value=value;renderDashboardData()}
  updateDirty();toast(`已恢复${resetLabels[id]}默认值，尚未保存`);
}

function renderSettings(){
  const s=state.config,content=document.querySelector('#adminContent');
  const providers=Object.entries(providerPresets).map(([id,item])=>`<option value="${id}">${item.name}</option>`).join('');
  content.innerHTML=section('calling','接入方式','三种调用方式共用下方模型参数；中转模式使用服务端密钥。',`<div class="admin-choice-grid">
    <label class="admin-choice"><input type="radio" name="adminMode" value="mock"><span><strong>本地模拟</strong><small>无需密钥，离线演示</small></span></label>
    <label class="admin-choice"><input type="radio" name="adminMode" value="proxy"><span><strong>本地服务中转</strong><small>密钥只在服务端配置文件中</small></span></label>
    <label class="admin-choice"><input type="radio" name="adminMode" value="direct"><span><strong>浏览器直连</strong><small>可能受到跨域限制</small></span></label>
  </div>`)+section('model','模型参数','选择服务商会填入接口地址和常用模型名，之后仍可手动修改。',`<div class="admin-form-grid">
    <label class="admin-field"><span>服务商</span><select id="adminProvider">${providers}</select><small>自定义服务商须支持 OpenAI Chat Completions 接口。</small></label>
    ${field('adminBaseUrl','接口基础地址','服务商预设可自动填写；支持手动修改')}
    ${field('adminModel','模型名称','填写服务商提供的模型 ID')}
    ${field('adminTemperature','创作温度','创作类建议 0.7–1.0；分类、抽取类建议 0–0.3','number')}
    <label class="admin-field admin-toggle-field"><span>输出方式</span><span class="admin-checkbox"><input id="adminStream" type="checkbox"> 流式输出</span><small>关闭后等待模型完整返回，工作台仍会逐字展示结果。</small></label>
    <label class="admin-field"><span>浏览器直连密钥</span><input id="adminApiKey" type="password" autocomplete="off" placeholder="仅浏览器直连使用"><small class="admin-key-warning">仅保存在你本机浏览器；正式使用请选服务端中转，并把密钥写在服务端配置文件中。</small></label>
  </div><div class="admin-test-row"><button class="button" id="adminTestConnection" type="button">测试连接</button><span id="adminTestResult" role="status">${s.keyConfigured?'服务端中转密钥已配置':'服务端中转密钥未配置'}</span></div>`)+section('automation','自动流水线','设置热点进入自动文案生成与模拟发送流程的最低热度。',`<div class="admin-form-grid single">${field('adminThreshold','最低新闻热度','只接受非负整数','number')}<div class="admin-readonly"><span>商品库状态</span><strong>${Number(s.products?.length||0)} 件商品可参与匹配</strong><small>商品数据继续复用工作台当前配置。</small></div></div>`);
  const selectedMode=[...document.querySelectorAll('input[name="adminMode"]')].find(input=>input.value===s.mode);
  if(selectedMode)selectedMode.checked=true;
  document.querySelector('#adminProvider').value=s.provider||'deepseek';
  document.querySelector('#adminBaseUrl').value=s.baseUrl||'';
  document.querySelector('#adminModel').value=s.model||'';
  document.querySelector('#adminTemperature').value=Number(s.temperature);
  document.querySelector('#adminTemperature').min='0';document.querySelector('#adminTemperature').max='2';document.querySelector('#adminTemperature').step='0.05';
  document.querySelector('#adminStream').checked=s.stream!==false;
  document.querySelector('#adminThreshold').value=Number(s.autoThreshold);
  document.querySelector('#adminApiKey').value=s.apiKey||'';
  document.querySelector('#adminProvider').addEventListener('change',event=>{const preset=providerPresets[event.target.value];if(preset.baseUrl)document.querySelector('#adminBaseUrl').value=preset.baseUrl;if(preset.model)document.querySelector('#adminModel').value=preset.model;setSaveState('有未保存的修改');document.querySelector('#adminTestResult').textContent='服务商已切换，保存后可测试中转连接。'});
  document.querySelector('#adminTestConnection').addEventListener('click',testSettingsConnection);
  const button=document.querySelector('#adminPrimaryAction');button.textContent='保存模型与系统配置';button.dataset.action='save-settings';
}
async function testSettingsConnection(){
  const button=document.querySelector('#adminTestConnection'),output=document.querySelector('#adminTestResult');
  const mode=document.querySelector('input[name="adminMode"]:checked')?.value,baseUrl=document.querySelector('#adminBaseUrl').value.trim(),model=document.querySelector('#adminModel').value.trim(),apiKey=document.querySelector('#adminApiKey').value.trim();
  if(!baseUrl||!model){output.textContent='请先填写接口地址和模型名称。';return}
  if(mode==='proxy'&&!state.server){output.textContent='本地服务未连接，请启动服务后再测试中转。';return}
  if(mode==='proxy'&&baseUrl!==state.config.baseUrl){output.textContent='中转模式请先保存接口地址，再测试连接。';return}
  button.disabled=true;output.textContent='正在发送最小请求…';
  try{const result=await globalThis.HotLLM.testConnection({mode,baseUrl,model,apiKey});output.textContent=result.simulated?'当前是本地模拟，未连接真实模型；切换到直连或中转后可测试。':`连接成功 · ${result.duration} ms · 实际模型：${result.model}`}
  catch(error){output.textContent=error.message}
  finally{button.disabled=false}
}

function renderSources(){
  const enabled=new Set(state.config.sources||[]),content=document.querySelector('#adminContent');
  rssDraft=(state.config.rssFeeds||[]).map(feed=>({...feed}));
  const cards=['baidu','weibo','zhihu'].map(id=>`<label class="admin-source-option"><input type="checkbox" name="adminSource" value="${id}"><span><strong>${sourceMeta[id][0]}</strong><small>${sourceMeta[id][1]}</small></span></label>`).join('');
  content.innerHTML=section('platforms','平台热榜','按需启停内置平台。每个来源独立抓取，单一来源失败不会中断其它来源。',`<div class="admin-source-grid">${cards}</div>`)+section('rss','新闻订阅源','可添加多个 RSS / Atom 订阅源，名称会显示在工作台新闻卡片上。',`<div class="admin-source-grid rss"><label class="admin-source-option"><input type="checkbox" name="adminSource" value="ithome"><span><strong>IT之家 RSS</strong><small>内置通用新闻订阅源</small></span></label></div><div id="adminRssList" class="admin-rss-list"></div><div class="admin-rss-add"><label class="admin-field"><span>来源名称</span><input id="adminRssName" maxlength="80" placeholder="例如：科技资讯"></label><label class="admin-field"><span>订阅地址</span><input id="adminRssUrl" type="url" placeholder="https://example.com/feed.xml" aria-describedby="adminRssUrlHint"></label><button class="button" id="adminAddRss" type="button">＋ 添加订阅源</button><small id="adminRssUrlHint" class="admin-rss-hint">仅接受 HTTPS 地址，最多添加 30 个。</small></div><p id="adminRssError" class="admin-style-error" role="alert"></p>`)+section('source-test','测试全部来源','测试当前已启用的来源，无需先保存；停用项不会发起请求。',`<div class="admin-test-row"><button class="button" id="adminTestSources" type="button" ${state.server?'':'disabled'}>测试全部来源</button><span id="adminSourceTestSummary" role="status">${state.server?'尚未测试':'需启动本地服务才能抓取'}</span></div><div id="adminSourceTestResults" class="admin-source-test-list"></div>`)+section('policy','合规与风险','公开来源只适合原型验证；热点风险标签用于运营初筛。',`<div class="admin-policy"><div><strong>抓取约定</strong><span>公开热榜接口仅适合原型演示。正式上线应改用官方开放平台或商业舆情服务，遵守对方的爬虫协议与服务条款。</span></div><div><strong>禁止借势</strong><span>灾难、事故、疫情、战争、犯罪等热点会标红并禁止选中。</span></div><div><strong>需人工判断</strong><span>时政、财经和有争议的社会事件会标黄，必须人工判断是否适合营销。</span></div></div><p class="admin-backup-note">每源 7 秒超时；工作台使用 2 分钟缓存。全部来源失败时会明确回退演示数据。</p>`);
  document.querySelectorAll('input[name="adminSource"]').forEach(input=>{input.checked=enabled.has(input.value)});
  renderRssList();
  document.querySelector('#adminAddRss').addEventListener('click',addRssFeed);
  document.querySelector('#adminTestSources').addEventListener('click',testAllSources);
  const button=document.querySelector('#adminPrimaryAction');button.textContent='保存数据源';button.dataset.action='save-sources';
}

function renderRssList(){
  const list=document.querySelector('#adminRssList');if(!list)return;
  list.innerHTML=rssDraft.length?rssDraft.map(feed=>`<div class="admin-rss-row"><label class="admin-source-option"><input type="checkbox" data-rss-toggle="${esc(feed.id)}" ${feed.enabled?'checked':''}><span><strong>${esc(feed.name)}</strong><small>${esc(feed.url)}</small></span></label><button class="button small" type="button" data-rss-delete="${esc(feed.id)}" aria-label="删除 ${esc(feed.name)}">删除</button></div>`).join(''):'<div class="info-box">尚未添加自定义订阅源。</div>';
  list.querySelectorAll('[data-rss-toggle]').forEach(input=>input.addEventListener('change',()=>{const feed=rssDraft.find(item=>item.id===input.dataset.rssToggle);if(feed)feed.enabled=input.checked;updateDirty()}));
  list.querySelectorAll('[data-rss-delete]').forEach(button=>button.addEventListener('click',()=>{rssDraft=rssDraft.filter(item=>item.id!==button.dataset.rssDelete);renderRssList();updateDirty();toast('已从草稿移除，保存后生效')}));
}
function validRssUrl(raw){
  let url;try{url=new URL(raw)}catch{throw new Error('订阅地址格式不正确，请填写完整 HTTPS 地址')}
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname||url.hash)throw new Error('订阅地址须为无账号信息的 HTTPS 地址，且不含 # 片段');
  return url.href;
}
function addRssFeed(){
  const name=document.querySelector('#adminRssName').value.trim(),raw=document.querySelector('#adminRssUrl').value.trim(),output=document.querySelector('#adminRssError');output.textContent='';
  try{
    if(!name||name.length>80)throw new Error('来源名称须为 1 到 80 字');
    if(rssDraft.length>=30)throw new Error('最多添加 30 个订阅源');
    const url=validRssUrl(raw);
    if(rssDraft.some(feed=>feed.url===url))throw new Error('这个订阅地址已经添加');
    rssDraft.push({id:`rss-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name,url,enabled:true});
    document.querySelector('#adminRssName').value='';document.querySelector('#adminRssUrl').value='';renderRssList();updateDirty();toast('已加入草稿，保存后工作台可使用');
  }catch(error){output.textContent=error.message}
}
async function testAllSources(){
  const button=document.querySelector('#adminTestSources'),summary=document.querySelector('#adminSourceTestSummary'),list=document.querySelector('#adminSourceTestResults');
  const sources=[...document.querySelectorAll('input[name="adminSource"]:checked')].map(input=>input.value),rssFeeds=rssDraft.map(feed=>({...feed}));
  try{if(!sources.length&&!rssFeeds.some(feed=>feed.enabled))throw new Error('请先启用至少一个来源');rssFeeds.forEach(feed=>validRssUrl(feed.url))}
  catch(error){summary.textContent=error.message;return}
  button.disabled=true;summary.textContent='正在逐源抓取，最长约 7 秒…';list.replaceChildren();
  try{
    const result=await api('/api/sources/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources,rssFeeds}),signal:AbortSignal.timeout(11000)});
    const outcomes=result.sources||[],success=outcomes.filter(item=>item.status==='success').length;
    summary.textContent=`测试完成：${success} 个成功，${outcomes.length-success} 个失败`;
    const byId=new Map(outcomes.map(item=>[item.id,item]));
    const all=[...Object.entries(sourceMeta).map(([id,meta])=>({id,name:meta[0],enabled:sources.includes(id)})),...rssFeeds.map(feed=>({id:feed.id,name:feed.name,enabled:feed.enabled}))];
    list.innerHTML=all.map(item=>{const result=byId.get(item.id);return `<div class="admin-source-result"><div><strong>${esc(item.name)}</strong><small>${result?`${result.status==='success'?`抓取 ${Number(result.count)} 条`:`${esc(result.error||'抓取失败')}`} · ${Number(result.duration)} ms`:'未启用，本轮未请求'}</small></div><span class="badge ${!result?'':result.status==='success'?'good':'danger'}">${!result?'已停用':result.status==='success'?'成功':'失败'}</span></div>`}).join('');
  }catch(error){summary.textContent=`测试失败：${error.message}`}
  finally{button.disabled=false}
}

function renderStyles(){
  styleDraft=(Array.isArray(state.config.creativeStyles)&&state.config.creativeStyles.length?state.config.creativeStyles:defaults.creativeStyles).map(item=>({...item}));
  toneDraft=[...(Array.isArray(state.config.tonePresets)&&state.config.tonePresets.length?state.config.tonePresets:defaults.tonePresets)];
  document.querySelector('#adminContent').innerHTML=section('creative-styles','创作风格','每个风格独立调用一次模型，按这里的顺序展示候选文案。',`<div id="styleList" class="admin-style-list"></div><button class="button" id="addStyle" type="button">＋ 增加创作风格</button><p id="styleError" class="admin-style-error" role="alert"></p>`)+section('tone-presets','语调预设','工作台选择的主打语调会写入每个候选版本的模型素材。',`<div id="toneList" class="admin-tone-list"></div><div class="admin-tone-add"><input id="newTone" maxlength="40" placeholder="输入新语调名称"><button class="button" id="addTone" type="button">＋ 增加语调</button></div><p id="toneError" class="admin-style-error" role="alert"></p>`)+section('style-rules','生效规则','保存后返回工作台，生成文案会逐个运行所有风格。',`<div class="admin-policy"><div><strong>多版本生成</strong><span>每个创作风格分别生成一个候选版本，可切换、编辑和审核。</span></div><div><strong>至少保留一项</strong><span>最后一个创作风格和最后一个语调不可删除。</span></div><div><strong>风险与事实</strong><span>风格要求不应覆盖已有的借势风险和事实约束。</span></div></div>`);
  const button=document.querySelector('#adminPrimaryAction');button.textContent='保存风格与语调';button.dataset.action='save-styles';
  renderStyleList();renderToneList();
  document.querySelector('#addStyle').addEventListener('click',()=>{if(styleDraft.length>=12){showStyleError('最多保留 12 个创作风格。');return}styleDraft.push({id:`style-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:'',instruction:''});renderStyleList();document.querySelector('#styleList .admin-style-card:last-child input').focus();setSaveState('有未保存的修改')});
  document.querySelector('#addTone').addEventListener('click',addTone);
  document.querySelector('#newTone').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addTone()}});
}
function showStyleError(message){document.querySelector('#styleError').textContent=message;toast(message)}
function renderStyleList(){
  const list=document.querySelector('#styleList');list.replaceChildren();
  styleDraft.forEach((style,index)=>{
    const card=document.createElement('article');card.className='admin-style-card';
    const head=document.createElement('div');head.className='admin-style-head';
    const number=document.createElement('span');number.className='admin-style-number';number.textContent=String(index+1).padStart(2,'0');
    const label=document.createElement('strong');label.textContent=style.name||'新创作风格';
    const actions=document.createElement('div');actions.className='admin-style-actions';
    [['↑','上移',index>0,()=>moveStyle(index,-1)],['↓','下移',index<styleDraft.length-1,()=>moveStyle(index,1)],['删除','删除风格',true,()=>deleteStyle(index)]].forEach(([textValue,title,enabled,action])=>{const button=document.createElement('button');button.type='button';button.className='button small';button.textContent=textValue;button.title=title;button.disabled=!enabled;button.addEventListener('click',action);actions.append(button)});
    head.append(number,label,actions);
    const nameField=document.createElement('label');nameField.className='admin-field';nameField.textContent='风格名称';const name=document.createElement('input');name.maxLength=40;name.value=style.name;name.placeholder='例如：热点借势';name.addEventListener('input',()=>{style.name=name.value;label.textContent=name.value||'新创作风格';setSaveState('有未保存的修改')});nameField.append(name);
    const instructionField=document.createElement('label');instructionField.className='admin-field';instructionField.textContent='创作要求';const instruction=document.createElement('textarea');instruction.maxLength=1000;instruction.value=style.instruction;instruction.placeholder='描述这个版本如何承接热点、呈现商品和引导互动';instruction.addEventListener('input',()=>{style.instruction=instruction.value;setSaveState('有未保存的修改')});instructionField.append(instruction);
    card.append(head,nameField,instructionField);list.append(card);
  });
}
function moveStyle(index,direction){const target=index+direction;[styleDraft[index],styleDraft[target]]=[styleDraft[target],styleDraft[index]];renderStyleList();setSaveState('有未保存的修改')}
function deleteStyle(index){if(styleDraft.length===1){showStyleError('至少保留一个创作风格，不能删除最后一项。');return}styleDraft.splice(index,1);document.querySelector('#styleError').textContent='';renderStyleList();setSaveState('有未保存的修改')}
function renderToneList(){const list=document.querySelector('#toneList');list.replaceChildren();toneDraft.forEach((tone,index)=>{const item=document.createElement('div');item.className='admin-tone-item';const name=document.createElement('span');name.textContent=tone;const button=document.createElement('button');button.className='admin-tone-remove';button.type='button';button.textContent='×';button.setAttribute('aria-label',`删除语调 ${tone}`);button.addEventListener('click',()=>{if(toneDraft.length===1){document.querySelector('#toneError').textContent='至少保留一个主打语调。';toast('至少保留一个主打语调。');return}toneDraft.splice(index,1);renderToneList();setSaveState('有未保存的修改')});item.append(name,button);list.append(item)})}
function addTone(){const input=document.querySelector('#newTone'),value=input.value.trim(),error=document.querySelector('#toneError');if(!value){error.textContent='请先输入语调名称。';return}if(toneDraft.includes(value)){error.textContent='这个语调已存在。';return}if(toneDraft.length>=30){error.textContent='最多保留 30 个语调。';return}toneDraft.push(value);input.value='';error.textContent='';renderToneList();setSaveState('有未保存的修改')}

function promptValues(){return {system:document.querySelector('#promptSystem').value,user:document.querySelector('#promptUser').value,product:document.querySelector('#promptProduct').value}}
function sampleMaterial(){
  const index=Number(document.querySelector('#promptSample').value);
  const news=demoNews[index]||demoNews[0];
  const catalog=state.config.products?.length?state.config.products:defaults.products;
  const matched=globalThis.HotMatching.matchProducts({...news,risk:{level:'safe'}},catalog).slice(0,2).map(row=>row.product);
  const styles=state.config.creativeStyles||defaults.creativeStyles;
  return {news:{...news,keywords:globalThis.HotMatching.newsKeywords(news)},products:matched.length?matched:catalog.slice(0,2),variant:document.querySelector('#promptVariant').value,creativeStyle:styles.find(style=>style.id===document.querySelector('#promptStyle').value)||styles[0]};
}
function updatePromptPreview(){
  const preview=document.querySelector('#promptPreview');if(!preview)return;
  const {news,products,variant,creativeStyle}=sampleMaterial();
  const result=globalThis.HotPrompts.buildPromptContext(news,products,variant,promptValues(),creativeStyle);
  document.querySelector('#previewSystem').textContent=result.system;
  document.querySelector('#previewUser').textContent=result.user;
  document.querySelector('#previewSystemCount').textContent=`${Array.from(result.system).length} 字`;
  document.querySelector('#previewUserCount').textContent=`${Array.from(result.user).length} 字`;
  document.querySelector('#previewSampleProducts').textContent=`匹配商品：${products.map(product=>product.name).join('、')}`;
  const trialStatus=document.querySelector('#trialStatus');
  if(trialStatus?.dataset.completed==='true')trialStatus.textContent='预览内容已改变；再次试运行可查看新效果。';
}
function insertPlaceholder(token){
  const editor=document.querySelector(`#${activeTemplateId}`)||document.querySelector('#promptSystem');
  const value=`{{${token}}}`,start=editor.selectionStart??editor.value.length,end=editor.selectionEnd??start;
  editor.focus();editor.setRangeText(value,start,end,'end');setSaveState('有未保存的修改');updatePromptPreview();
}
function renderPrompts(){
  const templates={...defaults.promptTemplates,...state.config.promptTemplates},content=document.querySelector('#adminContent');
  content.innerHTML=section('role','角色设定与写作规范','作为 system 消息发送给模型，用于约束角色、事实边界、文风和输出格式。',promptEditor('promptSystem','角色设定与写作规范','建议保留风险边界、只输出正文和字数限制。')+'<div class="toolbar" style="margin-top:12px"><button class="button" type="button" id="useOptimizedPrompt">应用强化规范与合规范例</button><a class="button" href="admin-evaluation.html">前往效果评测 →</a></div>')+
    section('assembly','调用素材模板','作为 user 消息发送给模型，运行时会填入热点、语调和已经渲染好的商品清单。',promptEditor('promptUser','每次调用时拼装素材的模板','“商品清单”是嵌套占位符，会先逐件套用下方格式。'))+
    section('product-template','单件商品呈现格式','每件已选商品先按此格式渲染，再用换行拼成“商品清单”。',promptEditor('promptProduct','单件商品格式','可自由换行；未知占位符会原样保留。'))+
    section('placeholders','占位符清单','先点击任意编辑框确定插入位置，再点击占位符。',`<div class="prompt-token-catalog">${placeholderButtons(promptPlaceholders.common,'调用素材占位符')}${placeholderButtons(promptPlaceholders.product,'单件商品占位符')}</div><div class="info-box">使用双花括号，例如 <code>{{热点标题}}</code>。未识别的占位符不会被清空，会在预览和实际模型消息中原样保留。</div>`)+
    section('preview','实时预览','选择示例热点、主打语调和创作风格，查看该候选版本发给模型的完整消息。',`<div class="prompt-sample-controls"><label class="admin-field"><span>示例热点</span><select id="promptSample"></select></label><label class="admin-field"><span>主打语调</span><select id="promptVariant"></select></label><label class="admin-field"><span>创作风格</span><select id="promptStyle"></select></label></div><p id="previewSampleProducts" class="prompt-sample-products"></p><div id="promptPreview" class="prompt-preview"><article><div class="prompt-preview-head"><span>System / 给模型的规范说明</span><strong id="previewSystemCount">0 字</strong></div><pre id="previewSystem"></pre></article><article><div class="prompt-preview-head"><span>User / 拼装好的素材</span><strong id="previewUserCount">0 字</strong></div><pre id="previewUser"></pre></article></div>`)+
    section('trial','试运行','用当前编辑框里的模板发起一次独立生成。结果仅供调试，不写入工作台。',`<div class="prompt-trial-controls"><label class="admin-field"><span>接入方式</span><select id="trialMode"><option value="mock">本地模拟</option><option value="proxy">本地服务中转</option><option value="direct">浏览器直连</option></select></label><label class="admin-field"><span>本次模型名称</span><input id="trialModel" type="text" maxlength="120"></label></div><div class="prompt-trial-actions"><button class="button primary" id="trialRun" type="button">试运行一次</button><button class="button" id="trialStop" type="button" hidden>停止试运行</button><span id="trialStatus" role="status">使用上方示例素材和当前模板。</span></div><p id="trialNotice" class="prompt-trial-notice"></p><div id="trialResult" class="prompt-trial-result" hidden><div class="prompt-trial-meta"><span>接入方式：<strong id="trialUsedMode"></strong></span><span>模型：<strong id="trialUsedModel"></strong></span><span>耗时：<strong id="trialDuration"></strong></span><span>消耗量：<strong id="trialUsage"></strong></span></div><pre id="trialOutput"></pre></div>`);
  document.querySelector('#promptSystem').value=templates.system;
  document.querySelector('#promptUser').value=templates.user;
  document.querySelector('#promptProduct').value=templates.product;
  const sampleSelect=document.querySelector('#promptSample');
  demoNews.slice(0,5).forEach((news,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=news.title;sampleSelect.append(option)});
  const variantSelect=document.querySelector('#promptVariant');variantSelect.replaceChildren();
  (state.config.tonePresets||defaults.tonePresets).forEach(tone=>{const option=document.createElement('option');option.value=tone;option.textContent=tone;variantSelect.append(option)});
  const styleSelect=document.querySelector('#promptStyle');
  (state.config.creativeStyles||defaults.creativeStyles).forEach(style=>{const option=document.createElement('option');option.value=style.id;option.textContent=style.name;styleSelect.append(option)});
  document.querySelector('#trialMode').value=state.config.mode;
  document.querySelector('#trialModel').value=state.config.model||'';
  updateTrialNotice();
  document.querySelector('#promptSample').addEventListener('change',updatePromptPreview);
  document.querySelector('#promptVariant').addEventListener('change',updatePromptPreview);
  document.querySelector('#promptStyle').addEventListener('change',updatePromptPreview);
  document.querySelector('#trialMode').addEventListener('change',updateTrialNotice);
  document.querySelector('#trialRun').addEventListener('click',runPromptTrial);
  document.querySelector('#trialStop').addEventListener('click',()=>trialController?.abort());
  document.querySelector('#useOptimizedPrompt').addEventListener('click',()=>{document.querySelector('#promptSystem').value=defaults.promptTemplates.system;updatePromptPreview();updateDirty();toast('已填入强化规范；保存后可用同一批用例复测')});
  document.querySelectorAll('.admin-prompt-field textarea').forEach(editor=>{
    editor.addEventListener('focus',()=>{activeTemplateId=editor.id;document.querySelectorAll('.admin-prompt-field').forEach(field=>field.classList.toggle('active',field.contains(editor)))});
    editor.addEventListener('click',()=>{activeTemplateId=editor.id});
    editor.addEventListener('input',updatePromptPreview);
  });
  document.querySelectorAll('.prompt-token').forEach(button=>button.addEventListener('click',()=>insertPlaceholder(button.dataset.token)));
  updatePromptPreview();
  const button=document.querySelector('#adminPrimaryAction');button.textContent='保存提示词模板';button.dataset.action='save-prompts';
}

function trialModeLabel(mode){return {mock:'本地模拟',proxy:'本地服务中转',direct:'浏览器直连'}[mode]||'未知方式'}
function updateTrialNotice(){
  const mode=document.querySelector('#trialMode').value;
  document.querySelector('#trialNotice').textContent=mode==='mock'?'现在是模拟输出，不代表真实模型效果。':mode==='proxy'?'将通过本地服务使用服务端密钥；本次模型名仅用于试运行。':'将从当前浏览器直接连接模型服务商；需要已保存的浏览器直连密钥。';
}
function formatTrialUsage(usage){
  if(!usage)return '服务商未返回';
  const parts=[];
  if(usage.prompt_tokens!=null&&Number.isFinite(Number(usage.prompt_tokens)))parts.push(`输入 ${usage.prompt_tokens}`);
  if(usage.completion_tokens!=null&&Number.isFinite(Number(usage.completion_tokens)))parts.push(`输出 ${usage.completion_tokens}`);
  if(usage.total_tokens!=null&&Number.isFinite(Number(usage.total_tokens)))parts.push(`合计 ${usage.total_tokens} tokens`);
  return parts.join(' · ')||'服务商未返回';
}
async function runPromptTrial(){
  if(trialController)return;
  const {news,products,variant,creativeStyle}=sampleMaterial();
  const mode=document.querySelector('#trialMode').value,model=document.querySelector('#trialModel').value.trim();
  const status=document.querySelector('#trialStatus'),resultBox=document.querySelector('#trialResult');
  const output=document.querySelector('#trialOutput');
  resultBox.hidden=false;output.textContent='';
  document.querySelector('#trialUsedMode').textContent=trialModeLabel(mode);
  document.querySelector('#trialUsedModel').textContent=mode==='mock'?'本地模拟引擎':model||'未填写';
  document.querySelector('#trialDuration').textContent='计算中';
  document.querySelector('#trialUsage').textContent='计算中';
  status.dataset.completed='false';
  if(!products.length){status.textContent='示例素材没有可用商品，请先检查商品库。';return}
  if(mode!=='mock'&&!model){status.textContent='请填写本次试运行的模型名称。';return}
  if(mode==='proxy'&&!state.server){status.textContent='本地服务未启动，请先启动服务或切换到本地模拟。';return}
  if(mode==='proxy'&&!state.config.keyConfigured){status.textContent='服务端尚未配置模型密钥，请先在服务端配置密钥。';return}
  if(mode==='direct'&&!state.config.apiKey){status.textContent='浏览器直连密钥未配置，请先在系统配置页保存密钥。';return}
  trialController=new AbortController();
  const runButton=document.querySelector('#trialRun'),stopButton=document.querySelector('#trialStop');
  runButton.disabled=true;stopButton.hidden=false;status.textContent='正在试运行，文案将逐字显示…';
  try{
    const settings={...state.config,mode,model,variant,creativeStyle,promptTemplates:promptValues(),proxyEndpoint:'/api/chat/preview'};
    const run=await globalThis.HotLLM.generate({news,products,settings,onToken:part=>{output.textContent+=part},signal:trialController.signal});
    document.querySelector('#trialDuration').textContent=`${run.duration} ms`;
    document.querySelector('#trialUsage').textContent=formatTrialUsage(run.usage);
    status.textContent=mode==='mock'?'试运行完成：这是模拟输出，不代表真实模型效果。':'试运行完成；结果仅保留在本页。';
    status.dataset.completed='true';
  }catch(error){
    const readable=/^(密钥无效|账户余额不足|模型名不存在|请求过于频繁|无法连接模型服务商|生成失败|模型没有返回|服务未返回)/.test(error.message||'');
    status.textContent=error.name==='AbortError'?'试运行已停止。':readable?error.message:globalThis.HotLLM.friendlyError(0,error.message);
    document.querySelector('#trialDuration').textContent='未完成';
    document.querySelector('#trialUsage').textContent='未返回';
  }finally{trialController=null;runButton.disabled=false;stopButton.hidden=true}
}

const catalogPageSizes=[5,10,20,50,100];
let catalogPage=1;
let catalogPageSize=Number(getLocal('hot-catalog-page-size',10));
if(!catalogPageSizes.includes(catalogPageSize))catalogPageSize=10;
let catalogFilters={query:'',category:'',sort:'category'};
let catalogSelected=new Set(),catalogFeedback=null;
let catalogReferenceSnapshot={news:globalThis.HotData.normalizeNews(demoNews),source:'内置演示热点'};
let catalogReferencePending=null,catalogReferencesLoaded=false;
let productDraft=null,productBaseline='',productEditingId=null,productTouched=new Set(),productSubmitAttempted=false;
function catalogFeedbackHtml(){
  if(!catalogFeedback)return '';
  const esc=globalThis.HotCatalog.escapeHtml;
  const reasons=catalogFeedback.skipped.map(item=>`${esc(item.id)}：${esc(item.reason)}`).join('；');
  return `<div class="catalog-feedback" role="status"><strong>${esc(catalogFeedback.action)}：成功 ${catalogFeedback.success} 条，跳过 ${catalogFeedback.skipped.length} 条</strong>${reasons?`<span>跳过原因：${reasons}</span>`:''}</div>`;
}
function renderProducts(){
  const catalog=globalThis.HotCatalog,products=Array.isArray(state.config.products)?state.config.products:[];
  catalogSelected=new Set([...catalogSelected].filter(id=>products.some(product=>String(product.id)===id)));
  const stats=catalog.summary(products),categories=[...new Set(products.map(product=>String(product.category||'未分类')))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const priceRange=stats.min===null?'—':`¥${catalog.money(stats.min)} – ¥${catalog.money(stats.max)}`;
  const discount=stats.averageDiscount===null?'—':`${(stats.averageDiscount*100).toFixed(1)}%`;
  const categoryOptions=categories.map(category=>`<option value="${catalog.escapeHtml(category)}">${catalog.escapeHtml(category)}</option>`).join('');
  document.querySelector('#adminContent').innerHTML=section('summary','商品统计','统计基于当前来源的完整商品库，搜索与筛选不会改变这些总览数字。',`<div class="admin-stat-grid catalog-stats"><div><span>商品总数</span><strong>${stats.total} 件</strong></div><div><span>品类数</span><strong>${stats.categories} 类</strong></div><div><span>价格区间</span><strong>${priceRange}</strong></div><div><span>平均折扣率</span><strong>${discount}</strong><small>按有划线价的 ${stats.discountCount} 件商品计算</small></div></div>`)+section('catalog','商品列表','搜索名称与卖点，按品类筛选和排序；表格支持分页，可跨页选择后批量修改品类或删除。',`<div class="catalog-controls"><label class="admin-field catalog-search"><span>搜索商品</span><input id="catalogSearch" type="search" placeholder="输入名称或卖点"></label><label class="admin-field"><span>品类</span><select id="catalogCategory"><option value="">全部品类</option>${categoryOptions}</select></label><label class="admin-field"><span>排序</span><select id="catalogSort"><option value="category">品类 A → Z</option><option value="category-desc">品类 Z → A</option><option value="price-asc">价格从低到高</option><option value="price-desc">价格从高到低</option></select></label></div><div class="catalog-viewbar"><span id="catalogCount" role="status"></span><button id="refreshProductList" type="button" class="button small">↻ 刷新</button></div><div class="catalog-bulkbar"><label class="catalog-check"><input id="catalogSelectAll" type="checkbox"> 选择本页</label><strong id="catalogSelectedCount">已选 0 件</strong><label class="catalog-bulk-category"><span id="catalogBulkCategoryHint">批量修改品类：先勾选商品，再选择或输入目标品类，点击「修改品类」保存。</span><input id="catalogBulkCategory" aria-label="批量修改的目标品类" aria-describedby="catalogBulkCategoryHint" list="catalogCategoryChoices" maxlength="40" placeholder="选择已有品类或输入新品类"><datalist id="catalogCategoryChoices">${categories.map(category=>`<option value="${catalog.escapeHtml(category)}"></option>`).join('')}</datalist></label><button id="catalogApplyCategory" type="button" class="button small" disabled>修改品类</button><button id="catalogDelete" type="button" class="button small catalog-danger" disabled>删除所选</button></div><div id="catalogBatchFeedback">${catalogFeedbackHtml()}</div><p id="catalogReferenceStatus" class="catalog-reference-note" role="status"></p><div id="catalogResults"></div><div id="catalogPagination" class="catalog-pagination" aria-label="商品列表分页"></div>`)+section('transfer','商品导入与导出','JSON 适合备份迁移；CSV 使用中文表头，方便用表格软件批量编辑。导入会先完整校验，再由你确认替换。',`<div class="catalog-transfer-actions"><button id="catalogExportJson" type="button" class="button">导出 JSON</button><button id="catalogExportCsv" type="button" class="button">导出 CSV 表格</button><button id="catalogImport" type="button" class="button primary">导入商品文件</button><input id="catalogImportFile" type="file" accept=".json,.csv,application/json,text/csv" hidden></div><p class="catalog-transfer-note">CSV 必填列：名称、售价、原价、品类、卖点、图标。卖点以顿号分隔；其余中文列保留编号、图片、配色等信息以支持原样回导。导入会替换整份商品库，不会只保存部分有效行。</p>`);
  const button=document.querySelector('#adminPrimaryAction');button.textContent='＋ 新增商品';button.dataset.action='open-product';
  for(const id of ['catalogSearch','catalogCategory','catalogSort']){
    const input=document.querySelector('#'+id),key={catalogSearch:'query',catalogCategory:'category',catalogSort:'sort'}[id];
    input.value=catalogFilters[key];
    input.addEventListener(id==='catalogSearch'?'input':'change',()=>{catalogFilters[key]=input.value;catalogPage=1;renderProductResults()});
  }
  document.querySelector('#catalogPagination').addEventListener('click',event=>{
    const button=event.target.closest('[data-catalog-page]');
    if(!button||button.disabled)return;
    catalogPage=Number(button.dataset.catalogPage);renderProductResults();
  });
  document.querySelector('#catalogPagination').addEventListener('change',event=>{
    if(event.target.id!=='catalogPageSize')return;
    const size=Number(event.target.value);if(!catalogPageSizes.includes(size))return;
    catalogPageSize=size;catalogPage=1;setLocal('hot-catalog-page-size',size);renderProductResults();
  });
  document.querySelector('#refreshProductList').addEventListener('click',()=>refreshProducts().catch(error=>toast(`刷新失败：${error.message}`)));
  document.querySelector('#catalogResults').addEventListener('click',event=>{
    const edit=event.target.closest('[data-edit-product]'),copy=event.target.closest('[data-copy-product]'),remove=event.target.closest('[data-delete-product]');
    if(edit)openProductEditor(edit.dataset.editProduct);
    else if(copy)openProductEditor(null,copy.dataset.copyProduct);
    else if(remove)openCatalogDeleteConfirmation(new Set([remove.dataset.deleteProduct]),remove);
  });
  document.querySelector('#catalogResults').addEventListener('change',event=>{
    const checkbox=event.target.closest('[data-select-product]');if(!checkbox)return;
    if(checkbox.checked)catalogSelected.add(checkbox.dataset.selectProduct);else catalogSelected.delete(checkbox.dataset.selectProduct);
    renderProductResults();
  });
  document.querySelector('#catalogSelectAll').addEventListener('change',event=>{
    const visible=catalogCurrentPage().items;
    for(const product of visible){if(event.target.checked)catalogSelected.add(String(product.id));else catalogSelected.delete(String(product.id))}
    renderProductResults();
  });
  document.querySelector('#catalogApplyCategory').addEventListener('click',()=>applyCatalogBulkCategory());
  document.querySelector('#catalogDelete').addEventListener('click',()=>openCatalogDeleteConfirmation());
  document.querySelector('#catalogExportJson').addEventListener('click',()=>downloadProductCatalog('json'));
  document.querySelector('#catalogExportCsv').addEventListener('click',()=>downloadProductCatalog('csv'));
  document.querySelector('#catalogImport').addEventListener('click',()=>document.querySelector('#catalogImportFile').click());
  document.querySelector('#catalogImportFile').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)previewProductImport(file)});
  renderProductResults();
  ensureCatalogReferences();
}
function catalogVisibleProducts(){
  return globalThis.HotCatalog.filterSort(state.config.products||[],catalogFilters);
}
function catalogCurrentPage(){
  return globalThis.HotCatalog.paginate(catalogVisibleProducts(),{page:catalogPage,pageSize:catalogPageSize});
}
function renderCatalogPagination(result){
  const pageButton=(number,label,disabled=false)=>`<button type="button" class="button small ${number===result.page&&/^\d+$/.test(label)?'soft':''}" data-catalog-page="${number}" ${disabled?'disabled':''} ${number===result.page&&/^\d+$/.test(label)?'aria-current="page"':''}>${label}</button>`;
  const pages=[...new Set([1,result.pages,...Array.from({length:5},(_,index)=>result.page+index-2)])].filter(number=>number>=1&&number<=result.pages).sort((a,b)=>a-b);
  const numbers=pages.map((number,index)=>`${index&&number-pages[index-1]>1?'<span class="catalog-page-gap">…</span>':''}${pageButton(number,String(number))}`).join('');
  document.querySelector('#catalogPagination').innerHTML=`<label class="catalog-page-size">每页显示 <select id="catalogPageSize" aria-label="每页显示条数">${catalogPageSizes.map(size=>`<option value="${size}" ${size===catalogPageSize?'selected':''}>${size} 条</option>`).join('')}</select></label><nav class="catalog-page-nav" aria-label="翻页">${pageButton(result.page-1,'上一页',result.page===1||!result.total)}${numbers}${pageButton(result.page+1,'下一页',result.page===result.pages||!result.total)}<span class="catalog-page-summary">第 ${result.page} / ${result.pages} 页</span></nav>`;
}
function updateCatalogSelectionUi(filtered){
  const all=document.querySelector('#catalogSelectAll');
  const selected=filtered.filter(product=>catalogSelected.has(String(product.id))).length;
  all.checked=Boolean(filtered.length&&selected===filtered.length);all.indeterminate=Boolean(selected&&selected<filtered.length);
  document.querySelector('#catalogSelectedCount').textContent=`已选 ${catalogSelected.size} 件`;
  for(const id of ['catalogApplyCategory','catalogDelete'])document.querySelector('#'+id).disabled=!catalogSelected.size;
}
function renderProductResults(){
  const catalog=globalThis.HotCatalog,products=Array.isArray(state.config.products)?state.config.products:[],filtered=catalogVisibleProducts();
  const references=catalog.recommendationReferences(catalogReferenceSnapshot.news,products,globalThis.HotMatching.matchProducts);
  document.querySelector('#catalogReferenceStatus').textContent=`热点引用范围：${catalogReferenceSnapshot.source}，共 ${catalogReferenceSnapshot.news.length} 条热点${catalogReferencePending?' · 正在更新…':''}。引用数按当前推荐算法计算。`;
  const result=catalog.paginate(filtered,{page:catalogPage,pageSize:catalogPageSize});
  catalogPage=result.page;
  document.querySelector('#catalogCount').textContent=`共 ${products.length} 件，符合条件 ${result.total} 件 · 当前显示 ${result.start}–${result.end} 件`;
  updateCatalogSelectionUi(result.items);
  renderCatalogPagination(result);
  const output=document.querySelector('#catalogResults');
  if(!filtered.length){output.innerHTML='<div class="admin-record-empty">没有符合条件的商品，请调整搜索词或品类。</div>';return}
  output.innerHTML=`<div class="catalog-table-scroll"><table class="catalog-table" aria-label="商品列表"><thead><tr><th>选择</th><th>商品</th><th>品类</th><th>卖点 / 标签</th><th>售价</th><th>划线价</th><th>折扣率</th><th>热点引用</th><th>操作</th></tr></thead><tbody>${result.items.map(product=>{
    const price=Number(product.price),original=catalog.originalPrice(product),rate=original?`${((original-price)/original*100).toFixed(1)}%`:'—';
    const titles=references.get(String(product.id))||[];
    return `<tr class="${catalogSelected.has(String(product.id))?'is-selected':''}"><td><input type="checkbox" data-select-product="${catalog.escapeHtml(product.id)}" aria-label="选择${catalog.escapeHtml(product.name)}" ${catalogSelected.has(String(product.id))?'checked':''}></td><td><span class="catalog-table-product"><img src="${catalog.escapeHtml(globalThis.HotData.productImage(product))}" alt=""><strong>${catalog.escapeHtml(product.name)}</strong></span></td><td><span class="badge">${catalog.escapeHtml(product.category||'未分类')}</span></td><td><span class="catalog-table-selling">${catalog.escapeHtml(product.selling||'暂无卖点')}</span><small>${catalog.escapeHtml((Array.isArray(product.tags)?product.tags:[]).join(' · '))}</small></td><td class="catalog-table-price">¥${catalog.money(price)}</td><td>${original?`<del>¥${catalog.money(original)}</del>`:'—'}</td><td>${rate}</td><td><span class="catalog-reference-count ${titles.length?'has-references':''}" title="${catalog.escapeHtml(titles.length?titles.join('；'):'当前范围内无热点推荐引用')}">${titles.length}条</span></td><td><div class="catalog-row-actions"><button class="button small" type="button" data-edit-product="${catalog.escapeHtml(product.id)}" aria-label="编辑 ${catalog.escapeHtml(product.name)}">编辑</button><button class="button small" type="button" data-copy-product="${catalog.escapeHtml(product.id)}" aria-label="复制 ${catalog.escapeHtml(product.name)}">复制</button><button class="button small catalog-danger" type="button" data-delete-product="${catalog.escapeHtml(product.id)}" aria-label="删除 ${catalog.escapeHtml(product.name)}">删除</button></div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
async function latestCatalogProducts(){
  if(state.server){const latest=await api('/api/config');return latest.config.products}
  const local=getLocal(localConfigKey,null);
  return Array.isArray(local?.products)?local.products:state.config.products;
}
function showCatalogFeedback(action,result){
  catalogFeedback={action,success:result.success,skipped:result.skipped};
  catalogSelected.clear();renderCurrentPage();
  const message=`${action}：成功 ${result.success} 条，跳过 ${result.skipped.length} 条`;
  toast(message);
}
async function applyCatalogBulkCategory(){
  const category=document.querySelector('#catalogBulkCategory').value.trim();
  if(!category||category.length>40){toast('请输入 1–40 字的目标品类');document.querySelector('#catalogBulkCategory').focus();return}
  const button=document.querySelector('#catalogApplyCategory');button.disabled=true;
  try{
    const latest=await latestCatalogProducts(),result=globalThis.HotCatalog.bulkChange(latest,catalogSelected,{type:'category',category});
    if(result.success)await persist({...state.config,products:result.products},'批量品类已更新',{products:result.products});
    showCatalogFeedback('批量修改品类',result);
  }catch(error){toast(`批量修改失败：${error.message}`);button.disabled=false}
}
async function loadCatalogReferenceNews(){
  const demo=globalThis.HotData.normalizeNews(globalThis.HotData.demoNews);
  if(!state.server)return {news:demo,source:'仅内置演示热点（服务未启动）'};
  try{
    const response=await fetch('/api/hot',{signal:AbortSignal.timeout(22000)});
    if(!response.ok)throw new Error('热榜暂不可用');
    const result=await response.json();
    if(result.mode!=='live')return {news:demo,source:'仅内置演示热点（实时来源不可用）'};
    const byTitle=new Map(demo.map(news=>[news.title,news]));
    for(const news of globalThis.HotData.normalizeNews(result.news||[]))byTitle.set(news.title,news);
    return {news:globalThis.HotDedupe.dedupeBatch([...byTitle.values()]),source:'内置演示热点及当前实时热榜（已合并同一事件）'};
  }catch{return {news:demo,source:'仅内置演示热点（实时来源不可用）'}}
}
async function ensureCatalogReferences(){
  if(catalogReferencesLoaded)return catalogReferenceSnapshot;
  if(catalogReferencePending)return catalogReferencePending;
  catalogReferencePending=loadCatalogReferenceNews().then(snapshot=>{catalogReferenceSnapshot=snapshot;catalogReferencesLoaded=true;return snapshot}).finally(()=>{
    catalogReferencePending=null;
    if(document.querySelector('#catalogResults'))renderProductResults();
  });
  if(document.querySelector('#catalogResults'))renderProductResults();
  return catalogReferencePending;
}
async function openCatalogDeleteConfirmation(selectedIds=catalogSelected,trigger=null){
  const ids=new Set(selectedIds);if(!ids.size)return;
  const single=Boolean(trigger),action=single?'删除商品':'批量删除';
  const button=trigger||document.querySelector('#catalogDelete'),label=button.textContent;button.disabled=true;button.textContent='正在检查引用…';
  try{
    const [latest,snapshot]=await Promise.all([latestCatalogProducts(),ensureCatalogReferences()]);
    const selected=latest.filter(product=>ids.has(String(product.id)));
    if(selected.length===latest.length){showCatalogFeedback(action,{success:0,skipped:[...ids].map(id=>({id,reason:'商品库至少保留 1 件商品'}))});return}
    const refs=globalThis.HotCatalog.recommendationReferences(snapshot.news,latest,globalThis.HotMatching.matchProducts);
    const esc=globalThis.HotCatalog.escapeHtml;
    const missing=[...ids].filter(id=>!selected.some(product=>String(product.id)===id));
    const root=document.querySelector('#adminProductModalRoot');
    root.innerHTML=`<dialog id="catalogDeleteDialog" class="catalog-delete-dialog" aria-labelledby="catalogDeleteTitle"><h2 id="catalogDeleteTitle">确认删除 ${selected.length} 件商品？</h2><p>删除后商品会从工作台商品库和即时推荐中移除。此操作会保存配置，服务端会备份上一版。</p><div class="catalog-reference-list">${selected.map(product=>{const titles=refs.get(String(product.id))||[];return `<div class="catalog-reference-item"><strong>${esc(product.name)}</strong><span>该商品被 ${titles.length} 条热点推荐引用，删除后这些推荐会失效。</span>${titles.length?`<small>关联热点：${esc(titles.slice(0,3).join('；'))}${titles.length>3?'…':''}</small>`:''}</div>`}).join('')}</div><p class="catalog-reference-scope">引用范围：${esc(snapshot.source)}，共检查 ${snapshot.news.length} 条热点。${missing.length?` 另有 ${missing.length} 件已不存在，执行时将跳过。`:''}</p><div class="catalog-dialog-actions"><button id="catalogDeleteCancel" type="button" class="button">取消</button><button id="catalogDeleteConfirm" type="button" class="button primary">确认删除</button></div></dialog>`;
    const dialog=document.querySelector('#catalogDeleteDialog');
    dialog.addEventListener('close',()=>root.replaceChildren(),{once:true});
    document.querySelector('#catalogDeleteCancel').addEventListener('click',()=>dialog.close());
    document.querySelector('#catalogDeleteConfirm').addEventListener('click',async event=>{
      const confirmButton=event.currentTarget;confirmButton.disabled=true;confirmButton.textContent='正在删除…';
      try{
        const current=await latestCatalogProducts();
        const result=globalThis.HotCatalog.bulkChange(current,ids,{type:'delete'});
        if(result.success)await persist({...state.config,products:result.products},'所选商品已删除',{products:result.products});
        dialog.close();showCatalogFeedback(action,result);
      }catch(error){toast(`删除失败：${error.message}`);confirmButton.disabled=false;confirmButton.textContent='确认删除'}
    });
    dialog.showModal();
  }catch(error){toast(`引用检查失败：${error.message}`)}
  finally{button.disabled=!single&&!catalogSelected.size;button.textContent=label}
}
function downloadProductCatalog(format){
  const products=state.config.products||[],transfer=globalThis.HotProductTransfer;
  const content=format==='csv'?transfer.exportCsv(products):transfer.exportJson(products);
  const blob=new Blob([content],{type:format==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`hot-marketing-products-${new Date().toISOString().slice(0,10)}.${format}`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast(`已导出 ${products.length} 件商品的 ${format.toUpperCase()} 文件`);
}
async function previewProductImport(file){
  const esc=globalThis.HotCatalog.escapeHtml;
  if(file.size>2*1024*1024){toast('商品文件超过 2 MB，请缩小后重试');return}
  const format=file.name.toLowerCase().endsWith('.csv')?'csv':file.name.toLowerCase().endsWith('.json')?'json':null;
  if(!format){toast('只支持 .json 或 .csv 商品文件');return}
  let result;
  try{
    const content=await file.text();
    const transfer=globalThis.HotProductTransfer;
    result=format==='csv'?transfer.importCsv(content):transfer.importJson(content);
  }catch(error){toast(`读取商品文件失败：${error.message}`);return}
  const errors=result.errors||[],items=result.products||[];
  const root=document.querySelector('#adminProductModalRoot');
  root.innerHTML=`<dialog id="catalogImportDialog" class="catalog-import-dialog" aria-labelledby="catalogImportTitle"><h2 id="catalogImportTitle">导入前检查 · ${format.toUpperCase()}</h2><p>文件：${esc(file.name)}。确认后会用文件中的商品替换当前整份商品库，并保存到${sourceLabels[state.source]}。</p><div class="catalog-import-summary"><strong>${errors.length?'⚠ 发现问题，尚未导入':'✓ 校验通过，可以导入'}</strong><span>可解析商品 ${items.length} 件 · 问题 ${errors.length} 处</span></div>${errors.length?`<div class="catalog-import-errors" role="alert">${errors.map(issue=>`<div><strong>第 ${Number(issue.line)||1} 行</strong><span>${esc(issue.reason)}</span></div>`).join('')}</div><p>请修正文件后重新选择。原商品库未更改。</p>`:`<div class="catalog-import-sample"><strong>商品预览</strong><span>${esc(items.slice(0,5).map(item=>item.name).join('、'))}${items.length>5?' 等':''}</span></div><p class="catalog-import-warning">此次导入将整体替换 ${state.config.products.length} 件现有商品。请核对数量和内容后再确认。</p>`}<div class="catalog-dialog-actions"><button id="catalogImportCancel" type="button" class="button">${errors.length?'关闭':'取消'}</button>${errors.length?'':`<button id="catalogImportConfirm" type="button" class="button primary">确认导入 ${items.length} 件</button>`}</div></dialog>`;
  const dialog=document.querySelector('#catalogImportDialog');
  dialog.addEventListener('close',()=>root.replaceChildren(),{once:true});
  document.querySelector('#catalogImportCancel').addEventListener('click',()=>dialog.close());
  if(!errors.length)document.querySelector('#catalogImportConfirm').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='正在导入…';
    try{
      const latest=await latestCatalogProducts();
      if(JSON.stringify(latest)!==JSON.stringify(state.config.products))throw new Error('商品库已被其他页面更新，请刷新后重新导入');
      await persist({...state.config,products:items},`已导入 ${items.length} 件商品`,{products:items});
      dialog.close();catalogSelected.clear();catalogFeedback={action:'整库导入',success:items.length,skipped:[]};
      renderCurrentPage();
    }catch(error){toast(`导入失败：${error.message}`);button.disabled=false;button.textContent=`确认导入 ${items.length} 件`}
  });
  dialog.showModal();
}
async function refreshProducts(){if(catalogReferencePending)await catalogReferencePending;catalogReferencesLoaded=false;await loadData();updateSourceBadges();renderCurrentPage();setSaveState('商品库已刷新');toast(`商品库已刷新 · 数据来自${sourceLabels[state.source]}`)}

const productEmojis=['🧥','🧊','👟','🏕️','👜','💡','🪭','🏋️','🎧','📱','☕','🎁'];
const productColors=['#dbeafe','#dcfce7','#ede9fe','#fef3c7','#fee2e2','#e0f2fe','#fce7f3','#e7f5e9','#e7f3ff','#fff0d9','#e5e7eb','#f3e8ff'];
function productEditorStatus(){
  state.dirty=Boolean(productDraft&&JSON.stringify(productDraft)!==productBaseline);
  document.querySelector('.admin-actionbar').classList.toggle('is-dirty',state.dirty);
  document.querySelector('#adminSaveState').textContent=state.dirty?'● 商品修改未保存':'商品编辑中';
}
function openProductEditor(id=null,copyId=null){
  const products=state.config.products||[],existing=(id||copyId)?products.find(item=>String(item.id)===String(id||copyId)):null;
  if((id||copyId)&&!existing){toast('商品已更新，请刷新后重试');return}
  productEditingId=copyId?null:existing?.id||null;productTouched=new Set();productSubmitAttempted=false;
  productDraft=existing?{...existing,tags:[...(existing.tags||[])],originalPrice:globalThis.HotCatalog.originalPrice(existing)??''}:{id:globalThis.HotCatalog.nextId(products),name:'',emoji:'🎁',artMode:'emoji',image:'',color:productColors[0],price:'',originalPrice:'',category:'',selling:'',tags:[],url:''};
  if(copyId)productDraft=globalThis.HotCatalog.copyProduct(existing,products);
  productBaseline=JSON.stringify(productDraft);
  const esc=globalThis.HotCatalog.escapeHtml;
  const categories=[...new Set(products.map(item=>String(item.category||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const root=document.querySelector('#adminProductModalRoot');
  root.innerHTML=`<dialog id="productEditor" class="product-editor" aria-labelledby="productEditorTitle"><div class="product-editor-header"><div><span class="eyebrow">PRODUCT / 商品维护</span><h2 id="productEditorTitle">${copyId?'复制商品':existing?'编辑商品':'新增商品'}</h2><p>${copyId?'已生成新编号并保留商品资料，保存后创建副本。':'商品卡实时预览；保存后工作台可立即使用。'}</p></div><button class="product-editor-close" type="button" id="productEditorClose" aria-label="关闭编辑弹窗">×</button></div><div class="product-editor-grid"><form id="productEditorForm" novalidate><div class="product-editor-fields">
    <label class="admin-field"><span>商品编号</span><input id="editProductId" value="${esc(productDraft.id)}" readonly><small>系统自动生成；编辑时保持不变</small><small class="product-field-error" id="productError-id"></small></label>
    <label class="admin-field"><span>商品名称 <b>*</b></span><input id="editProductName" data-product-field="name" maxlength="80" placeholder="例如：轻量速干运动鞋"><small class="product-field-error" id="productError-name"></small></label>
    <div class="product-field-wide"><label class="admin-field"><span>图标 <b>*</b></span><input id="editProductEmoji" data-product-field="emoji" maxlength="16" placeholder="输入一个表情图标"><small>点击下方表情可快速选用，也可手动输入。</small><small class="product-field-error" id="productError-emoji"></small></label><div id="productEmojiChoices" class="product-choice-grid">${productEmojis.map(emoji=>`<button class="product-emoji-choice" type="button" data-emoji="${esc(emoji)}" aria-label="选择图标 ${esc(emoji)}">${esc(emoji)}</button>`).join('')}</div></div>
    <div class="product-field-wide"><span class="product-field-label">背景渐变 <b>*</b></span><div id="productColorChoices" class="product-color-grid">${productColors.map(color=>`<button class="product-color-choice" type="button" data-color="${color}" style="--choice-color:${color}" aria-label="选择配色 ${color}"></button>`).join('')}</div><small class="product-field-error" id="productError-color"></small></div>
    <label class="admin-field"><span>售价（元） <b>*</b></span><input id="editProductPrice" data-product-field="price" type="number" min="0.01" step="0.01" placeholder="0.00"><small class="product-field-error" id="productError-price"></small></label>
    <label class="admin-field"><span>原价（元） <b>*</b></span><input id="editProductOriginal" data-product-field="originalPrice" type="number" min="0.01" step="0.01" placeholder="不得低于售价"><small class="product-field-error" id="productError-originalPrice"></small></label>
    <div class="product-field-wide product-discount" id="productDiscount" role="status">填写售价和原价后显示折扣率</div>
    <label class="admin-field product-field-wide"><span>品类 <b>*</b></span><input id="editProductCategory" data-product-field="category" list="productCategoryOptions" maxlength="40" placeholder="选择已有品类或输入新品类"><datalist id="productCategoryOptions">${categories.map(category=>`<option value="${esc(category)}"></option>`).join('')}</datalist><small class="product-field-error" id="productError-category"></small></label>
    <label class="admin-field product-field-wide"><span>商品卖点描述</span><textarea id="editProductSelling" data-product-field="selling" maxlength="300" placeholder="写一句话描述商品的真实卖点"></textarea><small class="product-field-error" id="productError-selling"></small></label>
    <div class="product-field-wide"><label class="admin-field" for="editProductTag"><span>卖点标签 <b>*</b></span><div class="product-tag-entry"><input id="editProductTag" placeholder="输入卖点后按回车"><button id="addProductTag" class="button small" type="button">添加</button></div><small>建议 2–4 个；可填写高温、防晒、运动等场景词，参与热点商品匹配。</small><small class="product-field-error" id="productError-tags"></small></label><div id="editProductTags" class="product-edit-tags"></div></div>
  </div></form><aside class="product-preview-panel"><div class="product-preview-sticky"><strong>实时预览</strong><p>与工作台共用同一张商品卡</p><div id="productLivePreview"></div></div></aside></div><div class="product-editor-actions"><span id="productEditorSaveState" role="status">修改会实时显示在预览卡中</span><div><button class="button" type="button" id="productEditorCancel">取消</button><button class="button primary" type="button" id="productEditorSave">保存商品</button></div></div></dialog>`;
  const dialog=document.querySelector('#productEditor');
  for(const [field,input] of Object.entries({name:'editProductName',emoji:'editProductEmoji',price:'editProductPrice',originalPrice:'editProductOriginal',category:'editProductCategory',selling:'editProductSelling'}))document.querySelector('#'+input).value=productDraft[field]??'';
  document.querySelector('#productEditorForm').addEventListener('input',event=>{const field=event.target.dataset.productField;if(!field)return;productDraft[field]=event.target.value;productTouched.add(field);if(field==='emoji'){productDraft.artMode='emoji';productDraft.image=''}renderProductEditor()});
  document.querySelector('#productEmojiChoices').addEventListener('click',event=>{const choice=event.target.closest('[data-emoji]');if(!choice)return;productDraft.emoji=choice.dataset.emoji;productDraft.artMode='emoji';productDraft.image='';productTouched.add('emoji');document.querySelector('#editProductEmoji').value=productDraft.emoji;renderProductEditor()});
  document.querySelector('#productColorChoices').addEventListener('click',event=>{const choice=event.target.closest('[data-color]');if(!choice)return;productDraft.color=choice.dataset.color;productDraft.artMode='emoji';productDraft.image='';productTouched.add('color');renderProductEditor()});
  document.querySelector('#editProductTag').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addProductTag()}});
  document.querySelector('#editProductTag').addEventListener('input',()=>{document.querySelector('#productError-tags').textContent=''});
  document.querySelector('#addProductTag').addEventListener('click',addProductTag);
  document.querySelector('#editProductTags').addEventListener('click',event=>{const remove=event.target.closest('[data-remove-tag]');if(!remove)return;productDraft.tags.splice(Number(remove.dataset.removeTag),1);productTouched.add('tags');renderProductEditor()});
  document.querySelector('#productEditorSave').addEventListener('click',saveProductEditor);
  document.querySelector('#productEditorClose').addEventListener('click',closeProductEditor);
  document.querySelector('#productEditorCancel').addEventListener('click',closeProductEditor);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeProductEditor()});
  dialog.showModal();renderProductEditor();productEditorStatus();document.querySelector('#editProductName').focus();
}
function addProductTag(){
  const input=document.querySelector('#editProductTag'),tag=input.value.trim();
  if(!tag)return;
  const error=document.querySelector('#productError-tags');
  if(tag.length>30){error.textContent='单个卖点标签不能超过 30 字';return}
  if(productDraft.tags.includes(tag)){error.textContent='这个卖点标签已经添加';return}
  if(productDraft.tags.length>=8){error.textContent='最多添加 8 个卖点标签';return}
  productDraft.tags.push(tag);productTouched.add('tags');input.value='';error.textContent='';renderProductEditor();input.focus();
}
function renderProductEditor(){
  if(!productDraft)return;
  const catalog=globalThis.HotCatalog,esc=catalog.escapeHtml;
  document.querySelector('#productLivePreview').innerHTML=catalog.renderCard({...productDraft,name:productDraft.name||'商品名称',selling:productDraft.selling||productDraft.tags.join('、')||'商品卖点会在这里显示',category:productDraft.category||'商品',price:Number(productDraft.price)||0},{action:'none'});
  document.querySelector('#editProductTags').innerHTML=productDraft.tags.map((tag,index)=>`<span class="product-edit-tag">${esc(tag)}<button type="button" data-remove-tag="${index}" aria-label="删除卖点 ${esc(tag)}">×</button></span>`).join('');
  document.querySelectorAll('[data-emoji]').forEach(button=>button.classList.toggle('selected',button.dataset.emoji===productDraft.emoji));
  document.querySelectorAll('[data-color]').forEach(button=>button.classList.toggle('selected',button.dataset.color===productDraft.color));
  const price=Number(productDraft.price),original=Number(productDraft.originalPrice),discount=document.querySelector('#productDiscount');
  discount.textContent=productDraft.price&&productDraft.originalPrice&&original>=price&&price>0?`折扣率：${((original-price)/original*100).toFixed(1)}% · 比原价节省 ¥${catalog.money(original-price)}`:'填写有效售价和原价后显示折扣率';
  const errors=catalog.validateProduct(productDraft,{products:state.config.products,editingId:productEditingId});
  for(const field of ['id','name','emoji','color','price','originalPrice','category','selling','tags']){
    const node=document.querySelector(`#productError-${field}`);if(!node)continue;
    const visible=productSubmitAttempted||productTouched.has(field)||(field==='originalPrice'&&productDraft.price&&productDraft.originalPrice&&errors[field]);
    node.textContent=visible?errors[field]||'':'';
    const input={name:'editProductName',emoji:'editProductEmoji',price:'editProductPrice',originalPrice:'editProductOriginal',category:'editProductCategory',selling:'editProductSelling'}[field];
    if(input)document.querySelector('#'+input).setAttribute('aria-invalid',String(Boolean(visible&&errors[field])));
  }
  productEditorStatus();
}
function closeProductEditor(){
  if(state.dirty&&!confirm('商品有未保存的修改，确定放弃吗？'))return;
  document.querySelector('#productEditor')?.close();document.querySelector('#adminProductModalRoot').replaceChildren();productDraft=null;productEditingId=null;state.dirty=false;
  document.querySelector('.admin-actionbar').classList.remove('is-dirty');setSaveState('商品库已载入');
}
async function saveProductEditor(){
  if(!productDraft)return;
  productSubmitAttempted=true;renderProductEditor();
  const catalog=globalThis.HotCatalog,errors=catalog.validateProduct(productDraft,{products:state.config.products,editingId:productEditingId});
  if(Object.keys(errors).length){const first=Object.keys(errors)[0],target={id:'editProductId',name:'editProductName',emoji:'editProductEmoji',color:'productColorChoices',price:'editProductPrice',originalPrice:'editProductOriginal',category:'editProductCategory',selling:'editProductSelling',tags:'editProductTag'}[first];document.querySelector('#'+target)?.focus();document.querySelector('#productEditorSaveState').textContent=`请修正：${errors[first]}`;return}
  const button=document.querySelector('#productEditorSave');button.disabled=true;button.textContent='正在保存…';
  try{
    let latestProducts=state.config.products;
    if(state.server){const latest=await api('/api/config');if(Array.isArray(latest.config?.products))latestProducts=latest.config.products}
    else{const latest=getLocal(localConfigKey,null);if(Array.isArray(latest?.products))latestProducts=latest.products}
    if(productEditingId&&!latestProducts.some(existing=>String(existing.id)===String(productEditingId)))throw new Error('这件商品已不存在，请刷新商品库后重试');
    if(!productEditingId&&latestProducts.some(existing=>String(existing.id)===String(productDraft.id))){productDraft.id=catalog.nextId(latestProducts);document.querySelector('#editProductId').value=productDraft.id}
    const item={...productDraft,name:productDraft.name.trim(),category:productDraft.category.trim(),emoji:productDraft.emoji.trim(),selling:productDraft.selling.trim()||productDraft.tags.join('、'),price:Number(productDraft.price),originalPrice:Number(productDraft.originalPrice),tags:[...productDraft.tags]};
    if(!item.url)item.url=`product.html?id=${encodeURIComponent(item.id)}`;
    const products=productEditingId?latestProducts.map(existing=>String(existing.id)===String(productEditingId)?item:existing):[...latestProducts,item];
    await persist({...state.config,products},productEditingId?'商品已更新，工作台下次读取即生效':'商品已新增，工作台下次读取即生效',{products});
    document.querySelector('#productEditor').close();document.querySelector('#adminProductModalRoot').replaceChildren();productDraft=null;productEditingId=null;renderCurrentPage();setSaveState(`已保存到${sourceLabels[state.source]}`);
  }catch(error){document.querySelector('#productEditorSaveState').textContent=`保存失败：${error.message}`;toast(`保存失败：${error.message}`)}
  finally{button.disabled=false;button.textContent='保存商品'}
}

function pricingDraft(){return Object.fromEntries(['inputPerMillion','outputPerMillion','totalPerMillion'].map(key=>[key,document.querySelector(`#price-${key}`)?.value??'']))}
function validPricing(){const draft=pricingDraft(),pricing={};for(const [key,value] of Object.entries(draft)){const number=Number(value);if(value===''||!Number.isFinite(number)||number<0||number>100000)throw new Error('Token 单价须为 0 到 100000 的数字');pricing[key]=number}return pricing}
const dashboardNumber=value=>Number(value||0).toLocaleString('zh-CN');
function dashboardMoney(value){return `¥${value>0&&value<.0001?value.toFixed(6):value.toFixed(4)}`}
function dashboardEmpty(message){return `<div class="dashboard-empty">${esc(message)}</div>`}
function trendSvg(buckets){
  const width=720,height=190,left=32,right=12,top=14,bottom=32,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const max=Math.max(1,...buckets.map(item=>item.value)),slot=plotWidth/Math.max(1,buckets.length),bar=Math.max(2,Math.min(24,slot*.65)),every=Math.max(1,Math.ceil(buckets.length/9));
  const grid=[0,.5,1].map(fraction=>{const y=top+plotHeight*(1-fraction);return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="var(--line)"/><text x="${left-7}" y="${y+4}" text-anchor="end" class="dashboard-axis">${Math.round(max*fraction)}</text>`}).join('');
  const bars=buckets.map((item,index)=>{const x=left+slot*index+(slot-bar)/2,barHeight=plotHeight*item.value/max,y=top+plotHeight-barHeight;return `<g><title>${esc(item.label)}：${item.value} 条发布</title><rect x="${x}" y="${y}" width="${bar}" height="${Math.max(item.value?3:0,barHeight)}" rx="3" fill="var(--brand)"/><text x="${x+bar/2}" y="${height-9}" text-anchor="middle" class="dashboard-axis">${index%every===0||index===buckets.length-1?esc(item.label):''}</text></g>`}).join('');
  return `<svg class="dashboard-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="发布量时间趋势">${grid}${bars}</svg>`;
}
function dashboardBars(rows,unit){
  if(!rows.length)return dashboardEmpty('当前时间范围没有可统计的数据。');
  const max=Math.max(1,...rows.map(row=>row.value));
  return `<div class="dashboard-bars">${rows.slice(0,8).map(row=>`<div class="dashboard-bar-row"><div><strong title="${esc(row.name)}">${esc(row.name)}</strong><span>${dashboardNumber(row.value)} ${unit}</span></div><div class="dashboard-bar-track"><span style="width:${Math.max(2,row.value/max*100)}%"></span></div></div>`).join('')}</div>`;
}
function dashboardActivity(row){
  if(row.type==='fetch')return `抓取热点，入列 ${dashboardNumber(row.returned)} 条，风险拦截 ${dashboardNumber(row.blocked)} 条，合并重复 ${dashboardNumber(row.deduped)} 条`;
  if(row.type==='generate')return `${row.status==='failed'?'生成失败':'生成文案'}：${row.title||'未记录热点'}${row.creativeStyle?` · ${row.creativeStyle}`:''}`;
  return `${row.status==='failed'?'发布失败':'模拟发布'}：${row.title||'未记录热点'}${row.products?.length?` · ${row.products.join('、')}`:''}`;
}

function renderDashboard(){
  const pricing={...defaults.tokenPricing,...state.config.tokenPricing},content=document.querySelector('#adminContent');
  content.innerHTML=section('dashboard-metrics','关键指标','按流水发生时间筛选。入库条数指去重后进入热点列表的条数；生成次数含失败尝试。',`<div class="dashboard-toolbar"><div class="dashboard-ranges" role="group" aria-label="时间范围">${[['today','今日'],['seven','近七天'],['thirty','近三十天'],['all','全部']].map(([id,label])=>`<button type="button" class="button ${dashboardRange===id?'active':''}" data-dashboard-range="${id}" aria-pressed="${dashboardRange===id}">${label}</button>`).join('')}</div><button class="button" id="dashboardRefresh" type="button">↻ 刷新流水</button></div><div id="dashboardCoverage" class="dashboard-coverage"></div><div id="dashboardMetricCards" class="dashboard-metrics"></div><p id="dashboardTokenNote" class="dashboard-coverage"></p>`)+section('dashboard-trend','发布量时间趋势','今日按小时统计，其它范围按日期统计；跨度超过 60 天时按月汇总。',`<div id="dashboardTrendChart"></div>`)+section('dashboard-distribution','来源与模型调用分布','来源按每次成功抓到的原始条目累计；模型按每次生成尝试累计。',`<div class="dashboard-two"><div><h3>热点来源</h3><div id="dashboardSources"></div></div><div><h3>模型调用</h3><div id="dashboardModels"></div></div></div>`)+section('dashboard-products','带货商品排行','只统计成功发布流水；一条发布涉及多件商品时，每件各计一次。',`<div id="dashboardProducts"></div>`)+section('dashboard-recent','最近动态','展示当前时间范围内最近 12 条抓取、生成和发布流水。',`<div id="dashboardRecent"></div><a class="dashboard-all-link" href="admin-records.html">查看运行记录 →</a>`)+section('dashboard-pricing','模型 Token 预估单价','单位：人民币元 / 百万 Token。模拟生成不会计入预估花费。',`<div class="dashboard-price-grid"><label class="admin-field"><span>输入 Token 单价</span><input id="price-inputPerMillion" type="number" min="0" max="100000" step="0.01"><small>用于有输入 Token 明细的真实调用</small></label><label class="admin-field"><span>输出 Token 单价</span><input id="price-outputPerMillion" type="number" min="0" max="100000" step="0.01"><small>用于有输出 Token 明细的真实调用</small></label><label class="admin-field"><span>仅有总量时的单价</span><input id="price-totalPerMillion" type="number" min="0" max="100000" step="0.01"><small>旧流水未拆分输入/输出时使用</small></label></div><p class="dashboard-price-note">参考价，以服务商官网为准，可自行修改。修改后预估值即时更新，点击底部保存后两端共用。</p>`);
  for(const [key,value] of Object.entries(pricing))document.querySelector(`#price-${key}`).value=value;
  document.querySelectorAll('[data-dashboard-range]').forEach(button=>button.addEventListener('click',()=>{dashboardRange=button.dataset.dashboardRange;document.querySelectorAll('[data-dashboard-range]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button))});renderDashboardData()}));
  document.querySelector('#dashboardRefresh').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await loadRecords(false);renderDashboardData();toast('流水已刷新')}finally{button.disabled=false}});
  document.querySelectorAll('.dashboard-price-grid input').forEach(input=>input.addEventListener('input',renderDashboardData));
  const button=document.querySelector('#adminPrimaryAction');button.textContent='保存预估单价';button.dataset.action='save-dashboard';
  renderDashboardData();
}
function renderDashboardData(){
  const draft=pricingDraft(),pricing=Object.fromEntries(Object.entries(draft).map(([key,value])=>[key,value===''?0:Math.max(0,Number(value)||0)]));
  const result=globalThis.HotDashboard.summarize(state.records,dashboardRange,pricing),m=result.metrics;
  document.querySelector('#dashboardCoverage').textContent=`已读取 ${dashboardNumber(state.records.length)} 条流水 · 当前范围 ${dashboardNumber(result.rows.length)} 条 · 来源：${state.server?'服务端完整流水':'浏览器本机留存流水'}`;
  const cards=[['抓取次数',m.fetches,'次'],['入库条数',m.imported,'条'],['文案生成',m.generations,'次'],['模拟发布',m.publishes,'条'],['风险拦截',m.blocked,'条'],['去重拦截',m.deduped,'条'],['Token 消耗',m.tokens,'个'],['预估花费',dashboardMoney(m.cost),'']];
  document.querySelector('#dashboardMetricCards').innerHTML=cards.map(([label,value,unit])=>`<div class="dashboard-metric"><span>${label}</span><strong>${typeof value==='number'?dashboardNumber(value):value}<small>${unit}</small></strong></div>`).join('');
  document.querySelector('#dashboardTokenNote').textContent=`其中模拟估算 ${dashboardNumber(m.simulatedTokens)} Token；真实模型计价 ${dashboardNumber(m.pricedTokens)} Token。未返回用量的调用不参与花费估算。`;
  document.querySelector('#dashboardTrendChart').innerHTML=result.rows.length?trendSvg(result.trend):dashboardEmpty('当前范围暂无流水，发布趋势会在有记录后出现。');
  document.querySelector('#dashboardSources').innerHTML=dashboardBars(result.sources,'条');
  document.querySelector('#dashboardModels').innerHTML=dashboardBars(result.models,'次');
  document.querySelector('#dashboardProducts').innerHTML=result.products.length?`<div class="dashboard-product-rank">${result.products.slice(0,10).map((item,index)=>`<div><span>${String(index+1).padStart(2,'0')}</span><strong>${esc(item.name)}</strong><b>${dashboardNumber(item.value)} 次</b></div>`).join('')}</div>`:dashboardEmpty('当前范围暂无成功发布的商品记录。');
  document.querySelector('#dashboardRecent').innerHTML=result.recent.length?`<div class="dashboard-activity">${result.recent.map(row=>`<div><time>${esc(formatTime(row.time))}</time><span class="badge ${row.status==='failed'?'danger':row.type==='publish'?'good':row.type==='generate'?'purple':''}">${row.type==='fetch'?'抓取':row.type==='generate'?'生成':'发布'}</span><p>${esc(dashboardActivity(row))}</p></div>`).join('')}</div>`:dashboardEmpty('当前范围还没有动态。完成一次抓取或生成后，这里会显示记录。');
}
async function saveDashboard(){const tokenPricing=validPricing();await persist({...state.config,tokenPricing},'预估单价已保存',{tokenPricing});renderDashboardData()}

function renderRecords(){
  const content=document.querySelector('#adminContent'),counts={fetch:0,generate:0,publish:0};
  state.records.forEach(row=>{if(counts[row.type]!==undefined)counts[row.type]++});
  content.innerHTML=section('summary','记录概览','当前加载的流水按抓取、生成和发布三类汇总。',`<div class="admin-stat-grid"><div><span>抓取</span><strong>${counts.fetch}</strong></div><div><span>生成</span><strong>${counts.generate}</strong></div><div><span>发布</span><strong>${counts.publish}</strong></div><div><span>合计</span><strong>${state.records.length}</strong></div></div>`)+section('record-list','流水明细','最多展示最近 100 条记录，支持按类型筛选。',`<div class="admin-record-tools"><label>记录类型<select id="adminRecordFilter"><option value="all">全部</option><option value="fetch">抓取</option><option value="generate">生成</option><option value="publish">发布</option></select></label><span id="adminRecordCount"></span></div><div id="adminRecordList" class="admin-record-list"></div>`)+section('retention','留存说明','流水用于三天去重和后续数据看板，不影响离线演示主流程。',`<div class="admin-policy"><div><strong>服务端记录</strong><span>保存在 data/activity.jsonl，读取最近 500 条</span></div><div><strong>浏览器记录</strong><span>服务不可用时从本机存储读取</span></div><div><strong>敏感内容</strong><span>可能包含标题、商品和文案，请限制文件访问</span></div></div>`);
  const button=document.querySelector('#adminPrimaryAction');button.textContent='刷新运行记录';button.dataset.action='refresh-records';
  document.querySelector('#adminRecordFilter').addEventListener('change',renderRecordList);
  renderRecordList();
}

function renderRecordList(){
  const list=document.querySelector('#adminRecordList');if(!list)return;
  const filter=document.querySelector('#adminRecordFilter')?.value||'all';
  const rows=[...state.records].reverse().filter(row=>filter==='all'||row.type===filter).slice(0,100);
  list.replaceChildren();
  if(!rows.length){const empty=document.createElement('div');empty.className='admin-record-empty';empty.textContent='当前没有符合条件的运行记录。';list.append(empty)}
  else rows.forEach(row=>{
    const article=document.createElement('article');article.className='admin-record-item';
    const head=document.createElement('div');head.className='admin-record-head';
    const type=document.createElement('span');type.className=`badge ${row.status==='failed'?'danger':row.type==='publish'?'good':row.type==='generate'?'purple':''}`;type.textContent=row.type==='fetch'?'抓取':row.type==='generate'?'生成':'发布';
    const time=document.createElement('time');time.textContent=formatTime(row.time);head.append(type,time);
    const title=document.createElement('strong');title.textContent=row.title||`${Number(row.returned)||0} 条热点`;
    const detail=document.createElement('p');detail.textContent=[row.mode,row.products?.join('、'),row.duration?`${row.duration} ms`:''].filter(Boolean).join(' · ')||'无补充信息';
    article.append(head,title,detail);list.append(article);
  });
  document.querySelector('#adminRecordCount').textContent=`显示 ${rows.length} 条`;
}

function validateBase(next){
  if(!['mock','proxy','direct'].includes(next.mode))throw new Error('请选择调用方式');
  if(!Object.prototype.hasOwnProperty.call(providerPresets,next.provider))throw new Error('请选择有效服务商');
  if(typeof next.stream!=='boolean')throw new Error('请选择是否流式输出');
  if(!next.baseUrl||!next.model)throw new Error('接口地址和模型名称不能为空');
  if(!Number.isFinite(next.temperature)||next.temperature<0||next.temperature>2)throw new Error('创作温度须在 0 到 2 之间');
  if(!Number.isSafeInteger(next.autoThreshold)||next.autoThreshold<0)throw new Error('最低新闻热度须为非负整数');
  if(!next.promptTemplates||!['system','user','product'].every(key=>typeof next.promptTemplates[key]==='string'&&next.promptTemplates[key].trim()))throw new Error('三块提示词模板都不能为空');
  if(Object.values(next.promptTemplates).some(value=>value.length>12000))throw new Error('单块提示词模板不能超过 12000 字');
  if(!Array.isArray(next.creativeStyles)||!next.creativeStyles.length||next.creativeStyles.length>12||next.creativeStyles.some(style=>!style.name?.trim()||!style.instruction?.trim()||style.name.length>40||style.instruction.length>1000))throw new Error('至少保留一个完整的创作风格，最多 12 个');
  if(!Array.isArray(next.tonePresets)||!next.tonePresets.length||next.tonePresets.length>30||next.tonePresets.some(tone=>!tone?.trim()||tone.length>40)||new Set(next.tonePresets).size!==next.tonePresets.length)throw new Error('至少保留一个不重复的语调，最多 30 个');
}
function validateWholeConfig(next){
  validateBase(next);
  if(!next.tokenPricing||['inputPerMillion','outputPerMillion','totalPerMillion'].some(key=>!Number.isFinite(next.tokenPricing[key])||next.tokenPricing[key]<0||next.tokenPricing[key]>100000))throw new Error('Token 单价须为 0 到 100000 的数字');
  if(!Array.isArray(next.products)||!next.products.length)throw new Error('商品列表不能为空，导入已取消');
  if(next.products.some(product=>!product?.id||!String(product.name||'').trim()||!Number.isFinite(Number(product.price))||Number(product.price)<=0||!Array.isArray(product.tags)))throw new Error('商品数据缺少编号、名称、有效售价或标签');
  if(new Set(next.products.map(product=>String(product.id))).size!==next.products.length)throw new Error('商品编号不能重复');
  if(next.products.some(product=>product.originalPrice!==undefined&&(!Number.isFinite(Number(product.originalPrice))||Number(product.originalPrice)<=0||Number(product.originalPrice)<Number(product.price))))throw new Error('商品原价必须大于 0 且不低于售价');
  if(!Array.isArray(next.sources)||next.sources.some(source=>!allowedSources.includes(source))||new Set(next.sources).size!==next.sources.length)throw new Error('平台热榜列表无效');
  if(!Array.isArray(next.rssFeeds)||next.rssFeeds.length>30)throw new Error('订阅源最多 30 个');
  const feedIds=new Set(),feedUrls=new Set();
  for(const feed of next.rssFeeds){if(!feed||typeof feed.id!=='string'||!/^rss-[a-zA-Z0-9-]{1,80}$/.test(feed.id)||feedIds.has(feed.id))throw new Error('订阅源编号无效或重复');feedIds.add(feed.id);if(typeof feed.name!=='string'||!feed.name.trim()||feed.name.length>80)throw new Error('订阅源名称须为 1 到 80 字');if(typeof feed.enabled!=='boolean')throw new Error('订阅源启停状态无效');if(typeof feed.url!=='string'||feed.url.length>2048)throw new Error('订阅源地址格式不正确');const url=validRssUrl(feed.url);if(feedUrls.has(url))throw new Error('订阅源地址不能重复');feedUrls.add(url)}
  if(!next.sources.length&&!next.rssFeeds.some(feed=>feed.enabled))throw new Error('至少启用一个抓取来源');
  let base;try{base=new URL(next.baseUrl)}catch{throw new Error('模型接口地址格式不正确')}
  if(base.protocol!=='https:'&&!/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(next.baseUrl))throw new Error('模型接口地址须为 HTTPS 或本机地址');
}
function parseImport(text){
  let file;try{file=JSON.parse(text.replace(/^\uFEFF/,''))}catch{throw new Error('文件不是有效的 JSON，请检查格式后重试')}
  if(!file||file.kind!=='hot-marketing-workbench-config'||file.version!==1||!file.config||typeof file.config!=='object'||Array.isArray(file.config))throw new Error('文件格式或版本不正确，请使用本后台导出的配置文件');
  if(Object.hasOwn(file.config,'apiKey'))throw new Error('导入文件包含密钥，已拒绝导入；请移除 apiKey 后重试');
  const required=['mode','provider','baseUrl','model','temperature','stream','autoThreshold','products','sources','promptTemplates','creativeStyles','tonePresets'];
  const missing=required.filter(key=>!Object.hasOwn(file.config,key));if(missing.length)throw new Error(`配置文件缺少字段：${missing.join('、')}`);
  const next={...defaults,...file.config,...normalizeSourceSettings(file.config),tokenPricing:{...defaults.tokenPricing,...file.config.tokenPricing},apiKey:state.config.apiKey||'',promptTemplates:{...defaults.promptTemplates,...file.config.promptTemplates}};
  validateWholeConfig(next);return next;
}
async function exportConfig(){
  let saved=state.config;
  if(state.server){const response=await api('/api/config');if(response.config)saved=response.config}
  const {apiKey,keyConfigured,...safe}=saved;
  const blob=new Blob([JSON.stringify({kind:'hot-marketing-workbench-config',version:1,exportedAt:new Date().toISOString(),config:safe},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`hot-marketing-config-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('已导出已保存配置，文件不含密钥');
}
function renderCurrentPage(){
  if(page==='prompts')renderPrompts();else if(page==='styles')renderStyles();else if(page==='sources')renderSources();else if(page==='dashboard')renderDashboard();else if(page==='records')renderRecords();else if(page==='products')renderProducts();else renderSettings();
  renderBackupTools();markSaved();setSaveState(page==='products'?'商品库已载入':'配置已载入');
}
async function importConfig(file){
  const output=document.querySelector('#adminImportResult');
  if(!file)return;
  try{
    if(file.size>1024*1024)throw new Error('配置文件超过 1 MB，已拒绝导入');
    const next=parseImport(await file.text());
    if(state.dirty&&!confirm('当前页面有未保存修改，导入将覆盖它们。继续导入吗？'))return;
    await persist(next,'整份配置已导入',next);
    renderCurrentPage();document.querySelector('#adminImportResult').textContent=`导入成功，已保存到${sourceLabels[state.source]}。`;
  }catch(error){output.textContent=`导入失败：${error.message}。原配置未更改。`;toast(output.textContent)}
}
async function rollbackConfig(){
  if(!state.server){toast('本地服务未连接，无法恢复服务端备份');return}
  if(state.dirty&&!confirm('当前页面有未保存修改，恢复备份将覆盖它们。继续吗？'))return;
  try{const result=await api('/api/config/restore',{method:'POST'});state.config={...defaults,...result.config,promptTemplates:{...defaults.promptTemplates,...result.config.promptTemplates},apiKey:state.config.apiKey||''};setLocal(localConfigKey,state.config);state.source='server';updateSourceBadges();renderCurrentPage();document.querySelector('#adminImportResult').textContent='已恢复上次服务端版本；操作前的版本也已备份。';toast('已恢复上次服务端版本')}
  catch(error){document.querySelector('#adminImportResult').textContent=`恢复失败：${error.message}`;toast(`恢复失败：${error.message}`)}
}

async function persist(next,message,patch=next){
  validateWholeConfig(next);state.saving=true;setSaveState('正在保存…');
  try{
    if(state.server){
      const payload={...patch};delete payload.keyConfigured;delete payload.apiKey;
      const result=await api('/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      state.config={...defaults,...result.config,promptTemplates:{...defaults.promptTemplates,...result.config.promptTemplates},apiKey:next.apiKey||''};state.source='server';setLocal(localConfigKey,state.config);
    }else{if(!setLocal(localConfigKey,next))throw new Error('浏览器本机存储不可用，配置未保存');state.config={...next};state.source='browser'}
    updateSourceBadges();markSaved();setSaveState(`已保存到${sourceLabels[state.source]}`);toast(`${message} · 已保存到${sourceLabels[state.source]}`);
  }finally{state.saving=false}
}

async function saveSettings(){
  const patch={mode:document.querySelector('input[name="adminMode"]:checked')?.value,provider:document.querySelector('#adminProvider').value,baseUrl:document.querySelector('#adminBaseUrl').value.trim(),model:document.querySelector('#adminModel').value.trim(),temperature:Number(document.querySelector('#adminTemperature').value),stream:document.querySelector('#adminStream').checked,autoThreshold:Number(document.querySelector('#adminThreshold').value)};
  const next={...state.config,...patch,apiKey:document.querySelector('#adminApiKey').value.trim()};
  await persist(next,'模型参数已保存，工作台下一次生成将使用新配置',patch);
}
async function savePrompts(){const patch={promptTemplates:promptValues()};await persist({...state.config,...patch},'提示词模板已保存，返回工作台后立即生效',patch)}
async function saveStyles(){const patch={creativeStyles:styleDraft.map(style=>({...style,name:style.name.trim(),instruction:style.instruction.trim()})),tonePresets:[...toneDraft]};await persist({...state.config,...patch},'创作风格与语调已保存，返回工作台后立即生效',patch)}
async function saveSources(){
  const sources=[...document.querySelectorAll('input[name="adminSource"]:checked')].map(input=>input.value),rssFeeds=rssDraft.map(feed=>({...feed}));
  if(!sources.length&&!rssFeeds.some(feed=>feed.enabled))throw new Error('至少启用一个数据源');
  if(sources.some(id=>!allowedSources.includes(id)))throw new Error('包含不支持的数据源');
  const patch={sources,rssFeeds,customRssUrl:''};
  await persist({...state.config,...patch},'数据源配置已保存',patch);
}
async function loadRecords(showToast=true){
  if(state.server)try{const result=await api(page==='dashboard'?'/api/records?all=1':'/api/records');state.records=Array.isArray(result.records)?result.records:[]}catch{state.records=getLocal(localRecordsKey,[])}
  else state.records=getLocal(localRecordsKey,[]);
  if(showToast){renderRecords();toast('运行记录已刷新')}
}
function setSaveState(text){if(text==='有未保存的修改'){updateDirty();return}document.querySelector('#adminSaveState').textContent=text}

function bind(){
  document.querySelector('#adminPrimaryAction').addEventListener('click',async event=>{
    const button=event.currentTarget;if(state.saving)return;button.disabled=true;
    try{if(button.dataset.action==='save-settings')await saveSettings();else if(button.dataset.action==='save-prompts')await savePrompts();else if(button.dataset.action==='save-styles')await saveStyles();else if(button.dataset.action==='save-sources')await saveSources();else if(button.dataset.action==='save-dashboard')await saveDashboard();else if(button.dataset.action==='open-product')openProductEditor();else await loadRecords(true)}
    catch(error){state.saving=false;setSaveState(state.dirty?'● 保存失败，修改仍未保存':'保存失败');toast(error.message)}finally{button.disabled=false}
  });
  document.querySelectorAll('.admin-nav-anchor').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.admin-nav-anchor').forEach(item=>item.classList.toggle('active',item===link))}));
  if(page==='products')window.addEventListener('beforeunload',event=>{if(!state.dirty)return;event.preventDefault();event.returnValue=''});
  if(page!=='records'&&page!=='products'){
    root.addEventListener('input',()=>queueMicrotask(updateDirty));
    root.addEventListener('change',()=>queueMicrotask(updateDirty));
    window.addEventListener('beforeunload',event=>{if(!state.dirty)return;event.preventDefault();event.returnValue=''});
    document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();document.querySelector('#adminPrimaryAction').click()}});
  }
}

async function init(){await loadData();shell();renderCurrentPage();bind()}
init().catch(error=>{root.textContent=`后台加载失败：${error.message}`});
})();
