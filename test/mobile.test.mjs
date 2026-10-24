import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBudget,newGame,restoreGame} from '../public/game.mjs';
import {photoTransform,headwearSVG} from '../public/headwear.mjs';
import {createApp} from '../server.mjs';
test('optional decimal budget remains exact, uncapped and restorable',async()=>{
 for(const [text,value] of [['',null],['  ',null],['30',3000],['300.05',30005],['0.01',1],['90071992547409.91',Number.MAX_SAFE_INTEGER]])assert.equal(parseBudget(text),value);
 for(const invalid of ['0','-1','1.001','1e3','Infinity','abc','90071992547409.92'])assert.throws(()=>parseBudget(invalid));
 const app=createApp({demo:true,log:false});
 try{
 const {places}=await app.api('places',{city:'上海',query:'人民广场'});const {stores}=await app.api('stores',{placeId:places[0].id});
 for(const budget of [null,1,30005,Number.MAX_SAFE_INTEGER]){const snapshot=await app.api('menu',{storeId:stores[0].id,budget,mode:'catalog'});const g=newGame(['甲','乙'],snapshot);assert.deepEqual(restoreGame(JSON.stringify(g)),g);}
 for(const budget of [0,-1,1.1,'30',Number.MAX_SAFE_INTEGER+1])await assert.rejects(app.api('menu',{storeId:stores[0].id,budget,mode:'catalog'}));
 }finally{await app.close();}
});
test('photo crop cannot expose empty edges and headwear keeps a transparent face opening',()=>{
 for(const [sw,sh] of [[1600,900],[900,1600]])for(const zoom of [1,2,4])for(const [ox,oy] of [[-99999,-99999],[99999,99999],[0,0]]){
 const t=photoTransform(sw,sh,940,1000,false,zoom,ox,oy);
 assert.ok(t.x<=.001&&t.y<=.001);assert.ok(t.x+sw*t.scale>=939.999&&t.y+sh*t.scale>=999.999);
 }
 for(const name of ['汉堡','薯条','可乐','麦乐鸡'])assert.match(headwearSVG(name),/<mask id="face">.*fill="black"/);
});

// Exercise the installed lost-capture handler: mobile implicit release precedes click.
test('implicit touch release preserves taps; interrupted drags still cancel',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/catalog.mjs',import.meta.url),'utf8');
 const statement=source.match(/root\.onlostpointercapture=\(\)=>\{[^\n]+/)[0];
 const ctx={root:{},drag:null,cancel:()=>{ctx.cancelled++;},cancelled:0};
 runInNewContext(statement,ctx);ctx.root.onlostpointercapture();assert.equal(ctx.cancelled,0);
 ctx.drag={moved:true};ctx.root.onlostpointercapture();assert.equal(ctx.cancelled,1);
});

test('cancelled combo loads cannot replace the next editor',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/catalog.mjs',import.meta.url),'utf8');
 const guard=source.match(/if\(!alive\|\|editing!==request\)return;/)[0];
 const first={key:null},next={key:null};
 const run=(editing,request)=>runInNewContext(`(()=>{${guard}return 'render';})()`,{alive:true,editing,request});
 assert.equal(run(next,first),undefined);assert.equal(run(null,first),undefined);assert.equal(run(next,next),'render');
});

test('headwear tap preserves position; dragging follows finger delta without snapping',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/photo.mjs',import.meta.url),'utf8');
 const handlers=source.slice(source.indexOf('    canvas.onpointerdown ='),source.indexOf('    const nudge ='));
 const ctx={canvas:{setPointerCapture(){},getBoundingClientRect:()=>({width:470,height:500})},drag:null,touched:false,activeHead:0,hats:[{x:.3,y:.4}],source:{width:940,height:1000},W:940,H:1000,fit:true,zoom:1,offsetX:0,offsetY:0,photoTransform:()=>({scale:1}),clampOffset(){},drawCrop(){}};
 runInNewContext(handlers,ctx);const ev=(x,y,id=1)=>({clientX:x,clientY:y,pointerId:id,button:0});
 ctx.canvas.onpointerdown(ev(300,300));assert.deepEqual(ctx.hats[0],{x:.3,y:.4});
 ctx.canvas.onpointermove(ev(302,300));assert.equal(ctx.hats[0].x,.3);
 ctx.canvas.onpointermove(ev(320,310,2));assert.equal(ctx.hats[0].x,.3);
 ctx.canvas.onpointermove(ev(320,310));assert.ok(Math.abs(ctx.hats[0].x-(.3+40/940))<1e-10);assert.ok(Math.abs(ctx.hats[0].y-.42)<1e-10);
 ctx.canvas.onpointerup(ev(320,310,2));assert.notEqual(ctx.drag,null);
 ctx.canvas.onpointerup(ev(320,310));assert.equal(ctx.drag,null);
});

test('headwear movement uses displayed-photo scale at phone widths and preserves rotation/size',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const text=await readFile(new URL('../public/photo.mjs',import.meta.url),'utf8');
 const handlers=text.slice(text.indexOf('    canvas.onpointerdown ='),text.indexOf('    const nudge ='));
 for(const [sw,sh] of [[1600,900],[900,1600]])for(const width of [320,375,390,430])for(const fit of [true,false])for(const zoom of [1,2,4])for(const angle of [-90,0,135]){
  const ctx={canvas:{setPointerCapture(){},getBoundingClientRect:()=>({width,height:width*1000/940})},drag:null,touched:false,activeHead:0,hats:[{x:.3,y:.4,size:.28,angle}],source:{width:sw,height:sh},W:940,H:1000,fit,zoom,offsetX:100,offsetY:-100,photoTransform,clampOffset(){},drawCrop(){}};
  runInNewContext(handlers,ctx);const ev=(x,y)=>({clientX:x,clientY:y,pointerId:1,button:0});
  ctx.canvas.onpointerdown(ev(50,50));ctx.canvas.onpointermove(ev(70,80));
  const t=photoTransform(sw,sh,940,1000,fit,zoom,100,-100),hat=ctx.hats[0];
  assert.ok(Math.abs((hat.x-.3)*sw*t.scale*width/940-20)<1e-8);
  assert.ok(Math.abs((hat.y-.4)*sh*t.scale*width/940-30)<1e-8);
  assert.equal(hat.angle,angle);assert.equal(hat.size,.28);
 }
});
