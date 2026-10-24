export const GROUPS = { main: '主餐', side: '配餐', drink: '饮料', extra: '其他' };
export const STAGES = ['a-self', 'a-guess', 'handoff', 'b-self', 'b-guess', 'ready', 'result'];
export const money = cents => `¥${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MAX_PIECES = 6;
export const trayKey = pieces => JSON.stringify(Object.entries(pieces.reduce((counts, piece) => { const id = typeof piece === 'string' ? piece : piece.id; counts[id] = (counts[id] || 0) + 1; return counts; }, Object.create(null))).sort(([a], [b]) => a.localeCompare(b)));
export function validTray(snapshot, pieces) {
  if (snapshot.mode === 'catalog') return Array.isArray(pieces) && pieces.length <= MAX_PIECES && new Set(pieces.map(p=>p?.key)).size === pieces.length && pieces.every(p => p && typeof p.key === 'string' && p.key.length < 100 && snapshot.products.some(i=>i.id===p.productId) && (p.id === null || snapshot.variants.some(v=>v.id===p.id && v.productId===p.productId)) && Number.isFinite(p.x) && p.x >= .12 && p.x <= .88 && Number.isFinite(p.y) && p.y >= .18 && p.y <= .82);
  return Array.isArray(pieces) && pieces.length <= MAX_PIECES && pieces.every(p => p && snapshot.products.some(i => i.id === p.id) && Number.isFinite(p.x) && p.x >= .12 && p.x <= .88 && Number.isFinite(p.y) && p.y >= .18 && p.y <= .82);
}
export const readyTray = (snapshot, pieces) => !!(validTray(snapshot,pieces) && pieces.length && (snapshot.mode !== 'catalog' || pieces.every(p=>p.id)));
export function trayMeal(snapshot, pieces) {
  if (!validTray(snapshot, pieces)) throw new Error('托盘里有不在本局菜单中的食物。');
  if (snapshot.mode === 'catalog') {
    if (!readyTray(snapshot,pieces)) throw new Error('托盘里还有正在确认的餐品。');
    const orders = pieces.map(p=>({ ...snapshot.variants.find(v=>v.id===p.id), x:p.x, y:p.y }));
    const items = orders.flatMap(o=>o.items.map(i=>({...i, x:o.x, y:o.y})));
    return { id: trayKey(pieces), name: `自选搭配 · ${orders.length} 份`, items, orders, price: orders.reduce((n,o)=>n+o.price,0), conditions:[...new Set(orders.flatMap(o=>o.conditions||[]))], estimated:true };
  }
  const items = pieces.map(p => ({ ...snapshot.products.find(i => i.id === p.id), quantity: 1, x: p.x, y: p.y }));
  return { id: trayKey(pieces), name: `自选搭配 · ${pieces.length} 件`, items, price: items.reduce((sum, i) => sum + i.price, 0), conditions: [...new Set(items.flatMap(i => i.conditions || []))], estimated: true };
}
export function describeItems(items) {
  const counts = new Map();
  for (const i of items) { const key = JSON.stringify([i.code, i.spec]); const entry = counts.get(key) || { name: i.name, quantity: 0 }; entry.quantity += i.quantity; counts.set(key, entry); }
  return [...counts.values()].map(i => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(' · ');
}
export function purchaseSummary(meal) {
  if (!meal.orders) return describeItems(meal.items);
  const counts = new Map();
  for (const order of meal.orders) { const entry=counts.get(order.id)||{order,count:0}; entry.count++; counts.set(order.id,entry); }
  return [...counts.values()].map(({order,count})=>`${order.name}${count>1?` × ${count}`:''}${order.changes.length?`（换配：${order.changes.join('、')}）`:''}`).join(' · ');
}

export function signature(items) {
  const counts = new Map();
  for (const item of items) {
    const key = JSON.stringify([item.code, item.spec || '标准']);
    counts.set(key, (counts.get(key) || 0) + item.quantity);
  }
  return JSON.stringify([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

export function compareMeals(actual, guess) {
  const groups = Object.entries(GROUPS).filter(([group]) => [...actual.items, ...guess.items].some(i => i.group === group))
    .map(([group, label]) => ({ group, label, match: signature(actual.items.filter(i => i.group === group)) === signature(guess.items.filter(i => i.group === group)) }));
  return { exact: signature(actual.items) === signature(guess.items), groups };
}

export function validSnapshot(s) {
  if (s?.mode === 'catalog') return !!(typeof s.id === 'string' && s.id.length < 100 && Number.isFinite(Date.parse(s.createdAt)) && s.store && typeof s.store.name === 'string' && Number.isSafeInteger(s.budget) && s.budget >= 1000 && s.budget <= 20000 && Array.isArray(s.conditions) && s.conditions.every(c=>typeof c==='string') && Array.isArray(s.categories) && s.categories.length<=100 && s.categories.every(c=>typeof c.id==='string'&&typeof c.name==='string') && Array.isArray(s.products) && s.products.length>=3 && s.products.length<=500 && new Set(s.products.map(p=>p.id)).size===s.products.length && s.products.every(p=>typeof p.id==='string'&&p.id.length<=100&&typeof p.name==='string'&&p.name.length<=120&&p.group in GROUPS&&s.categories.some(c=>c.id===p.category)) && Array.isArray(s.variants) && s.variants.length<=300 && new Set(s.variants.map(v=>v.id)).size===s.variants.length && s.variants.every(v=> typeof v.id==='string' && v.id.length<=100 && s.products.some(p=>p.id===v.productId) && typeof v.name==='string' && Number.isSafeInteger(v.price) && v.price>=0 && v.price<=100000 && Array.isArray(v.changes) && v.changes.every(c=>typeof c==='string') && Array.isArray(v.items) && v.items.length>0 && v.items.length<=60 && v.items.every(i=>typeof i.code==='string'&&typeof i.name==='string'&&typeof i.spec==='string'&&i.group in GROUPS&&Number.isSafeInteger(i.quantity)&&i.quantity>=1&&i.quantity<=20)));
  if (s?.mode === 'tray') return !!(typeof s.id === 'string' && s.id.length < 100 && Number.isFinite(Date.parse(s.createdAt)) && s.store && typeof s.store.name === 'string' &&
    Number.isSafeInteger(s.budget) && s.budget >= 1000 && s.budget <= 20000 && Array.isArray(s.conditions) && s.conditions.every(c => typeof c === 'string') &&
    Array.isArray(s.products) && s.products.length >= 3 && s.products.length <= 24 && new Set(s.products.map(p => p.id)).size === s.products.length &&
    s.products.every(p => typeof p.id === 'string' && p.id.length <= 100 && typeof p.code === 'string' && typeof p.name === 'string' && p.group in GROUPS && Number.isSafeInteger(p.price) && p.price >= 0 && p.price <= 100000));
  return !!(s && typeof s.id === 'string' && s.id.length < 100 && Number.isFinite(Date.parse(s.createdAt)) &&
    s.store && typeof s.store.name === 'string' && Number.isSafeInteger(s.budget) && s.budget >= 1000 && s.budget <= 20000 &&
    Array.isArray(s.conditions) && s.conditions.every(c => typeof c === 'string') && Array.isArray(s.meals) && s.meals.length >= 3 && s.meals.length <= 6 &&
    new Set(s.meals.map(m => m.id)).size === s.meals.length && s.meals.every(m => typeof m.id === 'string' && typeof m.name === 'string' &&
      Number.isSafeInteger(m.price) && m.price >= 0 && m.price <= 100000 && Array.isArray(m.items) && m.items.length > 0 && m.items.length <= 12 &&
      m.items.every(i => typeof i.code === 'string' && typeof i.name === 'string' && i.group in GROUPS && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity < 20)));
}

export function newGame(names, snapshot) {
  if (!validSnapshot(snapshot)) throw new Error('餐单不完整，请重新获取。');
  if (!Array.isArray(names) || names.length !== 2 || names.some(n => typeof n !== 'string' || !n.trim() || [...n].length > 10)) throw new Error('昵称请填写 1–10 个字。');
  return { version: snapshot.mode === 'catalog' ? 3 : snapshot.mode === 'tray' ? 2 : 1, names: names.map(n => n.trim()), snapshot: structuredClone(snapshot), stage: 'a-self', answers: { a: { self: null, guess: null }, b: { self: null, guess: null } } };
}

export function restoreGame(raw) {
  try {
    if (!raw || raw.length > 1500000) return null;
    const g = JSON.parse(raw);
    newGame(g.names, g.snapshot);
    if (g.version !== (g.snapshot.mode === 'catalog' ? 3 : g.snapshot.mode === 'tray' ? 2 : 1) || !STAGES.includes(g.stage)) return null;
    const ids = g.snapshot.meals?.map(m => m.id);
    for (const p of ['a', 'b']) for (const key of ['self', 'guess']) {
      const value = g.answers?.[p]?.[key];
      if (value !== null && (g.version >= 2 ? !validTray(g.snapshot, value) : !ids.includes(value))) return null;
    }
    if (g.version >= 2) {
      const required = [['a', 'self', 1], ['a', 'guess', 2], ['b', 'self', 4], ['b', 'guess', 5]];
      if (required.some(([p, key, step]) => STAGES.indexOf(g.stage) >= step && !readyTray(g.snapshot,g.answers[p][key]))) return null;
    }
    if (STAGES.indexOf(g.stage) >= 1 && !g.answers.a.self) return null;
    if (STAGES.indexOf(g.stage) >= 2 && !g.answers.a.guess) return null;
    if (STAGES.indexOf(g.stage) >= 4 && !g.answers.b.self) return null;
    if (STAGES.indexOf(g.stage) >= 5 && !g.answers.b.guess) return null;
    if (STAGES.indexOf(g.stage) < 3 && (g.answers.b.self || g.answers.b.guess)) return null;
    return g;
  } catch { return null; }
}

export function transition(game, event, value) {
  const g = structuredClone(game);
  const [person, kind] = g.stage.split('-');
  if (event === 'choose' && ['self', 'guess'].includes(kind)) {
    if (g.version >= 2 ? !validTray(g.snapshot, value) : !g.snapshot.meals.some(m => m.id === value)) throw new Error('这份餐不在本局菜单里。');
    g.answers[person][kind] = structuredClone(value);
  } else if (event === 'next' && ['self', 'guess'].includes(kind)) {
    if (!g.answers[person][kind] || (g.version >= 2 && !readyTray(g.snapshot,g.answers[person][kind]))) throw new Error('先放好餐品，等正在确认的搭配完成。');
    g.stage = STAGES[STAGES.indexOf(g.stage) + 1];
  } else if (event === 'back' && kind === 'guess') g.stage = `${person}-self`;
  else if (event === 'receive' && g.stage === 'handoff') g.stage = 'b-self';
  else if (event === 'reveal' && g.stage === 'ready') g.stage = 'result';
  else throw new Error('这一步已经完成，请继续当前页面。');
  return g;
}

export function results(game) {
  if (game.stage !== 'result') throw new Error('答案还没揭晓。');
  return ['a', 'b'].map((p, index) => {
    const other = p === 'a' ? 'b' : 'a';
    const actual = game.version >= 2 ? trayMeal(game.snapshot, game.answers[p].self) : game.snapshot.meals.find(m => m.id === game.answers[p].self);
    const guess = game.version >= 2 ? trayMeal(game.snapshot, game.answers[other].guess) : game.snapshot.meals.find(m => m.id === game.answers[other].guess);
    return { name: game.names[index], friend: game.names[1 - index], actual, guess, ...compareMeals(actual, guess) };
  });
}
