import { escapeHTML as e, money, MAX_PIECES } from './game.mjs';
import { foodSVG, foodKind, orderSVG } from './art.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const spots=[[.25,.36],[.7,.35],[.48,.72],[.17,.74],[.82,.73],[.48,.24]];
let cacheId, cache=new Map();
export function mountCatalog(root,{snapshot,pieces,onChange,api,toast}) {
  if(cacheId!==snapshot.id){cacheId=snapshot.id;cache=new Map();}
  let selected=structuredClone(pieces||[]), alive=true, active=0, drag, ghost, suppressClick=false, editing=null, editorBusy=false, touch=null, lastScroll=0;
  const visible=new Set();
  const product=id=>snapshot.products.find(p=>p.id===id);
  const variant=id=>snapshot.variants.find(v=>v.id===id);
  const state=id=>{if(!cache.has(id))cache.set(id,{variant:snapshot.variants.find(v=>v.productId===id&&!v.changes.length),detail:null,error:''});return cache.get(id);};
  const remember=v=>{if(v&&!snapshot.variants.some(i=>i.id===v.id))snapshot.variants.push(v);};
  root.innerHTML=`<div class="food-counter catalog-counter"><nav class="catalog-tabs" aria-label="餐品分类">${snapshot.categories.map(c=>`<button type="button" data-jump="${e(c.id)}">${e(c.name)}</button>`).join('')}</nav><div class="catalog-scroll" tabindex="0" aria-label="上下滚动查看完整餐单">${snapshot.categories.map(c=>`<section data-section="${e(c.id)}"><h2>${e(c.name)}</h2><div class="catalog-grid">${snapshot.products.filter(p=>p.category===c.id).map(p=>`<div class="catalog-cell" data-cell="${e(p.id)}"><button type="button" class="food-tile" data-food="${e(p.id)}" aria-label="放入${e(p.name)}"><span class="food-illustration">${p.combo?orderSVG({combo:true,items:[{name:p.name}]}):foodSVG(foodKind(p.name))}</span><span class="food-title">${e(p.name)}</span><span class="food-price">待核价</span></button><button type="button" class="item-retry" data-load="${e(p.id)}" hidden>重试</button></div>`).join('')}</div></section>`).join('')}</div><div class="catalog-editor" hidden></div></div><div class="tray-table"><div class="tray-topline"><span class="hand">这一盘</span><button type="button" class="text-button" data-clear>清空</button></div><div class="serving-tray" role="group" aria-label="你的托盘，拖动摆放，点击调整搭配"><div class="tray-empty" aria-hidden="true">想吃的，放这里</div><div class="tray-pieces"></div></div><div class="tray-tally" role="status" aria-live="polite"></div><div class="tray-feedback" role="status" aria-live="polite"></div><div class="tray-pending"></div></div>`;
  const shelf=root.querySelector('.catalog-scroll'), editor=root.querySelector('.catalog-editor'), tray=root.querySelector('.serving-tray');
  const cells=new Map([...root.querySelectorAll('[data-cell]')].map(el=>[el.dataset.cell,el]));
  function updateCell(id){
    const el=cells.get(id),s=state(id),p=product(id); if(!el)return;
    const count=selected.filter(i=>i.productId===id).length;
    el.querySelector('.food-price').textContent=s.variant?money(s.variant.price):s.promise?'核价中…':s.error?'暂未核实':s.detail?'选好搭配':'待核价';
    el.querySelector('[data-load]').hidden=!s.error;
    el.querySelector('.food-title').textContent=s.variant?.name||p.name;
    el.querySelector('[data-food]').setAttribute('aria-label',`放入${s.variant?.name||p.name}${s.variant?'，'+money(s.variant.price):''}${count?'，托盘已有'+count+'份':''}`);
    el.querySelector('.food-illustration').innerHTML=(s.variant?orderSVG(s.variant):p.combo?orderSVG({combo:true,items:[{name:p.name}]}):foodSVG(foodKind(p.name)))+(count?`<span class="food-count" aria-hidden="true">${count}</span>`:'');
  }
  function drawTray(){
    root.querySelector('.tray-empty').hidden=!!selected.length;
    root.querySelector('.tray-pieces').innerHTML=selected.map((p,i)=>{
      const v=variant(p.id),name=v?.name||product(p.productId).name;
      return `<button type="button" class="tray-piece ${v?.combo?'bundle-piece':''} ${v?'':'pending-piece'}" data-piece="${e(p.key)}" style="left:${p.x*100}%;top:${p.y*100}%;--tilt:${[-5,4,-3,7,-7,2][i]}deg" aria-label="调整${e(name)}，第${i+1}份；方向键移动，Delete拿出" title="${e(name)} · 点击调整">${v?orderSVG(v):foodSVG(foodKind(name))}${v?'':'<span class="pending-label">'+(state(p.productId).error?'待重试':state(p.productId).detail&&!state(p.productId).variant?'选搭配':'确认中…')+'</span>'}</button>`;
    }).join('');
    const total=selected.reduce((n,p)=>n+(variant(p.id)?.price||0),0),pending=selected.some(p=>!p.id),over=snapshot.budget === null ? 0 : total-snapshot.budget;
    root.querySelector('.tray-tally').innerHTML=`<span>${selected.length} / ${MAX_PIECES} 份<span class="tally-label">${pending?'已确认金额':'参考合计'}</span></span><strong>${money(total)}</strong>`;
    root.querySelector('.tray-feedback').textContent=over>0?`超出预算 ${money(over)}`:pending?'核价中…':'';
    root.querySelector('.tray-pending').innerHTML=selected.filter(p=>!p.id).map(p=>{
      const s=state(p.productId);return `<div><span>${e(product(p.productId).name)}${s.error?`：${e(s.error)}`:''}</span>${s.error?`<button type="button" data-retry="${e(p.key)}">重试</button>`:''}${s.detail?`<button type="button" data-edit="${e(p.key)}">选搭配</button>`:''}<button type="button" data-remove="${e(p.key)}">拿出</button></div>`;
    }).join('');
    root.querySelector('[data-clear]').disabled=!selected.length||editorBusy;
  }
  function commit(){if(!alive)return;root.closest(".catalog-selection")?.classList.toggle("configuring",!!editing);onChange(structuredClone(selected),!!editing||editorBusy);if(!drag?.moved)drawTray();}
  function remove(key){selected=selected.filter(p=>p.key!==key);if(editing?.key===key)closeEditor();commit();for(const id of visible)updateCell(id);}
  async function load(id,needDetail=false){
    const s=state(id);
    if(s.promise)return s.promise;
    if(s.variant&&(!needDetail||s.detail)){remember(s.variant);return s;}
    if(!navigator.onLine){s.error='需要联网加载这份餐。';throw new Error(s.error);}
    s.error='';active++;
    s.promise=api('item',{snapshotId:snapshot.id,productId:id}).then(data=>{s.detail=data.detail;s.variant=data.variant;remember(data.variant);return s;}).catch(err=>{s.error=err.message;throw err;}).finally(()=>{s.promise=null;active--;if(alive){updateCell(id);resolvePending(id);pump();}});
    updateCell(id);return s.promise;
  }
  function resolvePending(id){
    const s=state(id);if(s.variant){remember(s.variant);for(const p of selected)if(p.productId===id&&!p.id)p.id=s.variant.id;}
    commit();
  }
  function pump(){
    if(!alive||editing)return;
    // No backlog of offscreen products: the current viewport is the queue.
    const ids=[...new Set([...selected.filter(p=>!p.id).map(p=>p.productId),...visible])];
    for(const id of ids){if(active>=2)break;const s=state(id);if(!s.variant&&!s.promise&&!s.error&&!s.detail)load(id).catch(()=>{if(alive&&!drag?.moved)drawTray();});}
  }
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const id=entry.target.dataset.cell;if(entry.isIntersecting){visible.add(id);updateCell(id);}else visible.delete(id);}pump();},{root:shelf,rootMargin:'0px 0px 180px 0px'});
  for(const cell of cells.values())observer.observe(cell);
  async function add(id,point){
    if(product(id).combo){edit(null,id,point);return;}
    const loaded=state(id);
    if(!loaded.detail){try{await load(id,true);}catch(err){if(alive)toast(err.message);return;}if(!alive)return;}
    if(loaded.detail.rounds.length){edit(null,id,point);return;}
    if(selected.length>=MAX_PIECES){root.querySelector('.tray-feedback').textContent='这一盘已有 6 份，先拿出一份再换。套餐整组算一份。';toast('托盘已有 6 份。');return;}
    const s=state(id);remember(s.variant);const [x,y]=spots[selected.length];
    selected.push({key:crypto.randomUUID(),productId:id,id:s.variant?.id||null,x:point?.x??x,y:point?.y??y});
    commit();root.querySelector(`[data-piece="${selected.at(-1).key}"]`)?.classList.add("just-added");updateCell(id);pump();
  }
  function closeEditor(){const scroll=editing?.scroll||0;editing=null;editorBusy=false;editor.hidden=true;shelf.hidden=false;shelf.scrollTop=scroll;root.querySelector('.catalog-tabs').hidden=false;commit();pump();}
  async function edit(key,newId,point){
    const p=key?selected.find(p=>p.key===key):{productId:newId,id:null};if(!p||editorBusy)return;
    if(!key&&selected.length>=MAX_PIECES){toast('托盘已有 6 份。');return;}
    const scroll=shelf.scrollTop;
    const request=editing={key,productId:p.productId,point,scroll};shelf.hidden=true;root.querySelector('.catalog-tabs').hidden=true;editor.hidden=false;
    editor.innerHTML='<p role="status">正在展开这份餐…</p><button type="button" class="text-button" data-cancel>返回餐单</button>';commit();
    try{
      const s=await load(p.productId,true);if(!alive||editing!==request)return;
      const current=variant(p.id)||s.variant;
      editing={key,productId:p.productId,point,scroll,detail:s.detail,originalId:p.id,draft:s.detail.rounds.map(r=>({roundId:r.id,ids:(current?.selections?.find(q=>q.roundId===r.id)?.choices||r.choices.filter(c=>c.defaultQuantity).map(c=>({id:c.id,quantity:c.defaultQuantity}))).flatMap(c=>Array(c.quantity).fill(c.id))}))};
      for(const r of s.detail.rounds){const d=editing.draft.find(q=>q.roundId===r.id);while(d.ids.length<r.min)d.ids.push('');}
      drawEditor();
    }catch(err){if(alive&&editing===request){editor.innerHTML=`<p class="error-note" role="alert">${e(err.message)}</p><button type="button" class="button secondary" data-editor-retry>重试</button><button type="button" class="text-button" data-cancel>返回餐单</button>`;}}
  }
  function drawEditor(){
    const d=editing.detail,p=selected.find(p=>p.key===editing.key)||{productId:editing.productId},v=variant(p?.id);
    editor.innerHTML=`<div class="editor-head"><button type="button" class="text-button" data-cancel>← 餐单</button>${editing.key?`<button type="button" class="text-button" data-remove="${e(editing.key)}">拿出这份</button>`:''}</div><div class="editor-title">${v?orderSVG(v):foodSVG(foodKind(d.name))}<h2>${e(d.name)}</h2></div><form class="combo-form">${d.rounds.map(r=>{const draft=editing.draft.find(q=>q.roundId===r.id),label=r.name+(d.rounds.filter(q=>q.name===r.name).length>1?` · 第${d.rounds.indexOf(r)+1}组`:'');return `<fieldset><legend>${e(label)}${r.max>1?` · ${r.min===r.max?'选'+r.min+'份':r.min+'–'+r.max+'份'}`:''}</legend>${draft.ids.map((id,index)=>`<div class="combo-slot"><select disabled data-round="${e(r.id)}" data-slot="${index}" aria-label="${e(label)}第${index+1}份" required><option value="">请选择</option>${r.choices.map(c=>`<option value="${e(c.id)}" ${id===c.id?'selected':''}>${e(c.name)}</option>`).join('')}</select>${draft.ids.length>r.min?`<button type="button" data-less="${e(r.id)}" data-slot="${index}" aria-label="移除${e(label)}第${index+1}份">−</button>`:''}</div>`).join('')}${draft.ids.length<r.max?`<button type="button" class="text-button" data-more="${e(r.id)}">＋ 加一份</button>`:''}</fieldset>`;}).join('')}<div class="editor-error" role="alert"></div><button class="button full" type="submit">${editing.key?'更新搭配':'加入托盘'}</button></form>`;
    editor.querySelector('form').onsubmit=async event=>{
      event.preventDefault();if(editorBusy)return;if(editing.detail.rounds.some(r=>{const ids=editing.draft.find(d=>d.roundId===r.id).ids.filter(Boolean);return ids.length<r.min||ids.length>r.max;})){editor.querySelector('.editor-error').textContent='请选齐每组餐品。';return;}const key=editing.key,body=editing.draft.map(r=>({roundId:r.roundId,choices:[...new Set(r.ids)].map(id=>({id,quantity:r.ids.filter(c=>c===id).length}))}));
      if(v&&JSON.stringify(body)===JSON.stringify(v.selections)){closeEditor();return;}
      editorBusy=true;commit();const button=editor.querySelector('[type=submit]');button.disabled=true;button.textContent='正在确认价格…';
      try{const data=await api('item',{snapshotId:snapshot.id,productId:p.productId,selections:body});if(!alive)return;remember(data.variant);const target=selected.find(p=>p.key===key);if(target)target.id=data.variant.id;else if(!key){const [x,y]=spots[selected.length];selected.push({key:crypto.randomUUID(),productId:p.productId,id:data.variant.id,x:editing.point?.x??x,y:editing.point?.y??y});}closeEditor();updateCell(p.productId);}
      catch(err){if(alive)editor.querySelector('.editor-error').textContent=err.message;}
      finally{editorBusy=false;if(alive&&editing){button.disabled=false;button.textContent='确认搭配';commit();}}
    };
    syncOptions();
    for(const field of editor.querySelectorAll('fieldset')){
      const select=field.querySelector('select');if(!select)continue;
      const round=editing.detail.rounds.find(r=>r.id===select.dataset.round);
      field.querySelectorAll('.combo-slot,[data-more]').forEach(n=>n.hidden=true);
      const grid=document.createElement('div');grid.className='combo-choices';
      grid.innerHTML=round.choices.map((c,i)=>`<div class="combo-choice" ${i>=6?'hidden':''} data-choice-cell><button type="button" data-pick="${e(c.id)}" aria-label="选择${e(c.name)}">${foodSVG(foodKind(c.name))}<span>${e(c.name)}</span></button><div class="choice-count"><button type="button" data-minus="${e(c.id)}" aria-label="减少${e(c.name)}">−</button><output>0</output><button type="button" data-plus="${e(c.id)}" aria-label="增加${e(c.name)}">＋</button></div></div>`).join('');
      field.append(grid);
      if(round.choices.length>6){const more=document.createElement('button');more.type='button';more.className='text-button';more.textContent='更多选项';more.onclick=()=>{grid.querySelectorAll('[hidden]').forEach(n=>n.hidden=false);more.remove();};field.append(more);}
      const update=()=>{const draft=editing.draft.find(r=>r.roundId===round.id);for(const cell of grid.children){const id=cell.querySelector('[data-pick]').dataset.pick,count=draft.ids.filter(v=>v===id).length;cell.classList.toggle('selected',count>0);cell.querySelector('[data-pick]').setAttribute('aria-pressed',String(count>0));cell.querySelector('output').textContent=count;cell.querySelector('.choice-count').hidden=round.max===1;cell.querySelector('[data-minus]').disabled=!count;cell.querySelector('[data-plus]').disabled=count>=round.choices.find(c=>c.id===id).max||draft.ids.filter(Boolean).length>=round.max;}};
      grid.onclick=event=>{event.stopPropagation();const b=event.target.closest('button');if(!b||editorBusy)return;const draft=editing.draft.find(r=>r.roundId===round.id),id=b.dataset.pick||b.dataset.plus||b.dataset.minus;let ids=draft.ids.filter(Boolean);if(b.dataset.minus){const at=ids.indexOf(id);if(at>=0)ids.splice(at,1);}else if(round.max===1)ids=[id];else if(ids.length<round.max&&ids.filter(v=>v===id).length<round.choices.find(c=>c.id===id).max)ids.push(id);else toast(`这一组最多选 ${round.max} 份，请先减去一份再换。`);draft.ids=ids;update();};update();
    }

  }
  function syncOptions(){
    for(const select of editor.querySelectorAll('select[data-round]')){const round=editing.detail.rounds.find(r=>r.id===select.dataset.round),draft=editing.draft.find(r=>r.roundId===round.id);for(const option of select.options){const choice=round.choices.find(c=>c.id===option.value);option.disabled=!!choice&&draft.ids.filter((id,i)=>i!==Number(select.dataset.slot)&&id===choice.id).length>=choice.max;}}
  }
  root.onchange=event=>{const el=event.target;if(el.matches('select[data-round]')){editing.draft.find(r=>r.roundId===el.dataset.round).ids[Number(el.dataset.slot)]=el.value;syncOptions();}};
  root.onclick=event=>{
    if(suppressClick&&event.detail){suppressClick=false;event.preventDefault();event.stopPropagation();return;}
    const el=event.target.closest('button');if(!el||editorBusy)return;
    if(el.dataset.food){if(touch&&(touch.blocked||performance.now()-lastScroll<250)){touch=null;return;}add(el.dataset.food);}
    else if(el.dataset.piece)edit(el.dataset.piece);
    else if(el.hasAttribute('data-editor-retry'))edit(editing.key,editing.productId,editing.point);
    else if(el.dataset.edit)edit(el.dataset.edit);
    else if(el.dataset.remove)remove(el.dataset.remove);
    else if(el.dataset.retry){const p=selected.find(p=>p.key===el.dataset.retry);if(p){const s=state(p.productId);s.error='';if(s.detail)edit(p.key);else pump();}}
    else if(el.dataset.load){const s=state(el.dataset.load);s.error='';s.detail=null;load(el.dataset.load).catch(()=>{});}
    else if(el.dataset.jump){const section=[...shelf.querySelectorAll('[data-section]')].find(s=>s.dataset.section===el.dataset.jump);shelf.scrollTo({top:shelf.scrollTop+section.getBoundingClientRect().top-shelf.getBoundingClientRect().top,behavior:'instant'});}
    else if(el.hasAttribute('data-clear')){selected=[];if(editing)closeEditor();else commit();for(const id of visible)updateCell(id);}
    else if(el.hasAttribute('data-cancel'))closeEditor();
    else if(el.dataset.more){editing.draft.find(r=>r.roundId===el.dataset.more).ids.push('');drawEditor();}
    else if(el.dataset.less){editing.draft.find(r=>r.roundId===el.dataset.less).ids.splice(Number(el.dataset.slot),1);drawEditor();}
  };
  root.onkeydown=event=>{
    const el=event.target.closest('[data-piece]');if(!el||editing)return;
    if(['Delete','Backspace'].includes(event.key)){event.preventDefault();remove(el.dataset.piece);return;}
    const delta={ArrowLeft:[-.06,0],ArrowRight:[.06,0],ArrowUp:[0,-.06],ArrowDown:[0,.06]}[event.key];
    if(delta){event.preventDefault();const p=selected.find(p=>p.key===el.dataset.piece);p.x=clamp(p.x+delta[0],.16,.84);p.y=clamp(p.y+delta[1],.22,.78);commit();[...root.querySelectorAll('[data-piece]')].find(n=>n.dataset.piece===p.key)?.focus({preventScroll:true});}
  };
  function finish(){ghost?.remove();ghost=null;drag?.target.classList.remove('being-dragged');drag=null;tray.classList.remove('drop-ready');}
  const inside=(event,r)=>event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;
  root.onpointerdown=event=>{
    suppressClick=false;touch=null;if(editing||event.button!==0||drag)return;
    const target=event.target.closest('[data-food],[data-piece]');if(!target)return;
    // Touch never captures the menu: images, labels and gaps all scroll natively.
    if(event.pointerType==='touch'&&target.dataset.food){touch={x:event.clientX,y:event.clientY,blocked:performance.now()-lastScroll<250};return;}
    drag={target,key:target.dataset.piece,id:target.dataset.food,type:event.pointerType,pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false};target.setPointerCapture(event.pointerId);
  };
  root.onpointermove=event=>{
    if(touch&&Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>8)touch.blocked=true;
    if(!drag||drag.pointer!==event.pointerId)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
    event.preventDefault();
    if(!drag.moved){drag.moved=true;drag.target.classList.add('being-dragged');ghost=document.createElement('div');ghost.className='food-drag-ghost';ghost.setAttribute('aria-hidden','true');const p=selected.find(p=>p.key===drag.key),v=variant(p?.id)||state(drag.id||p.productId).variant;ghost.innerHTML=v?orderSVG(v):foodSVG(foodKind(product(drag.id||p.productId).name));document.body.append(ghost);}
    ghost.style.transform=`translate(${event.clientX-55}px,${event.clientY-64}px) rotate(-6deg)`;
    tray.classList.toggle('drop-ready',inside(event,tray.getBoundingClientRect()));
  };
  root.onpointerup=event=>{
    if(!drag||drag.pointer!==event.pointerId)return;
    if(!drag.moved){finish();return;}
    suppressClick=true;const {id,key,type}=drag,r=tray.getBoundingClientRect(),hit=inside(event,r),point={x:clamp((event.clientX-r.left)/r.width,.16,.84),y:clamp((event.clientY-r.top)/r.height,.22,.78)};
    finish();
    if(id){if(hit)add(id,point);else{root.querySelector('.tray-feedback').textContent='还没放进托盘，拖到盘内再松手。';toast('还没放进托盘。');}}
    else if(hit){const p=selected.find(p=>p.key===key);Object.assign(p,point);commit();}
    else if(type!=='touch')remove(key);else commit();
  };
  shelf.addEventListener('scroll',()=>{lastScroll=performance.now();if(touch)touch.blocked=true;},{passive:true});
  const cancel=()=>{if(touch)touch.blocked=true;if(drag?.moved){suppressClick=true;root.querySelector('.tray-feedback').textContent='拖动中断了，原来的餐品仍在。';}finish();};
  root.onpointercancel=cancel;
  // Touch implicitly releases capture before click; that is not a cancelled tap.
  root.onlostpointercapture=()=>{if(drag)cancel();};
  drawTray();for(const p of selected){const s=state(p.productId);if(!p.id&&s.variant){remember(s.variant);p.id=s.variant.id;}}commit();pump();
  return()=>{alive=false;observer.disconnect();finish();root.onclick=root.onchange=root.onkeydown=root.onpointerdown=root.onpointermove=root.onpointerup=root.onpointercancel=root.onlostpointercapture=null;};
}
