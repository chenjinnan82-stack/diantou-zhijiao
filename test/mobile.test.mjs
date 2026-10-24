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
