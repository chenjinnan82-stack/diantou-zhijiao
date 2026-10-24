import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { trayKey, MAX_PIECES } from './public/game.mjs';
import { AppError, makeMCP, limiter, normalizeStores, buildMenu, buildTrayMenu, priceFrom, quoteArgs, quoteNotes, CONDITIONS, CATALOG_CONDITIONS, catalogFrom, detailFrom, configuredMeal } from './mcp.mjs';
import { findPlaces } from './places.mjs';

export const BASE = '/lab/play/guess-my-order/';
const root = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
const TTL = 300000;
export function boundedPut(map, key, value, capacity = 200) {
  map.delete(key); map.set(key, value);
  while (map.size > capacity) map.delete(map.keys().next().value);
}
export function cacheQuery() {
  const values = new Map(), pending = new Map();
  return async (key, work, fresh = false) => {
    const hit = values.get(key);
    if (!fresh && hit?.until > Date.now()) return hit.value;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 20) throw new AppError('BUSY', '查询队列已满，请稍后再试。', 429);
    const promise = Promise.resolve().then(work).then(value => {
      // A temporary quote failure must be retryable immediately, not frozen for five minutes.
      if (!value.quotes?.some(q => q.available !== true)) boundedPut(values, key, { value, until: Date.now() + TTL });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
function inputText(v, label, max) {
  if (typeof v !== 'string' || !v.trim() || [...v].length > max || /[\x00-\x1f]/.test(v)) throw new AppError('INPUT', `${label}请填写 1–${max} 个字。`, 400);
  return v.trim();
}
async function readJSON(req) {
  if (!/^application\/json(?:;|$)/.test(req.headers['content-type'] || '')) throw new AppError('INPUT', '请求格式不正确。', 415);
  let bytes = 0, chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) throw new AppError('INPUT', '请求内容太长。', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
  catch { throw new AppError('INPUT', '请求内容不完整。', 400); }
}

export function createApp({ token = '', mapKey = '', locate, demo = false, call, upstreamState = {}, origin = 'https://sanliang.online', log = true } = {}) {
  const upstreamLimit = limiter();
  const mcp = call ? { call, state: upstreamState, close: async () => {} } : makeMCP(token, upstreamLimit);
  const stores = new Map(), snapshots = new Map(), places = new Map(), rate = new Map(), assets = new Map();
  const cached = cacheQuery();
  let demoData;
  async function lookupPlaces(body) {
    const found = locate ? await locate(body) : demo ? [{ city: '测试城市', name: '纸上广场 · 测试地点', address: '开发测试地址', query: '纸上广场', source: body.coords ? 'gps' : 'search' }] : await upstreamLimit(()=>findPlaces(body, mapKey),AbortSignal.timeout(25000));
    return found.map(p => { const place = { ...p, id: randomUUID() }; boundedPut(places, place.id, { value: place, until: Date.now() + TTL }); return place; });
  }
  function snapshotEntry(id) {
    const entry = snapshots.get(inputText(id, '餐单编号', 100));
    if (!entry || entry.until < Date.now()) throw new AppError('EXPIRED', '这局餐单已过期或服务已重启。游戏结果仍在，重新开始可以获取新餐单。', 410);
    return entry;
  }
  async function api(route, body) {
    if (!demo && !token && !call && ['stores','menu','item','quote'].includes(route)) throw new AppError('UNCONFIGURED', '真实餐单尚未接通，请稍后再来。', 503);
    if (mcp.state.access === 'expired' && ['stores', 'menu'].includes(route)) throw new AppError('AUTH', '餐单服务的授权需要更新，已开始的游戏可以继续。', 503);
    if (route === 'places') return { places: await lookupPlaces(body), demo };
    if (route === 'stores') {
      let place;
      if (body.placeId) {
        const record = places.get(inputText(body.placeId, '地点编号', 100));
        if (!record || record.until < Date.now()) throw new AppError('PLACE_EXPIRED', '地点记录过期了，请重新定位或搜索。', 410);
        place = record.value;
      } else {
        // Old clients still have a text search; never let them bypass place validation.
        const found = await lookupPlaces({ city: inputText(body.city, '城市', 20), query: inputText(body.query, '地标', 50) });
        if (found.length !== 1) throw new AppError('LOCATION_REQUIRED', '请刷新页面，在地点候选中确认你要搜索的位置。', 422);
        place = found[0];
      }
      const {city, query} = place;
      return cached(`stores:${city}:${query}`, async () => {
        const list = demo ? [((demoData ||= await import('./test/demo.mjs')).demoStore)] : normalizeStores(await mcp.call('query-nearby-stores', { beType: 1, searchType: 2, city, keyword: query }, AbortSignal.timeout(20000)));
        for (const s of list) boundedPut(stores, s.id, { value: s, until: Date.now() + 7200000 });
        return { stores: list, place, demo };
      });
    }
    if (route === 'menu') {
      const storeId = inputText(body.storeId, '门店', 30), budget = body.budget;
      if (body.mode !== undefined && !['tray','catalog'].includes(body.mode)) throw new AppError('INPUT', '不支持的餐单类型。', 400);
      if (body.mode === 'catalog' ? !(budget === null || (Number.isSafeInteger(budget) && budget > 0)) : (!Number.isSafeInteger(budget) || budget < 1000 || budget > 20000)) throw new AppError('INPUT', '请输入有效的参考预算。', 400);
      const found = stores.get(storeId);
      if (!found || found.until < Date.now()) throw new AppError('STORE_EXPIRED', '门店记录过期了，请重新搜索。', 410);
      if (!found.value.open) throw new AppError('CLOSED', '这家门店当前没有营业，请换一家门店。', 422);
      if (body.mode === 'catalog') {
        const catalog = await cached(`catalog:${storeId}`, async () => catalogFrom(demo ? (demoData ||= await import('./test/demo.mjs')).demoCatalog() : await mcp.call('query-meals', { storeCode: storeId, beType: 1, orderType: 1 }, AbortSignal.timeout(20000))));
        if (catalog.products.length < 3) throw new AppError('TOO_FEW', '可选餐品太少，请换一家门店。', 422);
        const snapshot = { ...catalog, mode: 'catalog', id: randomUUID(), createdAt: new Date().toISOString(), store: found.value, budget, variants: [], conditions: CATALOG_CONDITIONS, demo };
        boundedPut(snapshots, snapshot.id, { snapshot, details: new Map(), requests: new Map(), variants: new Map(), until: Date.now() + 7200000 });
        return snapshot;
      }
      return cached(`menu:${body.mode || 'fixed'}:${storeId}:${budget}`, async () => {
        let result;
        if (body.mode === 'tray') {
          const catalog = await cached(`tray-catalog:${storeId}`, async () => demo ? { snapshot: (demoData ||= await import('./test/demo.mjs')).demoTrayMenu(), requests: new Map() } : buildTrayMenu(mcp.call, found.value, budget, AbortSignal.timeout(60000)));
          result = { ...catalog, snapshot: { ...catalog.snapshot, budget, id: randomUUID() } };
        } else result = demo ? { snapshot: (demoData ||= await import('./test/demo.mjs')).demoMenu(budget), requests: new Map() } : await buildMenu(mcp.call, found.value, budget, AbortSignal.timeout(60000));
        if ((result.snapshot.products || result.snapshot.meals).length < 3) throw new AppError('TOO_FEW', '可选餐品太少，请换一家门店。', 422);
        boundedPut(snapshots, result.snapshot.id, { ...result, until: Date.now() + 7200000 });
        return result.snapshot;
      });
    }
    if (route === 'item') {
      const entry = snapshotEntry(body.snapshotId), snapshot = entry.snapshot;
      if (snapshot.mode !== 'catalog') throw new AppError('INPUT', '请使用新版餐单。', 400);
      const product = snapshot.products.find(p=>p.id===body.productId);
      if (!product) throw new AppError('MEAL', '这份餐不在本局餐单里。', 400);
      const args = { storeCode: snapshot.store.id, beType: 1, orderType: 1 };
      if (!entry.details.has(product.id)) {
        const detail = await cached(`detail:${args.storeCode}:${product.id}`, async () => detailFrom(demo ? (demoData ||= await import('./test/demo.mjs')).demoDetail(product.id) : await mcp.call('query-meal-detail', { ...args, code: product.id }, AbortSignal.timeout(20000)), product));
        entry.details.set(product.id, detail);
      }
      const detail = entry.details.get(product.id);
      let combo;
      try { combo = configuredMeal(detail, body.selections); }
      catch (error) { if (body.selections === undefined && error.code === 'CHOICE') return { detail, variant: null, message: '这份餐需要先选好搭配。' }; throw error; }
      const key = JSON.stringify(combo.request);
      if (entry.variants.has(key)) return { detail, variant: entry.variants.get(key) };
      const quote = await cached(`item:${args.storeCode}:${key}`, async () => demo ? (demoData ||= await import('./test/demo.mjs')).demoQuote(combo.request) : await mcp.call('calculate-price', { ...args, needTableware: false, items: [combo.request] }, AbortSignal.timeout(20000)));
      // One snapshot stores only choices actually visited, bounded independently of the catalog.
      if (entry.variants.size >= 300) throw new AppError('BUSY', '这局更换的搭配较多，请开始新一局。', 429);
      if (!entry.variants.has(key)) {
        const variant = { id: randomUUID(), productId: product.id, name: combo.name, combo: detail.combo, items: combo.items, selections: combo.selections, changes: combo.changes, price: priceFrom(quote), conditions: quoteNotes(quote) };
        entry.variants.set(key, variant); entry.requests.set(variant.id, combo.request); snapshot.variants.push(variant);
      }
      return { detail, variant: entry.variants.get(key) };
    }
    if (route === 'quote') {
      const id = inputText(body.snapshotId, '餐单编号', 100), ids = body.mealIds;
      const entry = snapshots.get(id);
      if (!entry || entry.until < Date.now()) throw new AppError('EXPIRED', '这局餐单已过期或服务已重启。游戏结果仍在，重新开始可以获取新餐单。', 410);
      if (['tray','catalog'].includes(entry.snapshot.mode)) {
        const products = entry.snapshot.mode === 'catalog' ? entry.snapshot.variants : entry.snapshot.products;
        if (!Array.isArray(body.trays) || body.trays.length < 1 || body.trays.length > 2 || body.trays.some(t => !Array.isArray(t) || !t.length || t.length > MAX_PIECES || t.some(id => typeof id !== 'string' || !products.some(p => p.id === id)))) throw new AppError('MEAL', '请使用本局食物，每盘放 1–6 份。', 400);
        const unique = [...new Map(body.trays.map(t => [trayKey(t), t])).entries()];
        return cached(`tray-quote:${id}:${unique.map(([key]) => key).sort().join('|')}`, async () => {
          const quotes = await Promise.all(unique.map(async ([key, tray]) => {
            const counts = new Map(); for (const productId of tray) counts.set(productId, (counts.get(productId) || 0) + 1);
            const estimate = tray.reduce((sum, productId) => sum + products.find(p => p.id === productId).price, 0);
            try {
              const args = { storeCode: entry.snapshot.store.id, beType: 1, orderType: 1, needTableware: false, items: [...counts].map(([productId, quantity]) => ({ ...entry.requests.get(productId), quantity })) };
              const data = demo ? { price: estimate } : await mcp.call('calculate-price', args, AbortSignal.timeout(20000));
              const price = priceFrom(data);
              return { id: key, available: true, price, change: price - estimate, conditions: quoteNotes(data) };
            } catch (e) {
              if (['AUTH', 'UNCONFIGURED', 'BUSY', 'TIMEOUT', 'FORMAT'].includes(e.code)) throw e;
              return { id: key, available: null, price: null, message: '暂时无法核实这盘的价格，请在官方渠道确认。' };
            }
          }));
          return { checkedAt: new Date().toISOString(), quotes, conditions: [...entry.snapshot.conditions, ...new Set(quotes.flatMap(q => q.conditions || []))] };
        });
      }
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 2 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new AppError('INPUT', '请指定本局的一至两份套餐。', 400);
      if (ids.some(id => !entry.snapshot.meals.some(m => m.id === id))) throw new AppError('MEAL', '这份餐不在本局菜单里。', 400);
      return cached(`quote:${id}:${[...ids].sort().join(',')}`, async () => {
        const quotes = await Promise.all(ids.map(async mealId => {
          const meal = entry.snapshot.meals.find(m => m.id === mealId);
          try {
            const data = demo ? { price: meal.price } : await mcp.call('calculate-price', quoteArgs(entry.snapshot.store.id, entry.requests.get(mealId)), AbortSignal.timeout(20000));
            const price = priceFrom(data);
            return { id: mealId, available: true, price, change: price - meal.price, conditions: quoteNotes(data).map(note => `${meal.name}：${note}`) };
          } catch (e) {
            if (['AUTH', 'UNCONFIGURED', 'BUSY', 'TIMEOUT', 'FORMAT'].includes(e.code)) throw e;
            return { id: mealId, available: null, price: null, message: '暂时无法确认是否可售，请在官方渠道核实。' };
          }
        }));
        return { checkedAt: new Date().toISOString(), quotes, conditions: demo ? entry.snapshot.conditions : [...CONDITIONS, ...new Set(quotes.flatMap(q => q.conditions || []))] };
      });
    }
    throw new AppError('NOT_FOUND', '没有这个接口。', 404);
  }
  const server = http.createServer(async (req, res) => {
    const start = Date.now();
    const security = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self)', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" };
    Object.entries(security).forEach(([k, v]) => res.setHeader(k, v));
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    let route = 'static';
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.startsWith(`${BASE}api/`)) {
        route = pathname.slice(`${BASE}api/`.length);
        if (route === 'health' && req.method === 'GET') return json(200, { status: demo ? 'development' : token || call ? 'ready' : 'unconfigured', demo, location: !!(mapKey || locate || demo), upstream: mcp.state });
        if (req.method !== 'POST') throw new AppError('METHOD', '请使用 POST 请求。', 405);
        const requestOrigin = req.headers.origin;
        const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
        if (requestOrigin && requestOrigin !== origin && !(loopback && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestOrigin))) throw new AppError('ORIGIN', '请从游戏页面发起请求。', 403);
        const ip = loopback && req.headers['x-real-ip'] ? String(req.headers['x-real-ip']).slice(0, 64) : req.socket.remoteAddress;
        const rateKey = `${ip}:${route === 'item' ? 'items' : 'queries'}`, now = Date.now(), entry = rate.get(rateKey);
        if (!entry || entry.until < now) boundedPut(rate, rateKey, { count: 1, until: now + 60000 }, 2000);
        else if (++entry.count > (route === 'item' ? 120 : 20)) throw new AppError('RATE', '操作太快了，请稍等一分钟。', 429);
        const body = await readJSON(req);
        const timeout = new Promise((_, reject) => { const timer = setTimeout(() => reject(new AppError('TIMEOUT', '查询超时了，请重试。', 504)), 65000); timer.unref(); res.once('close', () => clearTimeout(timer)); });
        return json(200, await Promise.race([api(route, body), timeout]));
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('METHOD', '不支持的请求。', 405);
      if (pathname === '/' || pathname === BASE.slice(0, -1)) { res.writeHead(302, { Location: BASE }); return res.end(); }
      if (!pathname.startsWith(BASE)) throw new AppError('NOT_FOUND', '没有这个页面。', 404);
      const relative = decodeURIComponent(pathname.slice(BASE.length)) || 'index.html';
      if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || relative.split('/').some(s => s.startsWith('.'))) throw new AppError('NOT_FOUND', '没有这个文件。', 404);
      const path = resolve(root, relative);
      if (!path.startsWith(`${root}/`)) throw new AppError('NOT_FOUND', '没有这个文件。', 404);
      const info = await stat(path).catch(() => null);
      if (!info?.isFile()) throw new AppError('NOT_FOUND', '没有这个文件。', 404);
      let asset = assets.get(path);
      if (!asset || asset.mtime !== info.mtimeMs) { const data = await readFile(path); asset = { mtime: info.mtimeMs, data, gzip: gzipSync(data) }; boundedPut(assets, path, asset, 50); }
      const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding', ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
      res.end(req.method === 'HEAD' ? undefined : gzip ? asset.gzip : asset.data);
    } catch (e) {
      const known = e instanceof AppError;
      if (!res.headersSent) json(known ? e.status : 500, { error: { code: known ? e.code : 'SERVER', message: known ? e.message : '服务暂时开小差了，请重试。' } });
    } finally {
      if (log && route !== 'static') console.log(JSON.stringify({ type: ['places', 'stores', 'menu', 'item', 'quote', 'health'].includes(route) ? route : 'unknown', status: res.statusCode, ms: Date.now() - start }));
    }
  });
  server.requestTimeout = 70000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  return { server, close: async () => { await mcp.close(); await new Promise(resolve => server.close(resolve)); }, api };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const demo = process.argv.includes('--demo'), host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 18426);
  if (demo && (!['127.0.0.1', 'localhost', '::1'].includes(host) || process.env.NODE_ENV === 'production')) throw new Error('Development mode is only available on loopback outside production.');
  const app = createApp({ demo, token: process.env.MCD_MCP_TOKEN, mapKey: process.env.TENCENT_MAP_KEY, origin: process.env.PUBLIC_ORIGIN });
  app.server.listen(port, host, () => console.log(`Guess my order: http://${host}:${port}${BASE} (${demo ? 'explicit test menu' : 'real MCP only'})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
