import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { randomUUID } from 'node:crypto';
import { signature } from './public/game.mjs';

export const TOOLS = ['query-nearby-stores', 'query-meals', 'query-meal-detail', 'calculate-price'];
export class AppError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}
export const isAuthFailure = error => error?.code === 'AUTH' || /\b401\b|\b403\b|unauthorized|鉴权码.*(?:不存在|失效)/i.test(String(error?.message || ''));
export function upstreamData(result) {
  if (result.isError) throw new AppError('UPSTREAM', '麦当劳暂时没有返回可用结果，请稍后重试。');
  let body = result.structuredContent;
  if (!body?.data) {
    const raw = result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
    if (raw.length > 3_000_000) throw new AppError('FORMAT', '餐单内容过大，请换一家门店。');
    try { body = JSON.parse(raw); } catch { throw new AppError('FORMAT', '餐单格式发生变化，需要更新接入。'); }
  }
  if ([401, 403].includes(Number(body?.code))) throw new AppError('AUTH', '餐单服务的授权需要更新，已开始的游戏可以继续。', 503);
  if (body?.success !== true || body?.code !== 200 || body.data == null) throw new AppError('UPSTREAM', '麦当劳暂时无法提供这份餐单，请重试或更换门店。');
  return body.data;
}

// ponytail: one account, one queue. Keep upstream concurrency at two; no distributed lock needed.
export function limiter(max = 2, capacity = 40) {
  let running = 0;
  const queue = [];
  const next = () => {
    while (running < max && queue.length) {
      const { work, resolve, reject, signal } = queue.shift();
      if (signal?.aborted) { reject(new AppError('TIMEOUT', '查询超时了，请重试。', 504)); continue; }
      running++;
      Promise.resolve().then(work).then(resolve, reject).finally(() => { running--; next(); });
    }
  };
  return (work, signal) => new Promise((resolve, reject) => {
    if (queue.length >= capacity) return reject(new AppError('BUSY', '现在查询的人有点多，请稍后再试。', 429));
    queue.push({ work, resolve, reject, signal }); next();
  });
}

export function makeMCP(token, limit = limiter()) {
  let connection, client, minute = 0, count = 0;
  const state = { connectedAt: null, lastSuccess: null, lastFailure: null, access: 'unknown' };
  async function connect() {
    if (!token) throw new AppError('UNCONFIGURED', '真实餐单尚未接通，请稍后再来。', 503);
    if (!connection) connection = (async () => {
      client = new Client({ name: 'guess-my-order', version: '1.0.0' });
      client.onerror = () => {};
      const transport = new StreamableHTTPClientTransport(new URL('https://mcp.mcd.cn'), {
        requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
        reconnectionOptions: { maxRetries: 0 }
      });
      await client.connect(transport, { timeout: 12000 });
      state.connectedAt = new Date().toISOString();
      return client;
    })().catch(async error => { await client?.close().catch(() => {}); connection = null; throw error; });
    return connection;
  }
  async function call(name, args, signal) {
    if (!TOOLS.includes(name)) throw new AppError('TOOL', '不支持的查询。', 400);
    if (state.access === 'expired') throw new AppError('AUTH', '餐单服务的授权需要更新，已开始的游戏可以继续。', 503);
    return limit(async () => {
      if (signal?.aborted) throw new AppError('TIMEOUT', '查询超时了，请重试。', 504);
      const nowMinute = Math.floor(Date.now() / 60000);
      if (minute !== nowMinute) { minute = nowMinute; count = 0; }
      if (++count > 80) throw new AppError('BUSY', '本分钟查询次数较多，请稍等一分钟。', 429);
      try {
        const c = await connect();
        const result = await c.callTool({ name, arguments: args }, { timeout: 12000, signal });
        const data = upstreamData(result);
        state.lastSuccess = new Date().toISOString();
        state.access = 'ok';
        return data;
      } catch (e) {
        state.lastFailure = new Date().toISOString();
        if (e instanceof AppError) { if (e.code === 'AUTH') state.access = 'expired'; throw e; }
        const auth = isAuthFailure(e);
        if (auth) { state.access = 'expired'; await client?.close().catch(() => {}); connection = null; }
        throw new AppError(auth ? 'AUTH' : 'UPSTREAM', auth ? '餐单服务的授权需要更新，已开始的游戏可以继续。' : '餐单查询没有完成，请稍后重试。', auth ? 503 : 502);
      }
    }, signal);
  }
  return {
    call, state,
    listTools: async () => {
      try { return await (await connect()).listTools({}, { timeout: 12000 }); }
      catch (error) {
        state.lastFailure = new Date().toISOString();
        if (isAuthFailure(error)) { state.access = 'expired'; await client?.close().catch(() => {}); connection = null; throw new AppError('AUTH', '餐单服务的授权需要更新，已开始的游戏可以继续。', 503); }
        throw new AppError('CONNECT', '无法读取麦当劳工具列表，请检查账号授权和网络。', 503);
      }
    },
    close: async () => { await client?.close().catch(() => {}); }
  };
}

const short = (v, max = 120) => typeof v === 'string' ? v.slice(0, max) : '';
export function normalizeStores(data) {
  if (!Array.isArray(data)) throw new AppError('FORMAT', '门店格式发生变化，需要更新接入。');
  return data.slice(0, 20).filter(s => /^\d{3,20}$/.test(s.storeCode) && typeof s.storeName === 'string').map(s => ({
    id: s.storeCode, name: short(s.storeName), address: short(s.address, 180), distance: Number.isFinite(s.distance) && s.distance >= 0 ? Math.round(s.distance) : null,
    open: s.businessStatus === true, hours: [short(s.businessStartTime, 8), short(s.businessEndTime, 8)].filter(Boolean).join('–')
  }));
}
export function classify(name, roundName = '') {
  if (/饮料|饮品/.test(roundName)) return 'drink';
  if (/小食|配餐/.test(roundName)) return 'side';
  if (/主食|主餐/.test(roundName) || /堡|卷|麦香|麦满分|粥/.test(name)) return 'main';
  if (/冰淇淋|麦旋风|阿芙佳朵|圆筒|派$/.test(name)) return 'side';
  if (/可乐|雪碧|咖啡|鲜萃|茶|牛奶|果汁|芬达|豆浆|奶昔|奶铁|冰咖|怡泉|橙橙|柠柠|纯悦|美式|卡布奇诺|黑巧/.test(name)) return 'drink';
  if (/薯|玉米|沙拉|麦乐鸡|鸡块|冰淇淋|麦旋风|派|油条|香肠|苹果片/.test(name)) return 'side';
  if (/鸡腿|鸡翅/.test(name)) return 'main';
  return 'extra';
}
export function eligibleMeals(data) {
  if (!data?.meals || !Array.isArray(data.categories)) throw new AppError('FORMAT', '套餐格式发生变化，需要更新接入。');
  const tagged = new Set(data.categories.flatMap(c => (c.meals || []).filter(m => m.tags?.some(t => /^(套餐|[三四]件套)$/.test(t)) || /单人/.test(c.name)).map(m => m.code)));
  // The live API's withOrder is an optional card purchase, never part of our quote request.
  const optionalCard = m => m.canWithOrder === true && m.withOrder && /随单购/.test(m.discountType || '');
  return Object.entries(data.meals).filter(([code, m]) => /^\d{2,24}$/.test(code) && typeof m.name === 'string' &&
    (tagged.has(code) || /套餐|[三四]件套|单人/.test(m.name)) && !/双人|多人|全家|分享|儿童|亲子|开心乐园|桶/.test(m.name) &&
    (optionalCard(m) || (!m.canWithOrder && !m.withOrder && !/会员|金卡|购卡|随单购|积分|专享/.test(m.discountType || ''))))
    .sort(([, a], [, b]) => (Number(a.currentPrice) || 999) - (Number(b.currentPrice) || 999))
    .slice(0, 12).map(([code, meal]) => ({ code, name: short(meal.name), offer: optionalCard(meal) ? '未使用菜单展示的随单购优惠；本份按不购卡的实际组合核价。' : short(meal.discountType, 200) }));
}

export function combinations(detail) {
  if (!detail || typeof detail.code !== 'string' || typeof detail.name !== 'string' || !Array.isArray(detail.rounds) || detail.rounds.length < 2 || detail.rounds.length > 5) return [];
  const rounds = detail.rounds.map(r => ({ ...r, choices: (r.choices || []).filter(c => typeof c.code === 'string' && typeof c.name === 'string' && c.maxQuantity !== 0) }));
  // ponytail: support one item per round. Complex shared buckets need a separate validated builder.
  if (rounds.some(r => Number(r.quantity) !== 1 || Number(r.minQuantity) > 1 || Number(r.maxQuantity) < 1 || !r.choices.length)) return [];
  const defaults = rounds.map(r => r.choices.find(c => c.isDefault === 1) || r.choices[0]);
  const make = choices => ({
    productCode: detail.code, name: short(detail.name),
    items: choices.map((c, i) => ({ code: c.code, name: short(c.name), spec: '标准', quantity: 1, group: classify(c.name, rounds[i].name) })),
    request: { productCode: detail.code, quantity: 1, roundList: choices.map((c, i) => ({ round: String(rounds[i].id), comboItemList: [{ code: c.code, quantity: 1 }] })) }
  });
  const base = make(defaults);
  if (!base.items.some(i => i.group === 'main') || !base.items.some(i => i.group === 'drink')) return [];
  const output = [base];
  for (const group of ['main', 'drink', 'side']) {
    const i = base.items.findIndex(item => item.group === group);
    if (i < 0) continue;
    const choice = rounds[i].choices.find(c => c.code !== defaults[i].code && !/大杯|大薯|双份|加量/.test(c.name));
    if (choice) { const selected = [...defaults]; selected[i] = choice; output.push(make(selected)); }
  }
  return output;
}
export function priceFrom(data) {
  if (!Number.isSafeInteger(data?.price) || data.price < 0 || data.price > 100000) throw new AppError('FORMAT', '核价金额格式有变化，不能把它用作点餐参考。');
  return data.price;
}
export function quoteNotes(data) {
  // Keep optional textual price conditions without exposing the full upstream response.
  const notes = [data?.conditions, data?.condition, data?.priceDescription, data?.discountType].flat().filter(v => typeof v === 'string' && v.trim()).map(v => v.trim().slice(0, 300));
  if (Number.isSafeInteger(data?.discount) && data.discount > 0) notes.push(`本次核价含 ${data.discount / 100} 元优惠，适用条件以你的官方结算页为准。`);
  return [...new Set(notes)].slice(0, 6);
}
export const quoteArgs = (storeId, combo) => ({ storeCode: storeId, beType: 1, orderType: 1, needTableware: false, items: [combo.request] });
export const CONDITIONS = ['到店自取，按所选套餐组合核价；不购买会员卡，不使用私人优惠券或积分。', '此价格由服务账号查询，可能受门店、时段或账号条件影响；以你在麦当劳官方渠道看到的结算价为准。'];

export async function buildMenu(call, store, budget, signal) {
  const args = { storeCode: store.id, beType: 1, orderType: 1 };
  const menu = await call('query-meals', args, signal);
  const candidates = eligibleMeals(menu);
  const byMain = [], variants = [], seen = new Set(), accepted = [], requests = new Map();
  // Read at most eight details; additional choices come from those same legal rounds.
  for (let i = 0; i < Math.min(8, candidates.length); i += 2) {
    const details = await Promise.all(candidates.slice(i, i + 2).map(m => call('query-meal-detail', { ...args, code: m.code }, signal).then(d => combinations(d).map(c => ({ ...c, offer: m.offer }))).catch(e => { if (e.code === 'AUTH' || signal?.aborted) throw e; return []; })));
    for (const choices of details) if (choices.length) { byMain.push(choices[0]); variants.push(...choices.slice(1)); }
    if (byMain.length >= 6) break;
  }
  const ordered = [...byMain, ...variants.filter(m => m.items.some(i => i.group === 'drink')), ...variants];
  let attempts = 0;
  for (const combo of ordered) {
    if (accepted.length >= 6 || attempts >= 16) break;
    const sig = signature(combo.items);
    if (seen.has(sig)) continue;
    seen.add(sig); attempts++;
    let price, quote;
    try { quote = await call('calculate-price', quoteArgs(store.id, combo), signal); price = priceFrom(quote); }
    catch (e) { if (e.code === 'AUTH' || e.code === 'TIMEOUT' || signal?.aborted) throw e; continue; }
    if (price > budget) continue;
    const id = randomUUID();
    requests.set(id, combo);
    accepted.push({ id, name: combo.name, items: combo.items, price, conditions: [...(combo.offer ? [combo.offer] : []), ...quoteNotes(quote)] });
  }
  if (accepted.length < 3) throw new AppError('TOO_FEW', `每人 ${budget / 100} 元内只找到 ${accepted.length} 份已核价套餐。试着提高预算，或换一家门店。`, 422);
  const snapshot = { id: randomUUID(), createdAt: new Date().toISOString(), store, budget, meals: accepted, conditions: [...CONDITIONS, ...new Set(accepted.flatMap(m => m.conditions.map(note => `${m.name}：${note}`)))], demo: false };
  return { snapshot, requests };
}

export function singleCandidates(menu) {
  if (!menu?.meals || !Array.isArray(menu.categories)) throw new AppError('FORMAT', '餐品格式发生变化，需要更新接入。');
  const category = new Map();
  for (const c of menu.categories) for (const m of c.meals || []) if (!category.has(m.code)) category.set(m.code, c.name || '');
  const candidates = Object.entries(menu.meals).filter(([code, m]) => /^\d{2,24}$/.test(code) && typeof m.name === 'string' &&
    !/套餐|件套|双人|多人|分享|全家|儿童|亲子|开心乐园|桶|会员卡|早餐卡|麦金卡|餐具|纸袋|酱料|贴纸|星愿贴|玩具|挂件|徽章|杯套|周边|吸管/.test(m.name) &&
    (!/会员|积分|专享|购卡/.test(m.discountType || '') || (m.canWithOrder === true && m.withOrder && /随单购/.test(m.discountType || ''))))
    .map(([code, m]) => ({ code, name: short(m.name), group: /鸡翅/.test(m.name) ? 'side' : classify(m.name) === 'extra' ? classify(m.name, category.get(code)) : classify(m.name), rank: Number(m.originalPrice || m.currentPrice) || 999 }));
  // ponytail: six choices per food shelf keep one phone round short; add pagination if needed.
  const flavor = name => /豆浆/.test(name) ? 'soy' : /牛奶|燕麦奶(?!铁)/.test(name) ? 'milk' : /可乐|雪碧|芬达|怡泉/.test(name) ? 'soda' : /果汁|橙橙|柠柠/.test(name) ? 'juice' : /咖啡|鲜萃|美式|奶铁|卡布/.test(name) ? 'coffee' : /冰淇淋|麦旋风|圆筒/.test(name) ? 'icecream' : /派$/.test(name) ? 'pie' : /麦满分|松饼/.test(name) ? 'muffin' : /吉士/.test(name) ? 'cheese-burger' : /茶/.test(name) ? 'tea' : /纯悦/.test(name) ? 'water' : name;
  const sideOrder = name => { const rank = [/薯条/,/麦乐鸡/,/玉米/,/派$/,/冰淇淋|麦旋风|圆筒/,/薯饼/].findIndex(re=>re.test(name)); return rank < 0 ? 9 : rank; };
  const groups = ['main', 'side', 'drink'].map(group => {
    const seen = new Set(), first = [], rest = [];
    for (const m of candidates.filter(m => m.group === group).sort((a, b) => (group === 'side' ? sideOrder(a.name)-sideOrder(b.name) : group === 'drink' ? Number(!/可乐/.test(a.name))-Number(!/可乐/.test(b.name)) : 0) || a.rank - b.rank)) {
      const key = flavor(m.name); (seen.has(key) ? rest : first).push(m); seen.add(key);
    }
    return [...first, ...rest].slice(0, 8);
  });
  return Array.from({length:Math.max(...groups.map(g=>g.length))},(_,i)=>groups.flatMap(g=>g[i]?[g[i]]:[])).flat();
}

export async function buildTrayMenu(call, store, budget, signal) {
  const args = { storeCode: store.id, beType: 1, orderType: 1 };
  const candidates = singleCandidates(await call('query-meals', args, signal));
  const products = [], requests = new Map(), counts = { main: 0, side: 0, drink: 0 }, seen = new Set();
  const fatal = e => ['AUTH', 'TIMEOUT', 'BUSY'].includes(e.code) || signal?.aborted;
  for (let i = 0; i < candidates.length && products.length < 18; i += 2) {
    const batch = candidates.slice(i, i + 2).filter(c => counts[c.group] < 6);
    const found = await Promise.all(batch.map(async candidate => {
      try {
        const detail = await call('query-meal-detail', { ...args, code: candidate.code }, signal);
        if (detail?.code !== candidate.code || typeof detail.name !== 'string' || !Array.isArray(detail.rounds) || detail.rounds.length > 1) return null;
        const request = { productCode: detail.code, quantity: 1 };
        let code = detail.code, name = detail.name;
        // Coke is a one-item size selector in the live API, not a multi-item meal.
        if (detail.rounds.length) {
          const r = detail.rounds[0], defaults = r.choices?.filter(c => c.isDefault === 1) || [];
          if (r.quantity !== 1 || r.minQuantity !== 1 || r.maxQuantity !== 1 || defaults.length !== 1 || !/^\d{1,24}$/.test(String(r.id))) return null;
          const c = defaults[0];
          if (!/^\d{2,24}$/.test(c.code) || typeof c.name !== 'string' || !(c.maxQuantity === -1 || c.maxQuantity >= 1)) return null;
          code = c.code; name = c.name;
          request.roundList = [{ round: String(r.id), comboItemList: [{ code, quantity: 1 }] }];
        }
        const quote = await call('calculate-price', { ...args, needTableware: false, items: [request] }, signal);
        return { product: { id: randomUUID(), code, name: short(name), spec: '标准', group: candidate.group, price: priceFrom(quote), conditions: quoteNotes(quote) }, request };
      } catch (e) { if (fatal(e)) throw e; return null; }
    }));
    for (const item of found) if (item && counts[item.product.group] < 6 && !seen.has(item.product.code)) {
      seen.add(item.product.code); counts[item.product.group]++; products.push(item.product); requests.set(item.product.id, item.request);
    }
  }
  if (products.length < 3 || Object.values(counts).filter(Boolean).length < 2) throw new AppError('TOO_FEW', '这家店当前可搭配的单品太少，换一家门店试试。', 422);
  const snapshot = { mode: 'tray', id: randomUUID(), createdAt: new Date().toISOString(), store, budget, products, demo: false,
    conditions: ['托盘是你自己的搭配；单点估算为各单品查询价之和，不代表官方套餐优惠。', '整盘核价按实际单品与数量查询，不购卡、不使用私人优惠券或积分；以麦当劳官方结算页为准。'] };
  return { snapshot, requests };
}

export const CATALOG_CONDITIONS = ['搭配估算为已核价购买项之和，整盘优惠以重新核价和官方结算为准。', '到店自取；不购卡、不使用私人优惠券或积分。报价可能受门店、时段或账号条件影响。'];
export function catalogFrom(menu) {
  if (!menu?.meals || !Array.isArray(menu.categories) || Object.keys(menu.meals).length > 500) throw new AppError('FORMAT', '菜单格式有变化，请更换门店或稍后重试。');
  const products = [], categories = [], seen = new Set();
  const excluded = /会员卡|早餐卡|麦金卡|餐具|纸袋|贴纸|星愿贴|玩具|挂件|徽章|杯套|周边|吸管|丝巾|围巾|钥匙扣|公仔|帆布袋|保温杯/;
  const add = (code, category) => {
    const m = menu.meals[code];
    if (seen.has(code) || !/^\d{2,24}$/.test(code) || !m || typeof m.name !== 'string' || excluded.test(m.name)) return;
    if (/会员|积分|专享|购卡/.test(m.discountType || '') && !(m.canWithOrder === true && m.withOrder && /随单购/.test(m.discountType || ''))) return;
    seen.add(code); products.push({ id: code, name: short(m.name), category, group: classify(m.name), combo: /套餐|件套|双人|多人|分享|全家|儿童|亲子|开心乐园|桶|随心配/.test(m.name) });
  };
  for (const [index, c] of menu.categories.entries()) {
    const id = `category-${index}`; categories.push({ id, name: short(c.name, 40).replace(/\s+/g, '') || '餐品' });
    for (const m of c.meals || []) add(m.code, id);
  }
  categories.push({ id: 'other', name: '其他餐品' });
  for (const code of Object.keys(menu.meals)) add(code, 'other');
  return { products, categories: categories.filter(c => products.some(p => p.category === c.id)), sourceCount: Object.keys(menu.meals).length };
}

export function detailFrom(raw, product) {
  if (raw?.code !== product.id || typeof raw.name !== 'string' || !Array.isArray(raw.rounds) || raw.rounds.length > 20) throw new AppError('FORMAT', '这份餐的组成暂时无法读取，请重试。');
  const rounds = raw.rounds.map(r => {
    const id = String(r.id), min = Number(r.minQuantity), max = Number(r.maxQuantity);
    if (!/^\d{1,24}$/.test(id) || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max < min || max > 20 || !Array.isArray(r.choices) || r.choices.length > 200) throw new AppError('FORMAT', '这份餐的搭配规则暂时无法读取。');
    const choices = r.choices.filter(c => c.maxQuantity !== 0).map(c => {
      const limit = Number(c.maxQuantity);
      if (!/^\d{2,24}$/.test(c.code) || typeof c.name !== 'string' || !Number.isSafeInteger(limit) || (limit !== -1 && limit < 1)) throw new AppError('FORMAT', '这份餐的替换选项暂时无法读取。');
      return { id: c.code, name: short(c.name), group: classify(c.name, r.name), max: limit === -1 ? max : Math.min(limit, max), defaultQuantity: c.isDefault === 1 ? Number(c.quantity) || 1 : 0 };
    });
    if (new Set(choices.map(c => c.id)).size !== choices.length || !choices.length) throw new AppError('FORMAT', '这份餐的选项暂时无法确认。');
    return { id, name: short(r.name, 60), min, max, choices };
  });
  if (new Set(rounds.map(r => r.id)).size !== rounds.length) throw new AppError('FORMAT', '这份餐的搭配规则重复了，请重试。');
  return { id: product.id, name: short(raw.name), rounds, group: product.group, combo: product.combo || rounds.reduce((n,r)=>n+r.min,0) > 1 };
}

export function configuredMeal(detail, selections) {
  if (selections === undefined) selections = detail.rounds.map(r => ({ roundId: r.id, choices: r.choices.filter(c=>c.defaultQuantity>0).map(c=>({id:c.id,quantity:c.defaultQuantity})) }));
  if (!Array.isArray(selections) || selections.length !== detail.rounds.length || new Set(selections.map(s=>s?.roundId)).size !== selections.length) throw new AppError('CHOICE', '请按套餐要求完成每一组选择。', 400);
  const items = [], roundList = [], canonical = [];
  for (const r of detail.rounds) {
    const s = selections.find(s=>s?.roundId===r.id);
    if (!s || !Array.isArray(s.choices) || s.choices.length > r.choices.length || new Set(s.choices.map(c=>c?.id)).size !== s.choices.length) throw new AppError('CHOICE', '替换选项不在这份餐的可选范围内。', 400);
    let total = 0; const chosen = [];
    for (const c of s.choices) {
      const choice = r.choices.find(o=>o.id===c?.id);
      if (!choice || !Number.isSafeInteger(c.quantity) || c.quantity < 1 || c.quantity > choice.max) throw new AppError('CHOICE', '请使用当前餐品允许的选项和数量。', 400);
      total += c.quantity; chosen.push({ code: choice.id, quantity: c.quantity });
      items.push({ code: choice.id, name: choice.name, group: choice.group, spec: '标准', quantity: c.quantity });
    }
    if (total < r.min || total > r.max) throw new AppError('CHOICE', `${r.name}需要选择 ${r.min===r.max?r.min:`${r.min}–${r.max}`} 份。`, 400);
    chosen.sort((a,b)=>a.code.localeCompare(b.code)); roundList.push({ round: r.id, comboItemList: chosen });
    canonical.push({ roundId: r.id, choices: chosen.map(c=>({id:c.code,quantity:c.quantity})) });
  }
  if (!detail.rounds.length) items.push({ code: detail.id, name: detail.name, group: detail.group, spec: '标准', quantity: 1 });
  if (items.reduce((n,i)=>n+i.quantity,0)>60) throw new AppError('CHOICE', '这份餐的数量过多。', 400);
  const request = { productCode: detail.id, quantity: 1, ...(roundList.length ? { roundList } : {}) };
  const changes = detail.rounds.flatMap(r => {
    const selected = canonical.find(s=>s.roundId===r.id).choices;
    const base = r.choices.filter(c=>c.defaultQuantity>0).map(c=>({id:c.id,quantity:c.defaultQuantity})).sort((a,b)=>a.id.localeCompare(b.id));
    return JSON.stringify(selected) === JSON.stringify(base) ? [] : selected.map(c=>`${r.choices.find(o=>o.id===c.id).name}${c.quantity>1?` × ${c.quantity}`:''}`);
  });
  return { request, items, selections: canonical, changes, name: detail.combo ? detail.name : items[0]?.name || detail.name };
}
