import { escapeHTML as e, money, newGame, restoreGame, transition, results, describeItems, purchaseSummary, readyTray } from './game.mjs';
import { foodSVG, mealSVG, envelopeSVG, traySVG, coveredTraySVG } from './art.mjs';
import { mountTray } from './tray.mjs';
import { mountCatalog } from './catalog.mjs';
const $ = selector => document.querySelector(selector), app = $('#app');
const KEY = 'guess-my-order:v1', DEFAULTS = 'guess-my-order:defaults';
let game, gate = false, screen = 'welcome', busy = false, storeList = [], selectedStore, quoteResult, photo, photoModule, loadController, toastTimer;
let photoModulePromise, photoLoadAttempts = 0, disposeTray, placeList = [], selectedPlace, placeSearch = 0;
let defaults = { names: ['', ''], city: '', query: '', budget: '30' };
try {
  game = restoreGame(sessionStorage.getItem(KEY));
  const stored = JSON.parse(sessionStorage.getItem(DEFAULTS) || '{}');
  if (Array.isArray(stored.names) && stored.names.length === 2 && stored.names.every(n => typeof n === 'string' && n.length <= 20)) defaults.names = stored.names;
  for (const key of ['city', 'query', 'budget']) if (typeof stored[key] === 'string' && stored[key].length <= 100) defaults[key] = stored[key];
  if (stored.store && typeof stored.store.id === 'string' && typeof stored.store.name === 'string' && typeof stored.store.open === 'boolean') { defaults.store = stored.store; selectedStore = stored.store; storeList = [stored.store]; }
} catch {}
if (game) { screen = 'game'; gate = game.stage !== 'result'; }
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').classList.remove('show'); $('#toast').textContent = ''; }, 3500); }
function save() { try { if (game) sessionStorage.setItem(KEY, JSON.stringify(game)); else sessionStorage.removeItem(KEY); sessionStorage.setItem(DEFAULTS, JSON.stringify(defaults)); } catch { toast('浏览器未允许保存进度；这一局请不要刷新。'); } }
function go(event, value) { try { game = transition(game, event, value); save(); render(); } catch (err) { toast(err.message); } }
async function api(path, body, signal) {
  const controller = new AbortController(), cancel = () => controller.abort();
  const timer = setTimeout(cancel, 68000); signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) controller.abort();
    const response = await fetch(`./api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) { const err = new Error(data.error?.message || '查询失败，请重试。'); err.code = data.error?.code; throw err; }
    if (data.demo) $('#demo-banner').hidden = false;
    return data;
  } catch (err) {
    if (signal?.aborted || err.code) throw err;
    throw new Error(controller.signal.aborted ? '查询超时了，请重试。' : '网络没有连上，请检查连接后重试。');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
function focusScreen() { window.scrollTo({ top: 0, behavior: 'instant' }); app.focus({ preventScroll: true }); }
function render(focus = true) {
  disposeTray?.(); disposeTray = null;
  if (screen === 'welcome') welcome();
  else if (screen === 'setup') setup();
  else if (screen === 'loading') loading();
  else if (screen === 'photo') renderPhoto();
  else if (game) {
    if (gate && game.stage !== 'result') handoff(true);
    else if (game.stage === 'handoff') handoff();
    else if (game.stage === 'ready') ready();
    else if (game.stage === 'result') reveal();
    else selection();
  }
  if (focus) focusScreen();
}
function welcome() {
  app.innerHTML = `<section class="welcome"><p class="eyebrow">双人点餐游戏 / 01</p><h1>你以为<br>我会<span class="title-mark">点什么</span>？</h1><div class="cover-stage tray-cover" aria-hidden="true"><div class="cover-tray">${traySVG([{name:"汉堡"},{name:"薯条"},{name:"可乐"}],"","#E8C547")}<span>我想吃的</span></div><div class="cover-tray">${traySVG([{name:"麦满分"},{name:"冰淇淋"},{name:"咖啡"}],"","#70A58B")}<span>你猜的</span></div><span class="cover-star">✳</span><span class="cover-note">你真的懂我的胃吗 ↙</span><span class="cover-question">?</span></div><p class="welcome-copy">一起吃过那么多次，<br>这次能猜对吗？</p><button class="button" id="start">一起玩 <span class="arrow" aria-hidden="true">↗</span></button><p class="welcome-meta">2 个人 · 1 部手机 · 3–5 分钟</p></section>`;
  $('#start').onclick = () => { screen = 'setup'; render(); };
}
function setup() {
  app.innerHTML = `<section><div class="screen-head"><p class="eyebrow">开一桌</p><h1>今天，跟谁一起吃？</h1></div><form id="setup-form" class="form-paper"><div class="field-grid"><div class="field"><label class="name-label" for="name-a"><i class="player-dot" aria-hidden="true"></i>你的昵称</label><input id="name-a" type="text" maxlength="10" autocomplete="off" placeholder="怎么称呼你" value="${e(defaults.names[0])}" required></div><div class="field"><label class="name-label" for="name-b"><i class="player-dot b" aria-hidden="true"></i>朋友的昵称</label><input id="name-b" type="text" maxlength="10" autocomplete="off" placeholder="怎么称呼 TA" value="${e(defaults.names[1])}" required></div></div><button type="button" class="button secondary location-button" id="locate">◎ 使用当前位置</button><div class="location-fields"><div class="field"><label for="city">城市</label><input id="city" type="text" maxlength="20" autocomplete="address-level2" placeholder="上海" value="${e(defaults.city)}" required></div><div class="field"><label for="landmark">附近的地标</label><div class="search-row"><input id="landmark" type="text" maxlength="50" placeholder="如：人民广场" value="${e(defaults.query)}" required><button type="button" class="button secondary" id="search-store">搜索地点</button></div></div></div><div id="place-status" class="place-status" role="status"></div><div id="place-results" aria-label="地点候选"></div><div id="store-results" class="store-list" aria-label="搜索到的门店"></div><div id="setup-error" role="alert"></div><div class="budget-field"><label class="field-label" for="budget">每人参考预算</label><div class="budget-wrap"><span>¥</span><input id="budget" type="number" min="10" max="200" step="0.01" inputmode="decimal" value="${e(defaults.budget)}" required></div></div><button class="button full" id="get-menu" ${selectedStore ? '' : 'disabled'}>准备今天的餐单 <span aria-hidden="true">→</span></button><p class="fine muted" style="margin:16px 0 0">餐品与价格按所选门店查询，下单请前往麦当劳官方渠道。</p></form><div class="replay-row"><button class="text-button" id="back-welcome">回到封面</button></div></section>`;
  storeButtons();
  $('#search-store').onclick = () => searchPlaces(false);
  $('#locate').onclick = () => searchPlaces(true);
  placeButtons();
  $('#landmark').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchPlaces(false); } });
  $('#setup-form').oninput = () => { captureDefaults(); save(); };
  $('#city').addEventListener('input', clearStores); $('#landmark').addEventListener('input', clearStores);
  $('#setup-form').onsubmit = async event => {
    event.preventDefault(); if (busy || !selectedStore) return;
    captureDefaults(); save(); busy = true; screen = 'loading'; loadController = new AbortController(); render();
    try {
      const budget = Math.round(Number(defaults.budget) * 100);
      const snapshot = await api('menu', { storeId: selectedStore.id, budget, mode: 'catalog' }, loadController.signal);
      // Load photo code after the menu, before passing the phone: this round can finish offline.
      await loadPhotoModule();
      game = newGame(defaults.names, snapshot); gate = true; screen = 'game'; quoteResult = null; save();
    } catch (err) { screen = 'setup'; render(); if (err.name !== 'AbortError') errorNote('setup-error', err.message); if (err.code === 'STORE_EXPIRED') clearStores(); return; }
    finally { busy = false; if (screen === 'setup') storeButtons(); }
    render();
  };
  $('#back-welcome').onclick = () => { placeSearch++; captureDefaults(); save(); screen = 'welcome'; render(); };
}
function captureDefaults() { if (!$('#setup-form')) return; defaults = { names: [$('#name-a').value.trim(), $('#name-b').value.trim()], city: $('#city').value.trim(), query: $('#landmark').value.trim(), budget: $('#budget').value, store: selectedStore || null }; }
function clearStores() { placeSearch++; selectedStore = null; selectedPlace = null; defaults.store = null; storeList = []; placeList = []; storeButtons(); placeButtons(); }
function storeButtons() {
  if (!$('#store-results')) return;
  $('#store-results').innerHTML = storeList.map((s, i) => `<button type="button" class="store-option ${selectedStore?.id === s.id ? 'active' : ''}" data-store="${i}" aria-pressed="${selectedStore?.id === s.id}" ${s.open ? '' : 'disabled'}><strong>${e(s.name)}</strong><small>${e(s.address)}${Number.isFinite(s.distance)?`<span class="distance">距搜索地点约 ${s.distance<1000?s.distance+' 米':(s.distance/1000).toFixed(1)+' 公里'}</span>`:''}${!s.open ? ` · 暂停营业 ${e(s.hours)}` : ''}</small></button>`).join('');
  document.querySelectorAll('[data-store]').forEach(button => button.onclick = () => { selectedStore = storeList[Number(button.dataset.store)]; defaults.store = selectedStore; save(); storeButtons(); });
  $('#get-menu').disabled = !selectedStore || busy;
}
function placeButtons() {
  if (!$('#place-results')) return;
  $('#place-results').innerHTML = selectedPlace ? '' : placeList.map((p,i)=>`<button type="button" class="place-option" data-place="${i}"><strong>${e(p.name)}</strong><small>${e(p.address)}</small></button>`).join('');
  $('#place-status').textContent = selectedPlace ? `搜索地点：${selectedPlace.name}${selectedPlace.address!==selectedPlace.name?' · '+selectedPlace.address:''}${selectedPlace.accuracy>200?`（定位范围约 ±${selectedPlace.accuracy} 米）`:''}` : placeList.length ? '选择你所在的地点' : '';
  document.querySelectorAll('[data-place]').forEach(button=>button.onclick=()=>selectPlace(placeList[Number(button.dataset.place)]));
}
async function selectPlace(place) {
  if (busy) return; busy = true; selectedPlace = place; placeButtons(); storeButtons();
  $('#setup-error').textContent = ''; $('#place-status').textContent = `正在找 ${place.name} 附近的门店…`;
  const version = placeSearch;
  try {
    const data = await api('stores',{placeId:place.id}); if(version!==placeSearch)return;
    storeList=data.stores; selectedStore=null;
    if(!storeList.length) errorNote('setup-error','这个地点附近没有找到门店，请换一个地点。');
    else if(!storeList.some(s=>s.open)) errorNote('setup-error','附近的门店目前都未营业，可以更换地点。');
  } catch(err) { errorNote('setup-error',err.message); }
  finally { busy=false;storeButtons();placeButtons(); }
}
async function searchPlaces(gps) {
  if(busy)return;captureDefaults();
  if(!gps&&(!$('#city').reportValidity()||!$('#landmark').reportValidity()))return;
  clearStores(); const version=placeSearch; busy=true;
  const button=$('#search-store'),locate=$('#locate');button.disabled=locate.disabled=true;
  $('#setup-error').className='';$('#setup-error').textContent='';$('#place-status').textContent=gps?'正在获取当前位置…':'正在确认地点…';
  let automaticallySelect;
  try {
    let body={city:defaults.city,query:defaults.query};
    if(gps){
      if(!navigator.geolocation)throw new Error('这个浏览器不支持定位，请输入城市和地标。');
      const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:30000}));
      body={coords:{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy}};
    }
    if(version!==placeSearch||screen!=='setup')return;
    const data=await api('places',body);if(version!==placeSearch)return;
    placeList=data.places;
    if(!placeList.length)errorNote('setup-error','没有找到这个地点，请检查城市或换一个具体地标。');
    if(gps&&placeList.length){automaticallySelect=placeList[0];$('#city').value=automaticallySelect.city.slice(0,20);$('#landmark').value=automaticallySelect.name.slice(0,50);captureDefaults();save();}
  } catch(err){errorNote('setup-error',typeof err.code==='number'?err.code===1?'你没有允许定位，可以继续输入城市和地标。':err.code===3?'定位超时了，可以重试或手动搜索。':'暂时没能确定位置，请手动搜索地点。':err.message);}
  finally{busy=false;button.disabled=locate.disabled=false;placeButtons();storeButtons();}
  if(automaticallySelect)await selectPlace(automaticallySelect);
}
function errorNote(id, text) { const node = document.getElementById(id); if (node) { node.className = 'error-note'; node.textContent = text; } }
function loading() {
  app.innerHTML = `<section class="loading-screen"><p class="eyebrow" style="justify-content:center">厨房准备中</p><div class="loading-scene">${mealSVG([{ name: '汉堡', group: 'main' }, { name: '薯条', group: 'side' }, { name: '可乐', group: 'drink' }])}</div><h1>把今天的菜单<br>翻给你们看。</h1><p id="load-status" role="status">正在翻开这家店今天的餐单。</p><div class="loading-dots" aria-hidden="true">···</div><p class="fine muted">餐品滑到眼前，再展开组成和价格。</p><button id="cancel-loading" class="text-button">返回修改</button></section>`;
  $('#cancel-loading').onclick = () => loadController.abort();
}
function handoff(restoring = false) {
  const b = game.stage === 'handoff' || game.stage.startsWith('b') || game.stage === 'ready';
  const name = game.names[b ? 1 : 0];
  if (restoring && game.stage === 'ready') { ready(true); return; }
  app.innerHTML = `<section class="handoff"><span class="seal-label">${game.stage === 'handoff' ? '第一份餐单，已封好' : '餐单先盖好'}</span><div class="envelope">${(game.version >= 2 ? coveredTraySVG : envelopeSVG)(b ? '#70A58B' : '#E8C547')}</div><p>${game.stage === 'handoff' ? '把手机交给' : '现在轮到'}</p><h1 class="recipient dynamic">${e(name)}</h1><p>${game.stage === 'handoff' ? '上一份答案已经收好，<br>接下来就看你的啦。' : '自己看屏幕，朋友先别偷看。'}</p><button class="button full ${b ? 'green-button' : ''}" id="receive">我是 ${e(name)}，准备好了 <span aria-hidden="true">→</span></button></section>`;
  $('#receive').onclick = () => { gate = false; if (game.stage === 'handoff') go('receive'); else render(); };
}
function selection() {
  if (game.version === 3) return catalogSelection();
  if (game.version >= 2) return traySelection();
  const [person, kind] = game.stage.split('-'), index = person === 'a' ? 0 : 1, own = kind === 'self';
  const chosen = game.answers[person][kind];
  app.innerHTML = `<section class="selection-screen ${person === 'b' ? 'b-screen' : ''}"><div class="screen-head"><div class="player-line"><span class="player-badge ${person}">${e(game.names[index])} 的回合</span><span class="step-indicator" aria-label="第 ${own ? 1 : 2} 步，共 2 步"><i class="done"></i><i class="${own ? '' : 'done'}"></i></span></div><h1>${own ? '你今天想吃什么？' : `你猜<span class="dynamic">${e(game.names[1 - index])}</span>会点什么？`}</h1></div><p class="store-caption"><span>${e(game.snapshot.store.name)}</span><span>每人 ${money(game.snapshot.budget)}</span></p><div class="menu-grid" role="radiogroup" aria-label="${own ? '选择自己想吃的套餐' : '预测朋友的套餐'}">${game.snapshot.meals.map((meal, i) => `<label class="meal-card ${chosen === meal.id ? 'selected' : ''}"><input class="sr-only" type="radio" name="meal" value="${e(meal.id)}" ${chosen === meal.id ? 'checked' : ''}><span class="meal-number" aria-hidden="true">0${i + 1}</span><span class="selection-dot" aria-hidden="true">${chosen === meal.id ? '✓' : ''}</span>${mealSVG(meal.items, 'meal-art')}<div class="meal-body"><h2>${e(meal.name)}</h2><p class="ingredients">${meal.items.map(i => `${e(i.name)}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(' · ')}</p><span class="price">${money(meal.price)}</span></div></label>`).join('')}</div><div class="action-dock"><button id="next-choice" class="button ${person === 'b' ? 'green-button' : ''}" ${chosen ? '' : 'disabled'}>${own ? '选好了，接着猜 TA' : '封好我的两份答案'} <span aria-hidden="true">→</span></button>${own ? '' : '<button class="text-button" id="edit-self">修改我想吃的</button>'}</div></section>`;
  document.querySelectorAll('input[name="meal"]').forEach(input => input.onchange = () => {
    game = transition(game, 'choose', input.value); save();
    document.querySelectorAll('.meal-card').forEach(card => { const checked = card.querySelector('input').checked; card.classList.toggle('selected', checked); card.querySelector('.selection-dot').textContent = checked ? '✓' : ''; });
    $('#next-choice').disabled = false;
  });
  $('#next-choice').onclick = () => go('next');
  if ($('#edit-self')) $('#edit-self').onclick = () => go('back');
}
function ready() {
  app.innerHTML = `<section class="handoff"><span class="seal-label">两份餐单，都封好了</span><div class="dual-envelopes">${(game.version >= 2 ? coveredTraySVG : envelopeSVG)('#E8C547')}${(game.version >= 2 ? coveredTraySVG : envelopeSVG)('#70A58B')}</div><h1>把脑袋凑过来。</h1><p>想吃的，和你以为 TA 想吃的。<br>现在一起看看。</p><button id="reveal" class="button full">一起打开 <span aria-hidden="true">↗</span></button></section>`;
  $('#reveal').onclick = () => { gate = false; go('reveal'); };
}
function traySelection() {
  const [person, kind] = game.stage.split('-'), index = person === 'a' ? 0 : 1, own = kind === 'self';
  app.innerHTML = `<section class="selection-screen tray-selection ${person === 'b' ? 'b-screen' : ''}"><div class="screen-head"><div class="player-line"><span class="player-badge ${person}">${e(game.names[index])} 的回合</span><span class="step-indicator" aria-label="第 ${own ? 1 : 2} 步，共 2 步"><i class="done"></i><i class="${own ? '' : 'done'}"></i></span></div><h1>${own ? '你想吃的，装进来。' : `你猜<span class="dynamic">${e(game.names[1-index])}</span>怎么搭？`}</h1></div><p class="store-caption"><span>${e(game.snapshot.store.name)}</span><span>预算参考 ${money(game.snapshot.budget)}</span></p><div id="tray-builder" class="tray-builder"></div><div class="action-dock"><button id="next-choice" class="button ${person === 'b' ? 'green-button' : ''}" ${game.answers[person][kind]?.length ? '' : 'disabled'}>${own ? '搭好了，接着猜 TA' : '盖好我的两份答案'} <span aria-hidden="true">→</span></button>${own ? '' : '<button class="text-button" id="edit-self">修改我想吃的</button>'}</div></section>`;
  mountTray($('#tray-builder'), { snapshot: game.snapshot, pieces: game.answers[person][kind], toast, onChange: pieces => {
    game = transition(game, 'choose', pieces); save(); $('#next-choice').disabled = !pieces.length;
  } });
  $('#next-choice').onclick = () => go('next');
  if ($('#edit-self')) $('#edit-self').onclick = () => go('back');
}
function catalogSelection() {
  const [person,kind]=game.stage.split('-'),index=person==='a'?0:1,own=kind==='self',snapshot=game.snapshot;
  app.innerHTML=`<section class="selection-screen catalog-selection ${person==='b'?'b-screen':''}"><div class="screen-head"><div class="player-line"><span class="player-badge ${person}">${e(game.names[index])} 的回合</span><span class="step-indicator" aria-label="第 ${own?1:2} 步，共 2 步"><i class="done"></i><i class="${own?'':'done'}"></i></span></div><h1>${own?'你想吃的，装进来。':`你猜<span class="dynamic">${e(game.names[1-index])}</span>怎么搭？`}</h1></div><p class="store-caption"><span>${e(snapshot.store.name)}</span><span>预算参考 ${money(snapshot.budget)}</span></p><div id="catalog-builder" class="catalog-builder"></div><div class="action-dock"><button id="next-choice" class="button ${person==='b'?'green-button':''}" disabled>${own?'搭好了，接着猜 TA':'盖好我的两份答案'} <span aria-hidden="true">→</span></button>${own?'':'<button class="text-button" id="edit-self">修改我想吃的</button>'}</div></section>`;
  disposeTray=mountCatalog($('#catalog-builder'),{snapshot,pieces:game.answers[person][kind],toast,api,onChange:(pieces,editing)=>{
    game=transition({...game,snapshot},'choose',pieces);save();$('#next-choice').disabled=editing||!readyTray(snapshot,pieces);
  }});
  $('#catalog-builder .tray-table').append($('.catalog-selection .action-dock'));
  $('#next-choice').onclick=()=>go('next');if($('#edit-self'))$('#edit-self').onclick=()=>go('back');
}
function reveal() {
  const outcome = results(game), exact = outcome.filter(r => r.exact).length;
  const conditions = [...new Set([...(quoteResult?.conditions || game.snapshot.conditions), ...outcome.flatMap(r => r.actual.conditions || [])])];
  app.innerHTML = `<section class="tray-reveal"><div class="result-heading"><p class="eyebrow">${e(game.names[0])} × ${e(game.names[1])} / 今日餐单</p><h1>${exact === 2 ? '原来，真的猜得到。' : exact === 1 ? '有一盘，整份猜中了！' : '原来你想吃这个！'}</h1></div><div class="tray-results">${outcome.map((r,i) => `<article class="tray-result"><h2><span class="player-dot ${i ? 'b' : ''}" aria-hidden="true"></span>${e(r.name)} 的这一餐</h2><div class="tray-comparison"><div><h3>我想吃的</h3>${mealSVG(r.actual.items, 'result-tray', r.actual.orders)}<p>${r.actual.orders?`<strong>${e(r.actual.orders.map(o=>o.name).join(' · '))}</strong><br>`:''}${e(describeItems(r.actual.items))}</p></div><div><h3>${e(r.friend)} 猜的</h3>${mealSVG(r.guess.items, 'result-tray', r.guess.orders)}<p>${r.guess.orders?`<strong>${e(r.guess.orders.map(o=>o.name).join(' · '))}</strong><br>`:''}${e(describeItems(r.guess.items))}</p></div></div><div class="tray-verdict"><p class="result-verdict">${r.exact ? '整份猜中！' : r.groups.some(g => g.match) ? '部分猜中' : '都没猜中'}</p><div class="match-list">${r.groups.map(g => `<span class="match-chip ${g.match ? 'yes' : ''}">${g.match ? '✓' : '×'} ${g.label}${g.match ? '猜中' : '没猜中'}</span>`).join('')}</div></div></article>`).join('')}</div><div class="photo-invite"><div><h2>给这一餐，留个纪念。</h2><p>拍张双人合影，做成大头贴。</p></div><button id="photo-start" class="button">合个影 <span aria-hidden="true">↗</span></button></div><details class="menu-reference"><summary>带着餐单去吃饭</summary><div class="reference-content"><h3>${e(game.snapshot.store.name)}</h3><p class="fine muted">${e(game.snapshot.store.address)}<br>查询时间：${e(new Date(game.snapshot.createdAt).toLocaleString('zh-CN'))}</p>${outcome.map(r => { const q = quoteResult?.quotes.find(q => q.id === r.actual.id); return `<div class="receipt-row"><div><strong>${e(r.name)} · ${e(r.actual.name)}</strong><p>${r.actual.orders?`<strong>${e(r.actual.orders.map(o=>o.name).join(' · '))}</strong><br>`:''}${e(describeItems(r.actual.items))}</p>${q && q.available !== true ? `<p>${e(q.message)}</p>` : q?.change ? `<p>${game.version >= 2 ? '与搭配估算相差' : '与开局时相差'} ${q.change > 0 ? '+' : '−'}${money(Math.abs(q.change))}</p>` : ''}</div><span class="price"><small>${q?.available === true ? '整盘核价' : r.actual.estimated ? '搭配估算' : '开局参考'}</small>${q?.available === true ? money(q.price) : money(r.actual.price)}</span></div>`; }).join('')}<div class="button-row"><button id="copy-menu" class="button secondary">复制餐单</button><button id="reprice" class="button secondary">${game.version >= 2 && !quoteResult ? '核对整盘价格' : '重新核价'}</button></div><p id="quote-status" class="quote-status" role="status">${quoteResult ? `最近核价：${e(new Date(quoteResult.checkedAt).toLocaleTimeString('zh-CN'))}。五分钟内重复查询使用缓存。` : ''}</p><p class="fine muted">${conditions.map(e).join('<br>')}</p><p class="fine">下单与支付请在麦当劳 App、小程序或店内完成。</p></div></details><div class="replay-row"><button class="text-button" id="replay">再玩一局</button></div></section>`;
  $('#photo-start').onclick = async () => { try { await ensurePhoto(); screen = 'photo'; render(); } catch { toast('合影工具没能载入，联网后再试。游戏结果仍然保留。'); } };
  $('#replay').onclick = () => $('#replay-dialog').showModal();
  $('#copy-menu').onclick = async () => {
    const text = `${game.snapshot.store.name}\n${game.snapshot.store.address||''}\n${outcome.map(r => { const q = quoteResult?.quotes.find(q => q.id === r.actual.id); return `${r.name}：${r.actual.orders?purchaseSummary(r.actual)+'\n组成：':''}${describeItems(r.actual.items)}\n${q?.available === true ? `整盘核价 ${money(q.price)}` : `${r.actual.estimated ? '搭配估算' : '开局参考价'} ${money(r.actual.price)}`}`; }).join('\n\n')}\n${conditions.join('\n')}\nhttps://sanliang.online/lab/play/guess-my-order/`;
    await copy(text);
  };
  $('#reprice').onclick = async () => {
    if (busy) return; busy = true; $('#reprice').disabled = true; $('#quote-status').textContent = '正在核对整盘价格…';
    try {
      const choices = game.version >= 2 ? { trays: ['a','b'].map(p => game.answers[p].self.map(i => i.id)) } : { mealIds: [...new Set(outcome.map(r => r.actual.id))] };
      quoteResult = await api('quote', { snapshotId: game.snapshot.id, ...choices }); reveal(); $('.menu-reference').open = true;
    } catch (err) { $('#quote-status').textContent = err.message; }
    finally { busy = false; if ($('#reprice')) $('#reprice').disabled = false; }
  };
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('已复制。'); }
  catch { const field = document.createElement('textarea'); field.value = text; field.setAttribute('aria-label', '可复制的餐单'); app.append(field); field.focus(); field.select(); toast('请长按或按快捷键复制文字。'); }
}
async function loadPhotoModule() {
  if (photoModule) return photoModule;
  // A failed dynamic import is cached by the browser; use a new URL only when retrying.
  photoModulePromise ||= import(`./photo.mjs${++photoLoadAttempts > 1 ? `?retry=${photoLoadAttempts}` : ''}`).then(module => photoModule = module).finally(() => { photoModulePromise = null; });
  return photoModulePromise;
}
async function ensurePhoto() { await loadPhotoModule(); if (!photo) photo = photoModule.createPhoto({ game, toast }); }
function renderPhoto() { if (photo) photo.mount(app, () => { screen = 'game'; render(); }); else { screen = 'game'; render(); } }
$('#about').onclick = () => $('#about-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('#confirm-replay').onclick = () => { $('#replay-dialog').close(); selectedStore = game.snapshot.store; storeList = [selectedStore]; defaults.store = selectedStore; defaults.budget = String(game.snapshot.budget / 100); photo?.dispose(); photo = null; game = null; quoteResult = null; gate = false; screen = 'setup'; save(); render(); };
window.addEventListener('pageshow', event => { if (event.persisted && game && game.stage !== 'result') { gate = true; render(); } });
if (game?.snapshot.demo) $('#demo-banner').hidden = false;
render(false);
if (game) loadPhotoModule().catch(() => {});
fetch('./api/health').then(r => r.json()).then(data => { if (data.demo) $('#demo-banner').hidden = false; }).catch(() => {});
