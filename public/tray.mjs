import { escapeHTML as e, money, trayMeal, MAX_PIECES } from './game.mjs';
import { foodSVG, foodKind } from './art.mjs';

const spots = [[.26,.38],[.68,.35],[.48,.70],[.18,.74],[.82,.72],[.48,.23]];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function mountTray(root, { snapshot, pieces, onChange, toast }) {
  let selected = structuredClone(pieces || []), category = 'main', drag, ghost, suppressUntil = 0;
  const categories = [['main','主食'],['side','小食'],['drink','饮料']].filter(([g]) => snapshot.products.some(p => p.group === g));
  category = categories[0][0];
  root.innerHTML = `<div class="food-counter"><nav class="food-tabs" aria-label="餐品分类">${categories.map(([g,label]) => `<button type="button" data-category="${g}" aria-pressed="${g===category}">${label}</button>`).join('')}</nav><div class="food-shelf" aria-label="可搭配的食物"></div></div><div class="tray-table"><div class="tray-topline"><span class="hand">这一盘</span><button type="button" class="text-button" data-clear>清空</button></div><div class="serving-tray" role="group" aria-label="你的托盘，食物可以拖动摆放或点按拿出"><div class="tray-empty" aria-hidden="true">把想吃的<br>放进来<span>拖动食物 · 点一下也可以</span></div><div class="tray-pieces"></div></div><div class="tray-tally" role="status" aria-live="polite"></div><p class="tray-hint">拖出托盘或点一下，拿回去。</p></div>`;
  const shelf = root.querySelector('.food-shelf'), tray = root.querySelector('.serving-tray');
  function drawShelf() {
    shelf.innerHTML = snapshot.products.filter(p => p.group === category).map(p => {
      const count = selected.filter(i => i.id === p.id).length;
      return `<button type="button" class="food-tile" data-food="${e(p.id)}" aria-label="放入${e(p.name)}，${money(p.price)}${count?`，托盘已有${count}件`:''}"><span class="food-illustration">${foodSVG(foodKind(p.name))}${count?`<span class="food-count" aria-hidden="true">${count}</span>`:''}</span><span class="food-title">${e(p.name)}</span><span class="food-price">${money(p.price)}</span></button>`;
    }).join('');
  }
  function drawTray() {
    root.querySelector('.tray-empty').hidden = selected.length > 0;
    root.querySelector('.tray-pieces').innerHTML = selected.map((piece,index) => {
      const p = snapshot.products.find(p => p.id === piece.id);
      return `<button type="button" class="tray-piece" data-piece="${index}" style="left:${piece.x*100}%;top:${piece.y*100}%;--tilt:${[-5,4,-3,7,-7,2][index]}deg" aria-label="拿出${e(p.name)}，第${index+1}件；方向键可调整位置" title="${e(p.name)} · 点一下拿回去">${foodSVG(foodKind(p.name))}</button>`;
    }).join('');
    const meal = trayMeal(snapshot, selected), over = meal.price - snapshot.budget;
    root.querySelector('.tray-tally').innerHTML = `<span>${selected.length} / ${MAX_PIECES} 件<span class="tally-label">单点估算</span></span><strong>${money(meal.price)}</strong>${over>0?`<small class="over-budget">比参考预算多 ${money(over)}</small>`:''}`;
    root.querySelector('[data-clear]').disabled = !selected.length;
  }
  function update(next, message) {
    const focused = document.activeElement, foodId = focused?.dataset.food, pieceIndex = focused?.dataset.piece;
    selected = next; onChange(selected); drawTray(); drawShelf();
    if (foodId) [...shelf.querySelectorAll('[data-food]')].find(b=>b.dataset.food===foodId)?.focus({preventScroll:true});
    else if (pieceIndex !== undefined) (root.querySelector(`[data-piece="${Math.min(Number(pieceIndex),selected.length-1)}"]`) || shelf.querySelector('[data-food]'))?.focus({preventScroll:true});
    if (message) toast(message);
  }
  function add(id, point) {
    if (selected.length >= MAX_PIECES) { toast('这一盘先放六件，拿出一点再换吧。'); return; }
    const [x,y] = spots[selected.length]; update([...selected,{id,x:point?.x??x,y:point?.y??y}]);
  }
  root.onclick = event => {
    if (event.detail && Date.now() < suppressUntil) { event.preventDefault(); return; }
    const group = event.target.closest('[data-category]');
    if (group) { category = group.dataset.category; root.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed',b===group)); drawShelf(); return; }
    const food = event.target.closest('[data-food]'), piece = event.target.closest('[data-piece]');
    if (food) add(food.dataset.food);
    else if (piece) update(selected.filter((_,i) => i!==Number(piece.dataset.piece)));
    else if (event.target.closest('[data-clear]')) update([]);
  };
  root.onkeydown = event => {
    const piece = event.target.closest('[data-piece]'), delta = {ArrowLeft:[-.06,0],ArrowRight:[.06,0],ArrowUp:[0,-.06],ArrowDown:[0,.06]}[event.key];
    if (!piece || !delta) return;
    event.preventDefault(); const i = Number(piece.dataset.piece), next = structuredClone(selected);
    next[i].x = clamp(next[i].x+delta[0],.16,.84); next[i].y = clamp(next[i].y+delta[1],.22,.78);
    update(next); root.querySelector(`[data-piece="${i}"]`).focus({preventScroll:true});
  };
  function finish() { ghost?.remove(); ghost = null; drag?.target.classList.remove('being-dragged'); drag = null; tray.classList.remove('drop-ready'); }
  root.onpointerdown = event => {
    suppressUntil = 0; // A fresh tap is intentional, even immediately after a drag.
    const target = event.target.closest('[data-food],[data-piece]');
    if (!target || event.button !== 0 || drag) return;
    const index = target.hasAttribute('data-piece') ? Number(target.dataset.piece) : -1;
    const id = index>=0 ? selected[index].id : target.dataset.food;
    drag = {target,id,index,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,rect:tray.getBoundingClientRect(),moved:false};
    target.setPointerCapture(event.pointerId);
  };
  root.onpointermove = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<8) return;
    event.preventDefault();
    if (!drag.moved) {
      drag.moved = true; drag.target.classList.add('being-dragged');
      ghost = document.createElement('div'); ghost.className = 'food-drag-ghost'; ghost.setAttribute('aria-hidden','true');
      ghost.innerHTML = foodSVG(foodKind(snapshot.products.find(p=>p.id===drag.id).name)); document.body.append(ghost);
    }
    ghost.style.transform = `translate(${event.clientX-55}px,${event.clientY-64}px) rotate(-6deg)`;
    const r = drag.rect; tray.classList.toggle('drop-ready',event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom);
  };
  root.onpointerup = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      suppressUntil = Date.now()+350;
      const {rect:r,index,id}=drag, inside=event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;
      const point={x:clamp((event.clientX-r.left)/r.width,.16,.84),y:clamp((event.clientY-r.top)/r.height,.22,.78)};
      finish();
      if (index<0) { if (inside) add(id,point); }
      else if (inside) { const next=structuredClone(selected); next[index]={id,...point}; update(next); }
      else update(selected.filter((_,i)=>i!==index));
    } else finish();
  };
  root.onpointercancel = root.onlostpointercapture = () => finish();
  drawShelf(); drawTray();
}
