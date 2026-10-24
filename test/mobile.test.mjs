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

test('direct headwear selection and pinch preserve anchors across finger transitions',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const {moveHeadwear,hitHeadwear}=await import('../public/headwear.mjs');
 const source=await readFile(new URL('../public/photo.mjs',import.meta.url),'utf8');
 const handlers=source.slice(source.indexOf('    const pointers=new Map()'),source.indexOf('    const nudge ='));
 const hats=[{x:.3,y:.4,size:.28,angle:0,visible:true},{x:.8,y:.7,size:.2,angle:0,visible:true}];
 const ctx={canvas:{setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:940,height:1000})},touched:false,activeHead:-1,hats,source:{width:940,height:1000},W:940,H:1000,fit:true,zoom:1,offsetX:0,offsetY:0,photoTransform,moveHeadwear,hitHeadwear,clampOffset(){},drawCrop(){},hatOptions(){},$:()=>({value:0})};
 runInNewContext(handlers,ctx);const ev=(x,y,id=1)=>({clientX:x,clientY:y,pointerId:id,button:0});
 ctx.canvas.onpointerdown(ev(250,400));assert.equal(ctx.activeHead,0);assert.equal(hats[0].x,.3);
 ctx.canvas.onpointermove(ev(270,400));assert.ok(Math.abs(hats[0].x-(.3+20/940))<1e-10);
 ctx.canvas.onpointerdown(ev(350,400,2));const before={...hats[0]};
 ctx.canvas.onpointermove(ev(350,480,2));assert.ok(hats[0].size>before.size);assert.ok(Math.abs(hats[0].angle-45)<1e-10);
 ctx.canvas.onpointerup(ev(350,480,2));const after={...hats[0]};ctx.canvas.onpointermove(ev(270,400));assert.deepEqual(hats[0],after);
 ctx.canvas.onpointermove(ev(280,400));assert.ok(Math.abs(hats[0].x-after.x-10/940)<1e-10);assert.equal(hats[0].angle,after.angle);
 ctx.canvas.onpointercancel(ev(280,400));ctx.canvas.onpointermove(ev(500,500));assert.equal(hats[0].angle,after.angle);
 ctx.canvas.onpointerdown(ev(752,700));assert.equal(ctx.activeHead,1);ctx.canvas.onpointerup(ev(752,700));
 // Release either finger first, then re-add it: each new baseline must be stationary.
 for(const released of [1,2]){
  hats[0]={x:.3,y:.4,size:.28,angle:0,visible:true};ctx.resetGesture();
  ctx.canvas.onpointerdown(ev(250,400));ctx.canvas.onpointerdown(ev(350,400,2));
  ctx.canvas.onpointermove(ev(350,460,2));const snapshot={...hats[0]};
  ctx.canvas.onpointerdown(ev(100,100,3));ctx.canvas.onpointerup(ev(100,100,3));assert.deepEqual(hats[0],snapshot);
  ctx.canvas.onpointerup(released===1?ev(250,400):ev(350,460,2));
  ctx.canvas.onlostpointercapture(released===1?ev(250,400):ev(350,460,2));
  const remaining=released===1?ev(350,460,2):ev(250,400);ctx.canvas.onpointermove(remaining);assert.deepEqual(hats[0],snapshot);
  ctx.canvas.onpointerdown(released===1?ev(250,400):ev(350,460,2));ctx.canvas.onpointermove(remaining);assert.ok(Math.abs(hats[0].x-snapshot.x)<1e-10);assert.ok(Math.abs(hats[0].angle-snapshot.angle)<1e-10);
 }
 // Switching the player control while a finger is still down cancels the old gesture.
 const targetButton={dataset:{target:'1'}};ctx.container={querySelectorAll:()=>[targetButton]};
 runInNewContext(source.split('\n').find(line=>line.includes('activeHead=Number(b.dataset.target)')),ctx);
 const other={...hats[1]};targetButton.onclick();ctx.canvas.onpointermove(ev(400,600));assert.deepEqual(hats[1],other);
 ctx.canvas.onpointerup(ev(400,600));ctx.canvas.onpointerup(ev(350,460,2));
 for(const [width,height] of [[1600,900],[900,1600]])for(const angle of [-90,0,135]){
  const h={x:.3,y:.4,size:.28,angle,visible:true},p={x:h.x*width,y:h.y*height};assert.ok(hitHeadwear(h,p,width,height));
  const moved=moveHeadwear(h,[p],[{x:p.x+20,y:p.y+30}],width,height);assert.ok(Math.abs((moved.x-h.x)*width-20)<1e-8);assert.ok(Math.abs((moved.y-h.y)*height-30)<1e-8);assert.equal(moved.size,h.size);assert.equal(moved.angle,angle);
  const unchanged=moveHeadwear(h,[p,{x:p.x+100,y:p.y}],[p,{x:p.x+100,y:p.y}],width,height);assert.ok(Math.abs(unchanged.x-h.x)<1e-10);assert.ok(Math.abs(unchanged.y-h.y)<1e-10);
 }
});
