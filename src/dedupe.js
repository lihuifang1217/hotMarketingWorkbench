(()=>{
function titleSimilarity(a,b){
  const clean=s=>String(s||'').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
  a=clean(a);b=clean(b);if(a===b)return 1;
  if(Math.min(a.length,b.length)>=8&&(a.includes(b)||b.includes(a)))return .95;
  const grams=s=>{const out=new Set();for(let i=0;i<s.length-1;i++)out.add(s.slice(i,i+2));return out};
  const x=grams(a),y=grams(b);if(!x.size||!y.size)return 0;
  const overlap=[...x].filter(v=>y.has(v)).length;
  return 2*overlap/(x.size+y.size);
}
function dedupeBatch(items,threshold=.55){
  const kept=[];
  for(const item of [...items].sort((a,b)=>a.rank-b.rank)){
    const match=kept.find(row=>titleSimilarity(row.title,item.title)>=threshold);
    if(match){match.sources=[...new Set([...(match.sources||[match.source]),item.source])];match.duplicateCount=(match.duplicateCount||0)+1;}
    else kept.push({...item,sources:item.sources||[item.source],duplicateCount:0});
  }
  return kept;
}
function recentPublication(title,records,days=3){
  const cutoff=Date.now()-days*86400000;
  return records.find(r=>r.type==='publish'&&r.title&&new Date(r.time).getTime()>cutoff&&titleSimilarity(title,r.title)>=.55);
}

globalThis.HotDedupe = {titleSimilarity, dedupeBatch, recentPublication};

})();
