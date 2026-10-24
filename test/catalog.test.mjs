import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp,BASE} from '../server.mjs';
import {catalogFrom,detailFrom,configuredMeal} from '../mcp.mjs';
import {findPlaces} from '../places.mjs';
import {demoCatalog,demoDetail,demoPlaces} from './demo.mjs';
import {newGame,transition,restoreGame,readyTray,results,trayMeal,compareMeals} from '../public/game.mjs';
import {orderSVG} from '../public/art.mjs';

async function open(app){const {places}=await app.api('places',{city:'上海',query:'人民广场'});const {stores}=await app.api('stores',{placeId:places[0].id});return app.api('menu',{storeId:stores[0].id,budget:3000,mode:'catalog'});}
const piece=(v,key=v.id)=>({key,productId:v.productId,id:v.id,x:.3,y:.4});
test('full catalog keeps all food, deduplicates codes and validates configurable eight-piece bundles',()=>{
 const menu=demoCatalog();menu.categories.push(menu.categories[0]);menu.meals['888']={name:'旋旋星愿贴'};menu.meals['889']={name:'麦当劳限定丝巾'};
 const catalog=catalogFrom(menu);assert.equal(catalog.products.length,39);assert.equal(new Set(catalog.products.map(p=>p.id)).size,39);assert.ok(!catalog.products.some(p=>p.id==='888'));
 const d=detailFrom(demoDetail('902'),catalog.products.find(p=>p.id==='902'));
 const configured=configuredMeal(d);assert.equal(configured.items.reduce((n,i)=>n+i.quantity,0),8);
 assert.match(orderSVG({combo:true,items:configured.items}),/>8件套<\/text>/);assert.match(orderSVG({combo:true,items:[{name:d.name}]}),/>套餐<\/text>/);
 const custom=structuredClone(configured.selections);custom[2].choices=[{id:'301',quantity:1},{id:'303',quantity:1}];
 const result=configuredMeal(d,custom);assert.equal(result.items.filter(i=>i.group==='drink').length,2);assert.equal(result.request.productCode,'902');
 for(const invalid of [[...custom,custom[0]],[],custom.map((s,i)=>i===2?{...s,choices:[{id:'forged',quantity:2}]}:s),custom.map((s,i)=>i===2?{...s,choices:[{id:'301',quantity:3}]}:s)])assert.throws(()=>configuredMeal(d,invalid),e=>e.code==='CHOICE');
});
test('catalog game retains pending choices, allows over-budget meals, seals all four answers and restores old rounds',async()=>{
 const app=createApp({demo:true,log:false});const snapshot=structuredClone(await open(app));
 const a=await app.api('item',{snapshotId:snapshot.id,productId:'901'}),b=await app.api('item',{snapshotId:snapshot.id,productId:'902'});
 snapshot.variants.push(a.variant,b.variant);
 let g=newGame(['甲','乙'],snapshot);assert.equal(g.version,3);
 const pending={key:'pending',productId:'901',id:null,x:.3,y:.4};
 g=transition(g,'choose',[pending]);assert.deepEqual(restoreGame(JSON.stringify(g)),g);assert.equal(readyTray(snapshot,g.answers.a.self),false);assert.throws(()=>transition(g,'next'));
 const aTray=[piece(a.variant)],bTray=[piece(b.variant)];
 const boundary={...snapshot,budget:a.variant.price*2};
 for(const count of [1,2,3]){const tray=Array.from({length:count},(_,i)=>piece(a.variant,String(i)));assert.equal(readyTray(boundary,tray),true);assert.equal(trayMeal(boundary,tray).price-boundary.budget,(count-2)*a.variant.price);assert.doesNotThrow(()=>transition(transition(newGame(['甲','乙'],boundary),'choose',tray),'next'));}
 const apply=(e,v)=>{g=transition(g,e,v);assert.deepEqual(restoreGame(JSON.stringify(g)),g);};
 apply('choose',aTray);assert.ok(trayMeal(snapshot,aTray).price>snapshot.budget);apply('next');apply('choose',bTray);apply('next');assert.throws(()=>transition(g,'back'));
 apply('receive');apply('choose',bTray);apply('next');apply('choose',aTray);apply('next');apply('reveal');assert.ok(results(g).every(r=>r.exact));
 const meal=trayMeal(snapshot,bTray);assert.equal(meal.orders.length,1);assert.equal(meal.items.reduce((n,i)=>n+i.quantity,0),8);assert.equal(compareMeals(meal,{items:structuredClone(meal.items)}).exact,true);
 assert.throws(()=>transition(newGame(['甲','乙'],snapshot),'choose',Array.from({length:7},(_,i)=>piece(a.variant,String(i)))));
 const bad=structuredClone(g);bad.answers.a.self[0].id=null;assert.equal(restoreGame(JSON.stringify(bad)),null);await app.close();
});
test('item API is lazy, merges repeated work, preserves parent requests, rejects forged choices and mixed-snapshot IDs',async()=>{
 const calls=[];let failQuote=false;
 const app=createApp({log:false,locate:demoPlaces,call:async(tool,args)=>{
  calls.push({tool,args});
  if(tool==='query-nearby-stores')return[{storeCode:'12345',storeName:'公开测试门店',businessStatus:true}];
  if(tool==='query-meals')return demoCatalog();if(tool==='query-meal-detail')return demoDetail(args.code);
  if(tool==='calculate-price'){if(failQuote)throw Object.assign(new Error('temporary failure'),{code:'UPSTREAM'});return{price:args.items.reduce((n,i)=>n+5000*i.quantity,0)};}
 }});
 const snapshot=await open(app);assert.equal(calls.filter(c=>c.tool==='query-meal-detail').length,0);
 const items=await Promise.all([0,1].map(()=>app.api('item',{snapshotId:snapshot.id,productId:'902'})));
 assert.equal(items[0].variant.id,items[1].variant.id);assert.equal(calls.filter(c=>c.tool==='query-meal-detail').length,1);assert.equal(calls.filter(c=>c.tool==='calculate-price').length,1);
 await assert.rejects(app.api('item',{snapshotId:snapshot.id,productId:'forged'}),e=>e.code==='MEAL');
 await assert.rejects(app.api('item',{snapshotId:snapshot.id,productId:'902',selections:[]}),e=>e.code==='CHOICE');
 const second=await open(app);await assert.rejects(app.api('quote',{snapshotId:second.id,trays:[[items[0].variant.id]]}),e=>e.code==='MEAL');
 const single=await app.api('item',{snapshotId:snapshot.id,productId:'201'});
 const quote=await app.api('quote',{snapshotId:snapshot.id,trays:[[items[0].variant.id,items[0].variant.id,single.variant.id]]});assert.equal(quote.quotes[0].price,15000);
 const actual=calls.at(-1).args.items;assert.equal(actual[0].quantity,2);assert.equal(actual[0].productCode,'902');assert.equal(actual[0].roundList[2].comboItemList[0].quantity,2);
 failQuote=true;await assert.rejects(app.api('item',{snapshotId:snapshot.id,productId:'202'}));failQuote=false;assert.ok((await app.api('item',{snapshotId:snapshot.id,productId:'202'})).variant);
 await assert.rejects(app.api('item',{snapshotId:'expired',productId:'201'}),e=>e.code==='EXPIRED');await app.close();
});
test('location validates text and GPS, rejects weak fixes, never turns a nonsense keyword into stores',async()=>{
 const calls=[];const request=async url=>{calls.push(url);const path=url.pathname;return{ok:true,json:async()=>path.includes('/translate')?{status:0,locations:[{lat:31.2,lng:121.4}]}:path.includes('/geocoder')?{status:0,result:{address_component:{city:'上海市'},address:'上海市黄浦区人民广场',ad_info:{nation_code:'156'}}}:{status:0,data:[{title:url.searchParams.get('keyword')==='无效星球'?'星球乐园':'人民广场',city:'上海市',address:'上海市黄浦区',type:0}]}};};
 const empty=await findPlaces({city:'上海',query:'无效星球'},'test-only',request);assert.deepEqual(empty,[]);
 assert.equal((await findPlaces({city:'上海',query:'人民广场'},'test-only',request))[0].name,'人民广场');assert.equal(calls.at(-1).searchParams.get('region_fix'),'1');
 assert.equal((await findPlaces({city:'上海市',query:'上海人民广场'},'test-only',request))[0].name,'人民广场');
 assert.deepEqual(await findPlaces({city:'不存在的城市',query:'人民广场'},'test-only',request),[]);
 const gps=await findPlaces({coords:{latitude:31.2,longitude:121.4,accuracy:30}},'test-only',request);assert.equal(gps[0].source,'gps');assert.equal(calls.at(-2).searchParams.get('type'),'1');
 await assert.rejects(findPlaces({coords:{latitude:31,longitude:121,accuracy:2000}},'test-only',request),e=>e.code==='LOCATION_COARSE');
 await assert.rejects(findPlaces({coords:{latitude:99,longitude:121,accuracy:30}},'test-only',request),e=>e.code==='INPUT');
 await assert.rejects(findPlaces({city:'上海',query:'广场'},''),e=>e.code==='MAP_UNCONFIGURED');
 await assert.rejects(findPlaces({city:'上海',query:'广场'},'test-only',async()=>{throw new DOMException('timeout','TimeoutError');}),e=>e.code==='MAP_TIMEOUT');
 for(const [status,code] of [[120,'MAP_BUSY'],[121,'MAP_QUOTA'],[112,'MAP']])await assert.rejects(findPlaces({city:'上海',query:'广场'},'test-only',async()=>({ok:true,json:async()=>({status,message:'private upstream details'})})),e=>e.code===code&&!e.message.includes('private'));
 let storeCalls=0;const app=createApp({locate:async()=>[],call:async()=>{storeCalls++;return[];},log:false});
 assert.deepEqual((await app.api('places',{city:'上海',query:'无效星球'})).places,[]);
 await assert.rejects(app.api('stores',{city:'上海',query:'无效星球'}),e=>e.code==='LOCATION_REQUIRED');assert.equal(storeCalls,0);
 await assert.rejects(app.api('stores',{placeId:'forged'}),e=>e.code==='PLACE_EXPIRED');await app.close();
});
test('scrolling item requests have their own limit and all APIs retain body and origin boundaries',async t=>{
 const app=createApp({demo:true,log:false});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.close());
 const snapshot=await open(app),base=`http://127.0.0.1:${app.server.address().port}${BASE}api/`;
 const post=async(route,body,headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 for(let i=0;i<25;i++)assert.equal((await post('item',{snapshotId:snapshot.id,productId:'901'})).status,200);
 assert.equal((await post('item',{snapshotId:snapshot.id,productId:'901'},{Origin:'https://untrusted.example'})).status,403);
 assert.equal((await post('item',{snapshotId:snapshot.id,productId:'x'.repeat(9000)})).status,413);
 const page=await fetch(base.replace('api/',''));assert.match(page.headers.get('Permissions-Policy'),/geolocation=\(self\)/);
});
