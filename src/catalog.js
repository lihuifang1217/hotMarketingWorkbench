(()=>{
'use strict';
const {defaultProducts,productImage,productUrl}=globalThis.HotData;
const builtins=new Map(defaultProducts.map(product=>[product.id,product]));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2});
function originalPrice(product){
  const price=Number(product.price),explicit=Number(product.originalPrice);
  if(Object.hasOwn(product,'originalPrice'))return Number.isFinite(price)&&Number.isFinite(explicit)&&explicit>0&&explicit>=price?explicit:null;
  const builtin=builtins.get(product.id);
  if(builtin&&product.name===builtin.name&&price===builtin.price)return builtin.originalPrice;
  return null;
}
function summary(products){
  const list=Array.isArray(products)?products:[];
  const prices=list.map(p=>Number(p.price)).filter(Number.isFinite);
  const rates=list.map(p=>{const original=originalPrice(p),price=Number(p.price);return original&&Number.isFinite(price)?(original-price)/original:null}).filter(value=>value!==null);
  return {total:list.length,categories:new Set(list.map(p=>String(p.category||'未分类'))).size,min:prices.length?prices.reduce((min,value)=>Math.min(min,value),Infinity):null,max:prices.length?prices.reduce((max,value)=>Math.max(max,value),-Infinity):null,averageDiscount:rates.length?rates.reduce((sum,value)=>sum+value,0)/rates.length:null,discountCount:rates.length};
}
function filterSort(products,{query='',category='',sort='category'}={}){
  const needle=String(query).trim().toLocaleLowerCase();
  const result=(Array.isArray(products)?products:[]).filter(product=>{
    const searchable=[product.name,product.selling,...(Array.isArray(product.tags)?product.tags:[])].join(' ').toLocaleLowerCase();
    return (!needle||searchable.includes(needle))&&(!category||String(product.category||'未分类')===category);
  });
  const chinese=(a,b)=>String(a).localeCompare(String(b),'zh-CN');
  result.sort((a,b)=>{
    if(sort==='price-asc')return Number(a.price)-Number(b.price)||chinese(a.name,b.name);
    if(sort==='price-desc')return Number(b.price)-Number(a.price)||chinese(a.name,b.name);
    if(sort==='category-desc')return chinese(b.category||'未分类',a.category||'未分类')||chinese(a.name,b.name);
    return chinese(a.category||'未分类',b.category||'未分类')||chinese(a.name,b.name);
  });
  return result;
}
function paginate(products,{page=1,pageSize=10}={}){
  const list=Array.isArray(products)?products:[];
  const size=[5,10,20,50,100].includes(Number(pageSize))?Number(pageSize):10;
  const pages=Math.max(1,Math.ceil(list.length/size));
  const current=Math.max(1,Math.min(pages,Math.trunc(Number(page))||1));
  const offset=(current-1)*size;
  return {items:list.slice(offset,offset+size),page:current,pages,pageSize:size,total:list.length,start:list.length?offset+1:0,end:Math.min(offset+size,list.length)};
}
function nextId(products){const used=new Set((Array.isArray(products)?products:[]).map(product=>String(product.id)));let index=1;while(used.has(`p${index}`))index++;return `p${index}`}
function copyProduct(product,products){
  const copy=JSON.parse(JSON.stringify(product));
  copy.id=nextId(products);
  copy.name=`${String(product.name||'').slice(0,75)}（副本）`;
  copy.originalPrice=originalPrice(product)??'';
  if(!copy.url||/^product\.html\?id=/.test(copy.url))copy.url=`product.html?id=${encodeURIComponent(copy.id)}`;
  return copy;
}
function recommendationReferences(newsItems,products,matchProducts){
  const references=new Map((Array.isArray(products)?products:[]).map(product=>[String(product.id),[]]));
  const seen=new Set();
  for(const news of Array.isArray(newsItems)?newsItems:[]){
    const title=String(news?.title||'').trim();
    if(!title||seen.has(title))continue;
    seen.add(title);
    for(const match of matchProducts(news,products))references.get(String(match.product.id))?.push(title);
  }
  return references;
}
function bulkChange(products,selectedIds,{type,category=''}={}){
  const ids=new Set([...selectedIds].map(String)),found=new Set(),skipped=[];
  const name=String(category).trim();
  if(type==='category'&&(!name||name.length>40))throw new Error('品类须填写 1–40 个字');
  if(type==='delete'&&ids.size>=products.length&&products.every(product=>ids.has(String(product.id))))return {products:[...products],success:0,skipped:[...ids].map(id=>({id,reason:'商品库至少保留 1 件商品'}))};
  const result=[];let success=0;
  for(const product of products){
    const id=String(product.id);
    if(!ids.has(id)){result.push(product);continue}
    found.add(id);
    if(type==='category'){
      if(product.category===name){skipped.push({id,reason:'品类未变化'});result.push(product)}
      else{result.push({...product,category:name});success++}
    }else if(type==='delete')success++;
    else throw new Error('不支持的批量操作');
  }
  for(const id of ids)if(!found.has(id))skipped.push({id,reason:'商品已不存在'});
  return {products:result,success,skipped};
}
function validateProduct(product,{products=[],editingId=null}={}){
  const errors={},id=String(product.id||''),name=String(product.name||'').trim(),category=String(product.category||'').trim();
  const price=Number(product.price),original=Number(product.originalPrice),tags=product.tags;
  if(!id)errors.id='商品编号不能为空';
  else if(products.some(item=>String(item.id)===id&&String(item.id)!==String(editingId)))errors.id='商品编号已存在，请重新生成';
  if(!name)errors.name='请输入商品名称';else if(name.length>80)errors.name='商品名称不能超过 80 字';
  if(!String(product.emoji||'').trim())errors.emoji='请选择或输入一个商品图标';
  if(!/^#[0-9a-f]{6}$/i.test(String(product.color||'')))errors.color='请选择一个背景配色';
  if(!Number.isFinite(price)||price<=0)errors.price='售价必须大于 0';
  if(!Number.isFinite(original)||original<=0)errors.originalPrice='原价必须大于 0';
  else if(Number.isFinite(price)&&price>0&&original<price)errors.originalPrice='原价不能低于售价';
  if(!category)errors.category='请输入或选择品类';else if(category.length>40)errors.category='品类不能超过 40 字';
  if(!Array.isArray(tags)||!tags.length)errors.tags='至少添加 1 个卖点标签';
  else if(tags.length>8||tags.some(tag=>!String(tag).trim()||String(tag).length>30)||new Set(tags).size!==tags.length)errors.tags='最多 8 个标签，每个不超过 30 字且不能重复';
  if(String(product.selling||'').length>300)errors.selling='卖点描述不能超过 300 字';
  return errors;
}
function renderCard(product,{selected=false,match=null,action='link'}={}){
  const original=originalPrice(product),price=Number(product.price);
  const color=/^#[0-9a-f]{6}$/i.test(String(product.color||''))?product.color:'#eef2ff';
  const tags=(Array.isArray(product.tags)?product.tags:[]).slice(0,3).map(tag=>`<span class="product-tag">${escapeHtml(tag)}</span>`).join('');
  const actionHtml=action==='select'?`<button class="button small ${selected?'soft':'primary'}" data-product="${escapeHtml(product.id)}">${selected?'✓ 已采纳':'＋ 采纳'}</button>`:action==='edit'?`<button class="button small" type="button" data-edit-product="${escapeHtml(product.id)}">编辑商品</button>`:action==='link'?`<a class="button small" href="${escapeHtml(productUrl(product))}" target="_blank" rel="noopener noreferrer">查看商品 ↗</a>`:'';
  return `<div class="card product-card ${selected?'picked':''}" style="--product-color:${color}"><div class="product-art"><img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.name)}商品示意图" loading="lazy"></div><div class="product-body"><div class="product-top"><strong>${escapeHtml(product.name)}</strong><span class="product-price-stack"><b class="price">¥${money(price)}</b>${original?`<del>¥${money(original)}</del>`:''}</span></div><p>${escapeHtml(product.selling||'暂无卖点')}</p><div class="product-labels"><span class="badge">${escapeHtml(product.category||'未分类')}</span>${match?`<span class="badge purple">匹配度 ${Number(match.score)||0}% · ${escapeHtml(match.scene)}</span>`:''}</div>${match?`<div class="product-reason">${escapeHtml(match.reason)}</div>`:''}<div class="product-foot"><span class="product-tags">${tags}</span>${actionHtml}</div></div></div>`;
}
globalThis.HotCatalog={escapeHtml,money,originalPrice,summary,filterSort,paginate,nextId,copyProduct,recommendationReferences,bulkChange,validateProduct,renderCard};
})();
