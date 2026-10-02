(()=>{
'use strict';
const headers=['名称','售价','原价','品类','卖点','图标','编号','卖点描述','背景色','商品图片','商品链接','展示模式','扩展数据'];
const required=headers.slice(0,6);
const guardCell=value=>/^[=+\-@\t\r']/.test(value)?`'${value}`:value;
const unguardCell=value=>value.startsWith("'")&&/^[=+\-@\t\r']/.test(value.slice(1))?value.slice(1):value;
const encodeCell=value=>`"${guardCell(String(value??'')).replace(/"/g,'""')}"`;

function exportJson(products){
  return JSON.stringify({format:'hot-marketing-products',version:1,products},null,2)+'\n';
}
function exportCsv(products){
  const lines=[headers.join(',')];
  for(const p of products){
    const cells=[
      p.name,p.price,p.originalPrice??globalThis.HotCatalog.originalPrice(p)??'',p.category,(p.tags||[]).join('、'),p.emoji,
      p.id,p.selling??'',p.color??'',p.image??'',p.url??'',p.artMode??'',
      JSON.stringify(p)
    ];
    lines.push(cells.map(encodeCell).join(','));
  }
  return '\ufeff'+lines.join('\r\n')+'\r\n';
}
function parseCsv(text){
  const input=String(text).replace(/^\ufeff/,'');
  const rows=[],errors=[];let row=[],field='',line=1,startLine=1,quoted=false,closed=false;
  const pushField=()=>{row.push(field);field='';closed=false};
  const pushRow=()=>{pushField();if(row.some(cell=>cell!==''))rows.push({line:startLine,cells:row});row=[];startLine=line+1};
  for(let i=0;i<input.length;i++){
    const char=input[i],newline=char==='\r'||char==='\n';
    if(quoted){
      if(char==='"'){if(input[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}
      else if(newline){field+='\n';if(char==='\r'&&input[i+1]==='\n')i++;line++}
      else field+=char;
      continue;
    }
    if(char==='"'){
      if(field||closed){errors.push({line,reason:'引号位置不正确'});return {rows,errors}}
      quoted=true;continue;
    }
    if(char===','){pushField();continue}
    if(newline){pushRow();if(char==='\r'&&input[i+1]==='\n')i++;line++;continue}
    if(closed){if(char===' '||char==='\t')continue;errors.push({line,reason:'引号结束后只能接逗号或换行'});return {rows,errors}}
    field+=char;
  }
  if(quoted)errors.push({line:startLine,reason:'引号未闭合'});
  else if(field||row.length||closed){pushField();if(row.some(cell=>cell!==''))rows.push({line:startLine,cells:row})}
  return {rows,errors};
}
function normalized(product,row,errors,allowMissingOriginal=false){
  if(!product||typeof product!=='object'||Array.isArray(product)){errors.push({line:row,reason:'商品内容不是对象'});return null}
  const p={...product};
  for(const field of ['name','category','emoji'])if(!String(p[field]??'').trim())errors.push({line:row,reason:`${{name:'名称',category:'品类',emoji:'图标'}[field]}不能为空`});
  if(String(p.name??'').length>80)errors.push({line:row,reason:'名称不能超过 80 字'});
  if(String(p.category??'').length>40)errors.push({line:row,reason:'品类不能超过 40 字'});
  if(!Array.isArray(p.tags)||!p.tags.length||p.tags.some(tag=>!String(tag).trim()))errors.push({line:row,reason:'卖点至少填写 1 个，用顿号分隔'});
  else if(p.tags.length>8||p.tags.some(tag=>String(tag).length>30)||new Set(p.tags).size!==p.tags.length)errors.push({line:row,reason:'卖点最多 8 个、每个不超过 30 字且不能重复'});
  if(p.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(String(p.color)))errors.push({line:row,reason:'背景色须为六位十六进制颜色'});
  if(String(p.selling??'').length>300)errors.push({line:row,reason:'卖点描述不能超过 300 字'});
  const price=Number(p.price),original=Number(p.originalPrice);
  if(p.price===''||p.price===null||!Number.isFinite(price)||price<=0)errors.push({line:row,reason:'售价必须是大于 0 的数字'});
  if(!(allowMissingOriginal&&p.originalPrice===undefined)){
    if(p.originalPrice===''||p.originalPrice===null||!Number.isFinite(original)||original<=0)errors.push({line:row,reason:'原价必须是大于 0 的数字'});
    else if(Number.isFinite(price)&&price>0&&original<price)errors.push({line:row,reason:'原价不能低于售价'});
  }
  if(!String(p.id??'').trim())errors.push({line:row,reason:'编号不能为空'});
  if(!errors.some(issue=>issue.line===row)){p.price=price;if(p.originalPrice!==undefined)p.originalPrice=original}
  return p;
}
function validateItems(items,lines,allowMissingOriginal=[]){
  const errors=[],products=[],ids=new Set();
  if(!Array.isArray(items)||!items.length)return {products:[],errors:[{line:1,reason:'商品列表不能为空'}]};
  items.forEach((item,index)=>{
    const line=lines?.[index]??index+1;
    const before=errors.length,p=normalized(item,line,errors,allowMissingOriginal[index]);
    if(p&&ids.has(String(p.id)))errors.push({line,reason:`编号 ${p.id} 重复`});
    if(p)ids.add(String(p.id));
    if(p&&errors.length===before)products.push(p);
  });
  return {products,errors};
}
function importJson(text){
  let data;
  try{data=JSON.parse(String(text).replace(/^\ufeff/,''))}catch{return {products:[],errors:[{line:1,reason:'不是有效的 JSON 文件'}]}}
  if(!data||data.format!=='hot-marketing-products'||data.version!==1||!Array.isArray(data.products))return {products:[],errors:[{line:1,reason:'商品 JSON 格式或版本不正确'}]};
  return validateItems(data.products,undefined,data.products.map(item=>item&&!Object.hasOwn(item,'originalPrice')));
}
function importCsv(text){
  const parsed=parseCsv(text);if(parsed.errors.length)return {products:[],errors:parsed.errors};
  if(!parsed.rows.length)return {products:[],errors:[{line:1,reason:'表格文件为空'}]};
  const names=parsed.rows[0].cells.map(cell=>cell.trim()),errors=[];
  for(const name of required)if(!names.includes(name))errors.push({line:1,reason:`缺少表头「${name}」`});
  if(new Set(names).size!==names.length)errors.push({line:1,reason:'表头不能重复'});
  if(errors.length)return {products:[],errors};
  const items=[],lines=[],legacyFlags=[],used=new Set();
  const values=parsed.rows.slice(1);
  for(const row of values){
    if(row.cells.length!==names.length){errors.push({line:row.line,reason:`列数不对：应为 ${names.length} 列，实际 ${row.cells.length} 列`});continue}
    const cells=Object.fromEntries(names.map((name,index)=>[name,unguardCell(row.cells[index])]));
    let extra={};
    if(cells['扩展数据'])try{extra=JSON.parse(cells['扩展数据']);if(!extra||typeof extra!=='object'||Array.isArray(extra))throw new Error()}catch{errors.push({line:row.line,reason:'扩展数据不是有效的 JSON 对象'});continue}
    const id=String(cells['编号']||'').trim();if(id)used.add(id);
    const item={...extra,id,name:cells['名称'],price:cells['售价'],category:cells['品类'],tags:cells['卖点'].split('、').map(tag=>tag.trim()).filter(Boolean),emoji:cells['图标']};
    if(!cells['扩展数据']){item.color='#dbeafe';item.artMode='emoji';item.selling=item.tags.join('、');item.image=''}
    const oldOriginal=globalThis.HotCatalog.originalPrice(extra);
    const unchangedLegacy=Boolean(cells['扩展数据'])&&!Object.hasOwn(extra,'originalPrice')&&Number(cells['售价'])===Number(extra.price)&&String(cells['原价'])===String(oldOriginal??'');
    if(cells['原价']!==''&&!unchangedLegacy)item.originalPrice=cells['原价'];
    else if(cells['原价']===''&&(Object.hasOwn(extra,'originalPrice')||!cells['扩展数据']||oldOriginal!==null))item.originalPrice='';
    else if(unchangedLegacy)delete item.originalPrice;
    for(const [column,key] of [['卖点描述','selling'],['背景色','color'],['商品图片','image'],['商品链接','url'],['展示模式','artMode']])if(cells[column]!==undefined){if(cells[column]!==''||Object.hasOwn(extra,key))item[key]=cells[column];else delete item[key]}
    items.push(item);lines.push(row.line);legacyFlags.push(Boolean(cells['扩展数据'])&&!Object.hasOwn(extra,'originalPrice'));
  }
  let next=1;
  for(const item of items)if(!item.id){while(used.has(`p${next}`))next++;item.id=`p${next++}`;used.add(item.id)}
  for(const item of items)if(!item.url)item.url=`product.html?id=${encodeURIComponent(item.id)}`;
  const checked=validateItems(items,lines,legacyFlags);
  return {products:checked.products,errors:[...errors,...checked.errors].sort((a,b)=>a.line-b.line)};
}
globalThis.HotProductTransfer={headers,exportJson,exportCsv,parseCsv,importJson,importCsv};
})();
