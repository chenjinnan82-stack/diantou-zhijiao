import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { newGame, transition, restoreGame, results, trayMeal, trayKey, describeItems, validTray } from '../public/game.mjs';
import { demoTrayMenu, demoPlaces } from './demo.mjs';
import { buildTrayMenu, singleCandidates, classify } from '../mcp.mjs';
import { createApp, BASE } from '../server.mjs';

const piece = (id, x=.3, y=.4) => ({ id, x, y });
test('tray flow: duplicates, arranging, empty trays, sealing and restoring', () => {
  let g = newGame(['甲','乙'],demoTrayMenu());
  const own = ['test-101','test-201','test-201'].map(id=>piece(id));
  const other = ['test-102','test-301'].map(id=>piece(id));
  const apply = (event,value) => { g=transition(g,event,value); assert.deepEqual(restoreGame(JSON.stringify(g)),g); };
  assert.equal(g.version,2); assert.throws(()=>transition(g,'next'));
  apply('choose',[]); assert.throws(()=>transition(g,'next'));
  assert.throws(()=>transition(g,'choose',[piece('unknown')]));
  assert.throws(()=>transition(g,'choose',[piece('test-101',2)]));
  assert.equal(validTray(g.snapshot,Array(7).fill(piece('test-101'))),false);
  apply('choose',own); apply('next'); apply('choose',other); apply('next');
  assert.throws(()=>transition(g,'back')); assert.throws(()=>results(g));
  apply('receive'); apply('choose',other); apply('next');
  apply('choose',[...own].reverse().map(p=>({...p,x:.6,y:.7}))); apply('next'); apply('reveal');
  assert.ok(results(g).every(r=>r.exact));
  assert.equal(trayMeal(g.snapshot,own).price,5000);
  assert.match(describeItems(trayMeal(g.snapshot,own).items),/薯条 × 2/);
  assert.equal(trayKey(own),trayKey([...own].reverse()));
  const bad=structuredClone(g); bad.answers.a.self=[]; assert.equal(restoreGame(JSON.stringify(bad)),null);
  bad.answers.a.self=[piece('unknown')]; assert.equal(restoreGame(JSON.stringify(bad)),null);
});

const catalog = { categories: [], meals: {
  '101': {name:'汉堡',currentPrice:'0.01'}, '102':{name:'麦香鱼',currentPrice:'1'},
  '201': {name:'薯条',currentPrice:'1'}, '202':{name:'奥利奥抹茶麦旋风',currentPrice:'1'},
  '301': {name:'雪碧',currentPrice:'1'}, '302':{name:'咖啡',currentPrice:'1'}, '303':{name:'可乐',currentPrice:'1'},
  '401': {name:'单人套餐',currentPrice:'1'}, '402':{name:'会员专享餐',discountType:'麦金卡专享'},
  '403': {name:'旋旋星愿贴',currentPrice:'0.01'},
  '501': {name:'可选购卡汉堡',canWithOrder:true,withOrder:{cardId:'never-send'},discountType:'随单购早餐卡优惠'}
} };
function fakeCall(record=[]) {
  return async (tool,args) => {
    record.push({tool,args});
    if(tool==='query-nearby-stores') return [{storeCode:'12345',storeName:'测试店',businessStatus:true}];
    if(tool==='query-meals') return catalog;
    if(tool==='query-meal-detail') return {code:args.code,name:args.code==='301'?'雪碧（小杯）':catalog.meals[args.code].name,rounds:args.code==='102'?[{complex:true}]:args.code==='303'?[{id:1,quantity:1,minQuantity:1,maxQuantity:1,choices:[{code:'3000',name:'可乐小杯',isDefault:1,maxQuantity:-1}]}]:[]};
    if(tool==='calculate-price') return {price:args.items.reduce((s,i)=>s+i.quantity*1100,0),conditions:['限当前门店']};
    throw new Error('unexpected tool');
  };
}
test('single products use detail size and verified quotes, skip complex items and member-only offers',async()=>{
  assert.equal(classify('奥利奥抹茶麦旋风'),'side');
  const list=singleCandidates(catalog); assert.ok(!list.some(p=>['401','402','403'].includes(p.code))); assert.ok(list.some(p=>p.code==='501'));
  const record=[], result=await buildTrayMenu(fakeCall(record),{id:'12345',name:'测试店'},1000);
  assert.ok(result.snapshot.products.length>=3); assert.ok(result.snapshot.products.every(p=>p.price===1100));
  assert.ok(!result.snapshot.products.some(p=>p.code==='102'));
  assert.equal(result.snapshot.products.find(p=>p.code==='301').name,'雪碧（小杯）');
  const coke=result.snapshot.products.find(p=>p.code==='3000'); assert.equal(coke.name,'可乐小杯');
  assert.deepEqual(result.requests.get(coke.id),{productCode:'303',quantity:1,roundList:[{round:'1',comboItemList:[{code:'3000',quantity:1}]}]});
  for(const q of record.filter(q=>q.tool==='calculate-price')) assert.ok(Object.keys(q.args.items[0]).every(k=>['productCode','quantity','roundList'].includes(k)));
  assert.ok(!JSON.stringify(record).includes('never-send'));
});
test('tray HTTP only accepts current IDs; server aggregates quantities, shares menu work and keeps budget as reference',async t=>{
  const record=[], app=createApp({locate:demoPlaces,call:fakeCall(record),log:false}); app.server.listen(0,'127.0.0.1'); await once(app.server,'listening'); t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}${BASE}api/`;
  const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  await post('stores',{city:'上海',query:'人民广场'});
  const request={mode:'tray',storeId:'12345',budget:1000};
  const menus=await Promise.all([post('menu',request),post('menu',{...request,budget:4000})]);
  assert.ok(menus.every(m=>m.status===200)); assert.equal(record.filter(r=>r.tool==='query-meals').length,1);
  assert.equal(menus[1].data.budget,4000); assert.notEqual(menus[0].data.id,menus[1].data.id);
  const menu=menus[0].data, id=menu.products[0].id, p2=menu.products[1].id;
  for(const trays of [[],[[]],[['forged']],[[{productCode:'101',price:1}]],[Array(7).fill(id)]]) assert.equal((await post('quote',{snapshotId:menu.id,trays})).status,400);
  const basket={snapshotId:menu.id,trays:[[id,id,p2],[p2,id,id]],price:1};
  const q=await post('quote',basket); assert.equal(q.status,200); assert.equal(q.data.quotes.length,1); assert.equal(q.data.quotes[0].price,3300);
  assert.deepEqual(Object.fromEntries(record.at(-1).args.items.map(i=>[i.productCode,i.quantity])),{[menu.products[0].code]:2,[menu.products[1].code]:1});
  const count=record.length; await post('quote',basket); assert.equal(record.length,count);
  assert.equal((await post('quote',{...basket,snapshotId:'expired'})).status,410);
});
test('failed whole-tray quote stays retryable and never fabricates a price',async()=>{
  const calls=[], upstream=fakeCall(calls); let fail=false;
  const app=createApp({locate:demoPlaces,call:async(tool,args)=>{if(fail&&tool==='calculate-price')throw Object.assign(new Error('temporarily unavailable'),{code:'UPSTREAM'});return upstream(tool,args);},log:false});
  await app.api('stores',{city:'上海',query:'人民广场'});
  const menu=await app.api('menu',{mode:'tray',storeId:'12345',budget:3000});
  fail=true;
  const q=await app.api('quote',{snapshotId:menu.id,trays:[[menu.products[0].id]]});
  assert.equal(q.quotes[0].available,null);assert.equal(q.quotes[0].price,null);
  assert.equal(menu.products[0].price,1100);
  // The same basket can recover immediately; failure never mutates the fixed local menu.
  fail=false;
  const retry=await app.api('quote',{snapshotId:menu.id,trays:[[menu.products[0].id]]});
  assert.equal(retry.quotes[0].price,1100);
});
