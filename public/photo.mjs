let lastInvite = -1;
import { headwearSVG, photoTransform, moveHeadwear, hitHeadwear } from './headwear.mjs';
import { results, describeItems, purchaseSummary, escapeHTML as e } from './game.mjs';
import { foodSVG, mealSVG, envelopeSVG } from './art.mjs';
const W = 940, H = 1000, PAPER = '#E5E0D2', INK = '#25231F';
const imageFrom = url => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('无法读取这张照片，请试试 JPG、PNG 或截图。')); img.src = url; });
const svgImage = svg => imageFrom(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
function lines(ctx, text, width) {
  const output = []; let line = '';
  for (const char of Array.from(text)) { if (ctx.measureText(line + char).width > width && line) { output.push(line); line = ''; } line += char; }
  if (line) output.push(line); return output;
}
function block(ctx, text, x, y, width, height, max = 28, family = 'sans-serif') {
  let size = max, wrapped;
  do {
    ctx.font = `${size}px ${family}`; wrapped = lines(ctx, text, width);
    const balanced = wrapped.length === 1 || Array.from(wrapped.at(-1)).length >= 4 || size <= 16;
    if (wrapped.length * size * 1.4 <= height && balanced) break;
    if (size <= 1) break;
    size--;
  } while (size >= 1);
  wrapped.forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.4));
}
function paperRect(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; }

export function createPhoto({ game, toast }) {
  let container, back, source, outputURL, outputFile, zoom = 1, offsetX = 0, offsetY = 0, mode = 'choose', busy = false, imageVersion = 0, active = true;
  const outcome = results(game), cache = new Map();
  let worker, detectionTimer, faces=[], activeHead=-1, fit=true, retro=true, touched=false;
  const choices=outcome.map(r=>r.actual.items);
  const hats=choices.map(items=>({item:items.findIndex(i=>i.group==='main')>=0?items.findIndex(i=>i.group==='main'):0,x:.5,y:.35,size:.28,angle:0,visible:false}));
  const stopDetection=()=>{clearTimeout(detectionTimer);worker?.terminate();worker=null;};
  const resetHats=()=>{hats.forEach((h,i)=>Object.assign(h,{x:i?.68:.32,y:.35,size:.28,angle:0,visible:false}));faces=[];touched=false;activeHead=-1;};
  async function detect(){
    stopDetection();const version=imageVersion;error('正在定位脸部…');
    try{
      worker=new Worker(new URL('./face-worker.mjs',import.meta.url));
      const scale=Math.min(1,640/Math.max(source.width,source.height));
      const bitmap=await createImageBitmap(source,{resizeWidth:Math.round(source.width*scale),resizeHeight:Math.round(source.height*scale)});
      if(version!==imageVersion||!worker){bitmap.close();return;}
      detectionTimer=setTimeout(()=>{stopDetection();if(active)error('可点选人物，手动放置头套。');},10000);
      worker.onmessage=({data})=>{stopDetection();if(version!==imageVersion||touched)return;
        if(data.error){error('自动定位不可用，可手动放置头套。');return;}
        faces=(data.faces||[]).map(f=>({x:(f.box.originX+f.box.width/2)/(source.width*scale),y:(f.box.originY+f.box.height/2)/(source.height*scale),size:f.box.width/(source.width*scale)*2.3,angle:Math.atan2((f.points[1].y-f.points[0].y)*source.height,(f.points[1].x-f.points[0].x)*source.width)*180/Math.PI})).sort((a,b)=>a.x-b.x);
        faces.forEach(f=>{if(f.angle>90)f.angle-=180;if(f.angle< -90)f.angle+=180;});
        if(faces.length<=2)faces.forEach((f,i)=>Object.assign(hats[i],f,{visible:true}));
        if(active&&mode==='crop'){crop();const status=$('#photo-error');status.dataset.detection=JSON.stringify({faces:faces.length,loadMs:data.loadMs,detectMs:data.detectMs});if(!faces.length)error('没找到脸部，可点选人物手动放置。');}
      };
      worker.onerror=()=>{stopDetection();if(active)error('自动定位不可用，可以手动放置。');};worker.postMessage({bitmap},[bitmap]);
    }catch{stopDetection();if(active)error('可手动放置头套。');}
  }
  const $ = selector => container.querySelector(selector);
  const art = async svg => { if (!cache.has(svg)) cache.set(svg, svgImage(svg).then(img=>{cache.set(svg,img);return img;})); return cache.get(svg); };
  function title() { return `<div class="photo-heading"><h1>把今天，贴起来。</h1></div>`; }
  function inputs() { return '<input type="file" id="camera-input" hidden accept="image/*" capture="user" aria-label="拍摄双人合照"><input type="file" id="gallery-input" hidden accept="image/*" aria-label="从相册选择合照">'; }
  function mount(node, onBack) { container = node; active = true; back = () => { dispose(); onBack(); }; render(); }
  function render() {
    if (mode === 'preview' && outputURL) preview();
    else if (source) crop();
    else choose();
    container.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function bindInputs() {
    for (const id of ['camera-input', 'gallery-input']) $( `#${id}`).onchange = async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await load(file); };
    $('#photo-back').onclick = back;
  }
  function choose() {
    container.innerHTML = `${title()}<section class="photo-choice"><div class="photo-choice-art">${envelopeSVG('#B69ACA')}</div><h2>两张脸，一起入镜。</h2>${inputs()}<div class="button-row"><button id="camera" class="button">拍合照</button><button id="gallery" class="button secondary">从相册选择</button></div><button id="skip" class="text-button">先不拍，保存餐盘卡</button></section><div id="photo-error" role="alert"></div><div class="replay-row"><button id="photo-back" class="text-button">回到揭晓</button></div>`;
    bindInputs(); $('#camera').onclick = () => $('#camera-input').click(); $('#gallery').onclick = () => $('#gallery-input').click(); $('#skip').onclick = generate;
  }
  function error(message) { if ($('#photo-error')) { $('#photo-error').textContent = message; $('#photo-error').className = 'error-note photo-error'; } }
  async function load(file) {
    if (busy) return;
    if (file.size > 30 * 1024 * 1024) return error('这张照片超过 30 MB，请选一张较小的照片或截图。');
    if (!file.type.startsWith('image/')) return error('请选择图片文件。');
    busy = true; const version = ++imageVersion; const url = URL.createObjectURL(file);
    try {
      const image = await imageFrom(url);
      if (image.naturalWidth * image.naturalHeight > 64000000) throw new Error('照片尺寸太大，请先缩小或使用截图。');
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      const reduced = document.createElement('canvas'); reduced.width = Math.round(image.naturalWidth * scale); reduced.height = Math.round(image.naturalHeight * scale);
      const ctx = reduced.getContext('2d'); ctx.drawImage(image, 0, 0, reduced.width, reduced.height);
      if (version !== imageVersion) return;
      if (source) { source.width = 0; source.height = 0; }
      stopDetection();source = reduced;resetHats(); zoom = 1; offsetX = 0; offsetY = 0; mode = 'crop'; clearOutput(); if (active) {render();detect();}
    } catch (err) { error(err.message || '照片没能读出来，请重选。'); }
    finally { URL.revokeObjectURL(url); busy = false; }
  }
  function drawPhoto(ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.fillStyle = '#F4F0E4'; ctx.fillRect(x, y, w, h);
    if (source) {
      const t=photoTransform(source.width,source.height,W,H,fit,zoom,offsetX,offsetY),rx=w/W,ry=h/H;
      ctx.save();ctx.filter='blur(20px)';const cover=Math.max(w/source.width,h/source.height)*1.1;
      ctx.drawImage(source,x+(w-source.width*cover)/2,y+(h-source.height*cover)/2,source.width*cover,source.height*cover);ctx.restore();
      ctx.save();ctx.filter=retro?'sepia(0.18) saturate(0.88) contrast(0.96)':'none';
      ctx.drawImage(source,x+t.x*rx,y+t.y*ry,source.width*t.scale*rx,source.height*t.scale*ry);ctx.restore();
      if(retro){ctx.fillStyle='#d8a95a';ctx.globalAlpha=.06;ctx.fillRect(x,y,w,h);ctx.globalAlpha=.075;ctx.fillStyle='#25231F';for(let n=0;n<2800;n++){const gx=(n*73.37)%W,gy=(n*131.91)%H;ctx.fillRect(x+gx*rx,y+gy*ry,rx,ry);}ctx.globalAlpha=1;}
      hats.forEach((hat,i)=>{if(!hat.visible)return;const svg=headwearSVG(choices[i][hat.item]?.name||'餐盒'),img=cache.get(svg);if(!img){cache.set(svg,svgImage(svg).then(image=>{cache.set(svg,image);drawCrop();}));return;}if(!img.width)return;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);hats.forEach((other,j)=>{if(j===i||!other.visible)return;const size=other.size*source.width*t.scale*rx,cx=x+(t.x+other.x*source.width*t.scale)*rx,cy=y+(t.y+other.y*source.height*t.scale)*ry;ctx.moveTo(cx+size*.225*Math.cos(other.angle*Math.PI/180),cy+size*.225*Math.sin(other.angle*Math.PI/180));ctx.ellipse(cx,cy,size*.225,size*.279,other.angle*Math.PI/180,0,Math.PI*2);});ctx.clip('evenodd');ctx.translate(x+(t.x+hat.x*source.width*t.scale)*rx,y+(t.y+hat.y*source.height*t.scale)*ry);ctx.rotate(hat.angle*Math.PI/180);const size=hat.size*source.width*t.scale*rx;ctx.drawImage(img,-size/2,-size*135/240,size,size);ctx.restore();});
    }
    ctx.restore();
  }
  function drawCrop() { const canvas = $('#crop'); if (!canvas) return; drawPhoto(canvas.getContext('2d'), 0, 0, W, H); }
  function clampOffset() { const t=photoTransform(source.width,source.height,W,H,fit,zoom,offsetX,offsetY);offsetX=t.ox;offsetY=t.oy; }
  function crop() {
    container.innerHTML = `${title()}<section><div class="crop-wrap"><canvas id="crop" class="crop-surface" width="${W}" height="${H}" tabindex="0" aria-label="照片取景，按方向键移动；也可拖动照片"></canvas><div class="crop-controls"><label for="zoom">缩放</label><input type="range" id="zoom" min="1" max="4" step="0.01" value="${zoom}"><button id="fit" class="text-button">重置取景</button></div><div class="nudge-controls" aria-label="移动照片"><button data-nudge="left" aria-label="向左移动">←</button><button data-nudge="up" aria-label="向上移动">↑</button><button data-nudge="down" aria-label="向下移动">↓</button><button data-nudge="right" aria-label="向右移动">→</button></div></div><div class="head-controls"><div class="button-row"><button type="button" data-target="-1">照片</button>${game.names.map((n,i)=>`<button type="button" data-target="${i}">${e(n)}</button>`).join('')}<button id="swap-hats">交换</button></div><div id="hat-options"></div><div class="button-row"><button id="fill-photo">${fit?'填满画面':'完整入镜'}</button><button id="filter-photo">${retro?'拍立得 ✓':'原图 ✓'}</button></div></div>${inputs()}<div id="photo-error" role="alert"></div><div class="action-dock"><button id="generate" class="button full">做成大头贴 <span aria-hidden="true">↗</span></button><div class="button-row"><button id="reselect" class="text-button">重新选照片</button><button id="photo-back" class="text-button">回到揭晓</button></div></div></section>`;
    bindInputs(); drawCrop();
    const hatOptions=()=>{
      container.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.target)===activeHead)));
      $('#crop').setAttribute('aria-label',activeHead<0?'照片取景，拖动或使用方向键移动':'移动'+game.names[activeHead]+'的头套，拖动或使用方向键');
      $('#zoom').disabled=activeHead!==-1;$('#zoom').closest('.crop-controls').hidden=activeHead!==-1;
      $('#hat-options').innerHTML=activeHead<0?'':`<label>头套<select id="hat-food">${choices[activeHead].map((i,j)=>`<option value="${j}" ${hats[activeHead].item===j?'selected':''}>${e(i.name)}</option>`).join('')}</select></label><label>大小<input id="hat-size" type="range" min="0.1" max="1.5" step="0.01" value="${hats[activeHead].size}"></label><label>旋转<input id="hat-angle" type="range" min="-180" max="180" value="${hats[activeHead].angle}"></label><button id="hat-show">${hats[activeHead].visible?'隐藏':'显示'}</button><button id="hat-reset">重置</button>${faces.length>2?faces.map((f,i)=>`<button data-face="${i}">人物 ${i+1}</button>`).join(''):''}`;
      if(activeHead<0)return;
      for(const [id,key] of [['hat-food','item'],['hat-size','size'],['hat-angle','angle']])$('#'+id).oninput=event=>{resetGesture();touched=true;hats[activeHead][key]=Number(event.target.value);hats[activeHead].visible=true;drawCrop();};
      $('#hat-show').onclick=()=>{resetGesture();touched=true;hats[activeHead].visible=!hats[activeHead].visible;hatOptions();drawCrop();};
      $('#hat-reset').onclick=()=>{resetGesture();touched=true;Object.assign(hats[activeHead],faces[activeHead]||{x:activeHead?.68:.32,y:.35,size:.28,angle:0},{visible:true});hatOptions();drawCrop();};
      container.querySelectorAll('[data-face]').forEach(b=>b.onclick=()=>{resetGesture();touched=true;Object.assign(hats[activeHead],faces[Number(b.dataset.face)],{visible:true});hatOptions();drawCrop();});
    };
    container.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{resetGesture();activeHead=Number(b.dataset.target);hatOptions();});
    $('#swap-hats').onclick=()=>{resetGesture();touched=true;const a={...hats[0]},b={...hats[1]};Object.assign(hats[0],b,{item:a.item});Object.assign(hats[1],a,{item:b.item});hatOptions();drawCrop();};
    $('#fill-photo').onclick=()=>{fit=!fit;zoom=1;offsetX=offsetY=0;crop();};
    $('#filter-photo').onclick=()=>{retro=!retro;$('#filter-photo').textContent=retro?'拍立得 ✓':'原图 ✓';drawCrop();};hatOptions();
    $('#zoom').oninput = event => { zoom = Number(event.target.value); clampOffset(); drawCrop(); };
    $('#fit').onclick = () => { zoom = 1; offsetX = 0; offsetY = 0; $('#zoom').value = 1; drawCrop(); };
    $('#reselect').onclick = () => $('#gallery-input').click(); $('#generate').onclick = generate;
    const canvas = $('#crop');
    const pointers=new Map();let gesture;
    function resetGesture(){pointers.clear();gesture=null;}
    const point=event=>{const r=canvas.getBoundingClientRect(),t=photoTransform(source.width,source.height,W,H,fit,zoom,offsetX,offsetY);return {x:((event.clientX-r.left)*W/r.width-t.x)/t.scale,y:((event.clientY-r.top)*H/r.height-t.y)/t.scale};};
    const rebase=()=>{gesture=pointers.size?{start:[...pointers.values()].map(p=>({...p})),moved:false,hat:activeHead>=0?{...hats[activeHead]}:null,ox:offsetX,oy:offsetY}:null;};
    canvas.onpointerdown=event=>{
      if(event.button!==0||pointers.size>=2)return;touched=true;
      const p=point(event);
      if(!pointers.size){activeHead=[1,0].find(i=>hitHeadwear(hats[i],p,source.width,source.height))??-1;hatOptions();}
      pointers.set(event.pointerId,p);rebase();canvas.setPointerCapture(event.pointerId);
    };
    canvas.onpointermove=event=>{
      if(!pointers.has(event.pointerId)||!gesture)return;
      pointers.set(event.pointerId,point(event));const now=[...pointers.values()];
      if(now.length===1&&!gesture.moved){const t=photoTransform(source.width,source.height,W,H,fit,zoom,offsetX,offsetY);if(Math.hypot(now[0].x-gesture.start[0].x,now[0].y-gesture.start[0].y)*t.scale*canvas.getBoundingClientRect().width/W<4)return;}gesture.moved=true;
      if(activeHead>=0){Object.assign(hats[activeHead],moveHeadwear(gesture.hat,gesture.start,now,source.width,source.height));$('#hat-size').value=hats[activeHead].size;$('#hat-angle').value=hats[activeHead].angle;}
      else if(now.length===1){const t=photoTransform(source.width,source.height,W,H,fit,zoom,gesture.ox,gesture.oy);offsetX=gesture.ox+(now[0].x-gesture.start[0].x)*t.scale;offsetY=gesture.oy+(now[0].y-gesture.start[0].y)*t.scale;clampOffset();pointers.set(event.pointerId,point(event));rebase();}
      drawCrop();
    };
    canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=event=>{if(pointers.delete(event.pointerId))rebase();};
    const nudge = key => { if(activeHead>=0){touched=true;hats[activeHead].x+=key==='left'?-.01:key==='right'?.01:0;hats[activeHead].y+=key==='up'?-.01:key==='down'?.01:0;drawCrop();return;} if (key === 'left') offsetX -= 20; if (key === 'right') offsetX += 20; if (key === 'up') offsetY -= 20; if (key === 'down') offsetY += 20; clampOffset(); drawCrop(); };
    document.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => nudge(b.dataset.nudge));
    canvas.onkeydown = event => { const key = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key]; if (key) { event.preventDefault(); nudge(key); } };
  }
  async function generate() {
    if (busy) return; busy = true;
    const version = imageVersion;
    const button = $('#generate') || $('#skip'); if (button) { button.disabled = true; button.textContent = '正在贴好这一餐…'; }
    try {
      stopDetection();await document.fonts.load('48px Xiaolai');
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1620;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = PAPER; ctx.fillRect(0, 0, 1080, 1620);
      ctx.fillStyle = INK; ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.font = '28px Xiaolai, sans-serif'; ctx.fillText('今天这一餐 · 双人留念', 540, 38);
      ctx.font = '58px Xiaolai, sans-serif'; ctx.fillText('点头之交', 540, 80);
      ctx.font = '23px sans-serif'; ctx.fillText(new Date(game.snapshot.createdAt).toLocaleDateString('zh-CN').replaceAll('/', ' . '), 540, 153);
      if(source){await Promise.all(hats.map((hat,i)=>art(headwearSVG(choices[i][hat.item]?.name||'餐盒'))));paperRect(ctx,65,197,950,998,'#F4F0E4');drawPhoto(ctx,84.1,216,911.8,970);}
      else {const left=await art(mealSVG(outcome[0].actual.items)),right=await art(mealSVG(outcome[1].actual.items));ctx.drawImage(left,80,300,450,360);ctx.drawImage(right,550,600,450,360);}
      for(const [i,r] of outcome.entries()){
        const x=i?555:51,color=i?'#70A58B':'#E8C547';
        paperRect(ctx,x,1215,474,288,'#F4F0E4');paperRect(ctx,x,1215,474,52,color);
        ctx.textAlign='left';block(ctx,r.name+' 的餐票',x+16,1225,440,36,32,'Xiaolai,sans-serif');
        ctx.font='18px sans-serif';ctx.fillText('我点的',x+16,1281);
        block(ctx,r.actual.orders?.map(o=>o.name).join('、')||describeItems(r.actual.items),x+16,1307,440,55,22);
        ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(x+16,1371);ctx.lineTo(x+458,1371);ctx.stroke();ctx.setLineDash([]);
        block(ctx,r.friend+' 猜我点',x+16,1382,440,27,19);
        block(ctx,r.guess.orders?.map(o=>o.name).join('、')||describeItems(r.guess.items),x+16,1410,440,43,20);
        ctx.fillStyle=color;ctx.fillRect(x+1,1462,472,40);ctx.fillStyle=INK;
        const matched=r.groups.filter(g=>g.match).map(g=>g.label);
        block(ctx,r.exact?'一猜就中！':matched.length?matched.join('、')+'猜中了':'这盘，还没猜着',x+16,1471,440,27,23,'Xiaolai,sans-serif');
      }
      ctx.textAlign = 'center'; ctx.font = '21px sans-serif'; ctx.fillStyle = INK; ctx.fillText('sanliang.online/lab/play/guess-my-order/', 540, 1530);
      ctx.font = '23px Xiaolai,sans-serif'; ctx.fillText('从点头之交，到懂你的胃。', 540, 1570);
      if (game.snapshot.demo) { ctx.fillStyle = '#B69ACA'; ctx.fillRect(0, 0, 1080, 28); ctx.fillStyle = INK; ctx.font = '17px sans-serif'; ctx.fillText('开发测试餐单 · 不代表真实可售商品或价格', 540, 4); }
      const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('图片导出失败，请重试。')), 'image/png'));
      canvas.width = 0; canvas.height = 0;
      if (version !== imageVersion) return;
      clearOutput(); outputFile = new File([blob], '点头之交.png', { type: 'image/png' }); outputURL = URL.createObjectURL(blob);
      mode = 'preview'; if (active) { preview(); window.scrollTo({ top: 0, behavior: 'instant' }); }
    } catch (err) { error(err.message || '图片没能生成，照片和取景仍然保留，可以重试。'); if (button) { button.disabled = false; button.textContent = source ? '重新生成大头贴' : '重试生成餐盘卡'; } }
    finally { busy = false; }
  }
  function preview() {
    container.innerHTML = `<div class="photo-heading"><h1>今天这张，收好啦。</h1></div><img class="preview-image" src="${outputURL}" width="1080" height="1620" alt="${e(game.names.join('和'))} 的合影餐单卡，1080 × 1620"><div class="preview-actions"><div class="button-row"><a class="button" id="save-image" href="${outputURL}" download="点头之交.png">保存图片</a>${navigator.canShare?.({files:[outputFile]})?'<button id="share-image" class="button secondary">分享</button>':''}</div><div class="button-row"><button id="edit-photo" class="text-button">${source ? '编辑' : '加合照'}</button><button id="photo-back" class="text-button">返回结果</button></div><p id="save-status" class="fine save-status" role="status"></p><button id="save-help" class="text-button" hidden>没有保存？查看保存方式</button><div id="photo-error" role="alert"></div><div class="invite-actions"><button id="copy-link" class="button secondary">喊朋友来玩 ↗</button><button type="button" id="view-image" class="text-button">查看大图</button></div></div>`;
    $('#view-image').onclick=()=>{
      let dialog=$('#image-viewer');
      if(!dialog){
        dialog=document.createElement('dialog');dialog.id='image-viewer';dialog.className='image-viewer';dialog.setAttribute('aria-label','合影大图');
        dialog.innerHTML=`<div class="viewer-toolbar"><button type="button" class="text-button" data-zoom aria-pressed="false">放大</button><button type="button" class="text-button" data-close autofocus>关闭</button></div><div class="viewer-scroll"><img src="${outputURL}" width="1080" height="1620" alt="合影大图"></div>`;
        container.append(dialog);
        dialog.querySelector('[data-close]').onclick=()=>dialog.close();
        dialog.querySelector('[data-zoom]').onclick=event=>{const zoom=dialog.classList.toggle('zoomed');event.currentTarget.textContent=zoom?'适合屏幕':'放大';event.currentTarget.setAttribute('aria-pressed',String(zoom));};
        dialog.onclose=()=>$('#view-image')?.focus();
      }
      dialog.showModal();
    };
    const showSave=()=>{
      let dialog=$('#save-dialog');if(dialog){dialog.showModal();return;}
      dialog=document.createElement('dialog');dialog.id='save-dialog';dialog.className='save-dialog';
      dialog.innerHTML=`<button type="button" class="text-button" data-close>关闭</button><h2>保存这张合照</h2><p>长按图片，选择“保存图片”或“添加到照片”。</p><img src="${outputURL}" width="1080" height="1620" alt="长按保存合照"><p class="fine" role="status">图片已准备好，保存需在手机菜单中完成。</p><a class="button secondary full" href="${outputURL}" download="点头之交.png">下载图片</a>`;
      const reader=new FileReader();reader.onload=()=>{if(dialog.isConnected)dialog.querySelector('img').src=reader.result;};reader.readAsDataURL(outputFile);
      container.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('a').onclick=()=>{dialog.querySelector('[role=status]').textContent='已发起下载；若没有弹出保存选项，请长按上方图片。';};dialog.showModal();
    };
    $('#save-help').onclick=showSave;
    $('#save-image').onclick=event=>{
      $('#save-help').hidden=false;
      const mobile=/Android|iPhone|iPad|iPod|MicroMessenger/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      if(mobile){event.preventDefault();showSave();$('#save-status').textContent='请在图片菜单中完成保存。';}
      else $('#save-status').textContent='已发起下载，请查看浏览器下载列表。';
    };
    $('#edit-photo').onclick = () => { mode = source ? 'crop' : 'choose'; render(); };
    $('#photo-back').onclick = back;
    if($('#share-image'))$('#share-image').onclick = async () => {
      try {
        if (navigator.canShare?.({ files: [outputFile] })) await navigator.share({ files: [outputFile], title: '点头之交', text: '猜你点什么，就知道有多熟。来猜猜我的这一餐！' });
        else { toast('请保存图片后分享给朋友；也可以长按上方图片。'); $('#save-image').focus(); }
      } catch (err) { if (err.name !== 'AbortError') error('系统分享没能打开，可以直接保存图片。'); }
    };
    $('#copy-link').onclick = async () => {
      try { const lines = ['下次去麦当劳，先别告诉我你点什么。来「点头之交」，看我能不能猜中你的那一餐！', '一起吃过那么多次麦当劳，你知道我会选哪款汉堡吗？拿一部手机，咱俩互猜一盘。', '麦当劳饭搭子集合！你猜我的汉堡，我猜你的饮料，揭晓后再戴个食物头套合影。', '今天麦当劳吃什么？先各自搭一盘，再猜对方点什么。看看谁才是懂胃的朋友。', '约你吃麦当劳，顺便来场点餐小测验：我的主餐、配餐和饮料，你能猜中几样？', '去麦当劳之前先玩一局：别抄我的餐盘，猜猜我会怎么点！']; const next = (lastInvite + 1 + Math.floor(Math.random() * (lines.length - 1))) % lines.length; await navigator.clipboard.writeText(lines[next] + '\n点头之交 · 双人猜餐游戏\nhttps://sanliang.online/lab/play/guess-my-order/'); lastInvite = next; toast('邀请已复制，发给饭搭子吧！'); }
      catch { error('请复制：sanliang.online/lab/play/guess-my-order/'); }
    };
  }
  function clearOutput() { if (outputURL) URL.revokeObjectURL(outputURL); outputURL = null; outputFile = null; }
  function dispose() { active = false;stopDetection(); imageVersion++; clearOutput(); if (source) { source.width = 0; source.height = 0; source = null; } cache.clear(); }
  return { mount, dispose };
}
