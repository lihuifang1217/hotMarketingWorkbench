(()=>{
const scenes = [
  {name:'高温消暑',news:['高温','炎热','热浪','酷暑','防晒','降温','消暑','夏日','清凉','气温'],products:['冰丝','凉感','防晒','冰饮','降温','消暑','高温','夏日']},
  {name:'运动健身',news:['运动','跑步','夜跑','马拉松','健身','瑜伽','骑行','训练','羽毛球','跳水','田径'],products:['运动','跑步','夜跑','健身','瑜伽','训练','速干','透气','羽毛球','防滑']},
  {name:'户外露营',news:['露营','户外','野餐','郊游','徒步','出游','旅行'],products:['露营','户外','野餐','便携','旅行']},
  {name:'穿搭颜值',news:['穿搭','时尚','颜值','服饰','潮流','搭配'],products:['穿搭','颜值','轻薄','国风','防晒']},
  {name:'国风文创',news:['国风','文创','非遗','传统','汉服','纹样','博物馆'],products:['国风','文创','非遗','传统','纹样']},
  {name:'亲子学生',news:['亲子','儿童','学生','开学','学习','阅读','校园'],products:['亲子','儿童','学生','开学','学习','护眼']}
];

function matchProducts(news,products) {
  if(!news || news.risk?.level!=='safe') return [];
  const hitScenes=scenes.map(scene=>({scene,hits:scene.news.filter(word=>news.title.includes(word))})).filter(x=>x.hits.length);
  if(!hitScenes.length) return [];
  return products.map(product=>{
    let best=null;
    for(const {scene,hits} of hitScenes){
      const text=[...(product.tags||[]),product.name,product.selling||''].join(' ');
      const matched=[...new Set(scene.products.filter(word=>text.includes(word)))].sort((a,b)=>Number(hits.includes(b)&&b!=='运动')-Number(hits.includes(a)&&a!=='运动'));
      if(!matched.length) continue;
      const specific=hits.filter(word=>word!=='运动'&&(product.tags||[]).includes(word)).length;
      const score=Math.min(98,48+Math.min(hits.length,3)*8+Math.min(matched.length,4)*7+Math.min(specific,2)*14);
      if(!best||score>best.score)best={product,score,scene:scene.name,reason:`热点命中「${scene.name}」场景，该商品的「${matched.slice(0,3).join('、')}」卖点契合`,hits};
    }
    return best;
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.product.price-b.product.price);
}

function newsKeywords(news) {
  const title=String(news?.title||'');
  const supplied=Array.isArray(news?.keywords)?news.keywords:typeof news?.keywords==='string'?news.keywords.split(/[,，、\s]+/):[];
  const matched=scenes.flatMap(scene=>scene.news).filter(word=>title.includes(word));
  return [...new Set([...supplied,...matched].map(word=>String(word).replace(/^#|#$/g,'').trim()).filter(Boolean))]
    .sort((a,b)=>(title.indexOf(a)<0?Infinity:title.indexOf(a))-(title.indexOf(b)<0?Infinity:title.indexOf(b)))
    .slice(0,3);
}

globalThis.HotMatching = {scenes, matchProducts, newsKeywords};

})();
