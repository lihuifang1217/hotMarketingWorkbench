(()=>{
const {defaultProducts,productImage}=globalThis.HotData;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function init(){
  let products=defaultProducts;
  try{const local=JSON.parse(localStorage.getItem('hot-workbench-config-v1')||'null');if(local?.products?.length)products=local.products}catch{}
  if(location.protocol!=='file:')try{const response=await fetch('/api/config',{signal:AbortSignal.timeout(5000)});if(response.ok){const data=await response.json();if(data.config?.products?.length)products=data.config.products}}catch{}
  const id=new URLSearchParams(location.search).get('id');
  const product=products.find(p=>p.id===id)||defaultProducts.find(p=>p.id===id);
  const root=document.querySelector('#productDetail');
  if(!product){root.innerHTML='<div class="card empty"><h1>未找到商品</h1><p>商品可能已从商品库移除。</p><a class="button primary" href="index.html">返回工作台</a></div>';return}
  document.title=`${product.name} · 演示商品详情`;
  root.innerHTML=`<div class="product-detail-crumb"><a href="index.html">工作台</a><span>›</span><span>商品详情</span></div><div class="card product-detail-card"><div class="product-detail-image"><img src="${esc(productImage(product))}" alt="${esc(product.name)}商品示意图"></div><div class="product-detail-content"><span class="badge purple">${esc(product.category||'商品')}</span><h1>${esc(product.name)}</h1><p class="product-detail-selling">${esc(product.selling||'暂无商品介绍')}</p><strong class="product-detail-price">¥${Number(product.price)||0}</strong><div class="product-detail-tags">${(product.tags||[]).map(tag=>`<span>${esc(tag)}</span>`).join('')}</div><div class="info-box">本页是原型中的演示商品详情，图片为示意图。若需跳转真实店铺，可在商品库 JSON 的 url 字段配置 HTTPS 商品链接。</div><a class="button primary" href="index.html">返回工作台</a></div></div>`;
}
init();
})();
