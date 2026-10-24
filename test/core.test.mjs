import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { newGame, transition, restoreGame, results, compareMeals, signature } from '../public/game.mjs';
import { demoMenu } from './demo.mjs';
import { combinations, eligibleMeals, classify, quoteArgs, priceFrom, normalizeStores, buildMenu, limiter, upstreamData, quoteNotes, isAuthFailure } from '../mcp.mjs';
import { createApp, BASE, cacheQuery, boundedPut } from '../server.mjs';
import { foodKind } from '../public/art.mjs';

test('complete pass-and-play flow, sealed stages and refresh validation', () => {
  let g = newGame(['小王', '小李'], demoMenu());
  const apply = (event, value) => { g = transition(g, event, value); assert.deepEqual(restoreGame(JSON.stringify(g)), g); };
  assert.throws(() => transition(g, 'next'));
  assert.throws(() => transition(g, 'choose', 'forged'));
  apply('choose', 'test-meal-1'); apply('next'); apply('choose', 'test-meal-2');
  apply('back'); apply('choose', 'test-meal-3'); apply('next'); apply('next');
  assert.equal(g.stage, 'handoff'); assert.throws(() => transition(g, 'back')); assert.throws(() => transition(g, 'next')); assert.throws(() => results(g));
  apply('receive'); apply('choose', 'test-meal-2'); apply('next'); apply('choose', 'test-meal-1'); apply('next');
  assert.equal(g.stage, 'ready'); assert.throws(() => transition(g, 'choose', 'test-meal-4'));
  apply('reveal'); assert.equal(results(g)[1].exact, true); assert.equal(results(g)[0].exact, false); assert.throws(() => transition(g, 'reveal'));
  assert.equal(restoreGame('{broken'), null);
  const corrupt = structuredClone(g); corrupt.answers.a.self = 'unknown'; assert.equal(restoreGame(JSON.stringify(corrupt)), null);
  assert.equal(restoreGame(JSON.stringify({ ...g, stage: 'a-self' })), null);
});
test('identity compares codes, specifications and summed quantities, not names or prices', () => {
  const meal = demoMenu().meals[0];
  assert.equal(compareMeals(meal, { ...meal, name: 'renamed', price: 9999 }).exact, true);
  const partial = structuredClone(meal); partial.items[2].code = 'different-drink';
  assert.deepEqual(compareMeals(meal, partial).groups.map(g => g.match), [true, true, false]);
  const different = structuredClone(meal); different.items.forEach(i => i.code += '-different'); assert.equal(compareMeals(meal, different).groups.some(g => g.match), false);
  const specs = structuredClone(meal); specs.items[0].spec = 'another'; assert.equal(compareMeals(meal, specs).exact, false);
  assert.equal(signature([{ code: 'a', quantity: 2 }]), signature([{ code: 'a', quantity: 1 }, { code: 'a', quantity: 1 }]));
});
const choice = (code, name, isDefault = 1) => ({ code, name, isDefault, maxQuantity: -1 });
const detail = (code = '990001') => ({ code, name: '测试套餐', rounds: [
  { id: 1, name: '主餐', quantity: 1, minQuantity: 1, maxQuantity: 1, choices: [choice('100', '汉堡')] },
  { id: 2, name: '小食', quantity: 1, minQuantity: 1, maxQuantity: 1, choices: [choice('200', '中薯条'), choice('201', '小杯玉米杯', 0)] },
  { id: 3, name: '饮料', quantity: 1, minQuantity: 1, maxQuantity: 1, choices: [choice('300', '可乐中杯'), choice('301', '纯牛奶', 0)] }
] });
test('legal combinations, account-conditional exclusions, price units and input envelope', () => {
  const combos = combinations(detail()); assert.equal(combos.length, 3);
  assert.deepEqual(combos[0].request.roundList[0], { round: '1', comboItemList: [{ code: '100', quantity: 1 }] });
  const complex = detail(); complex.rounds[1].quantity = 2; assert.equal(combinations(complex).length, 0);
  assert.equal(priceFrom({ price: 2700 }), 2700); assert.throws(() => priceFrom({ price: '27' })); assert.throws(() => priceFrom({ price: -100 }));
  assert.deepEqual(quoteNotes({ conditions: ['限当前门店'], discount: 500 }), ['限当前门店', '本次核价含 5 元优惠，适用条件以你的官方结算页为准。']);
  const catalog = { categories: [], meals: { '990001': { name: '单人套餐', currentPrice: '27' }, '990002': { name: '会员套餐', canWithOrder: true }, '990003': { name: '双人套餐' }, '990004': { name: '单人套餐', discountType: '麦金卡专享' } } };
  assert.equal(eligibleMeals(catalog).length, 1);
  catalog.meals['990005'] = { name: '吉士蛋麦满分早餐套餐', currentPrice: '10.2', canWithOrder: true, withOrder: { cardId: 'test-card', cardType: 2 }, discountType: '随单购早餐卡优惠' };
  const breakfast = eligibleMeals(catalog).find(m => m.code === '990005');
  assert.ok(breakfast); assert.match(breakfast.offer, /不购卡/); assert.ok(!breakfast.offer.includes('10.2'));
  const breakfastDetail = detail(); breakfastDetail.rounds[0].name = '吉士蛋麦满分'; breakfastDetail.rounds[0].choices[0].name = '吉士蛋麦满分';
  const breakfastCombo = combinations(breakfastDetail)[0]; assert.equal(breakfastCombo.items[0].group, 'main');
  assert.equal(classify('图林根香肠早安营养卷'), 'main'); assert.equal(classify('优品豆浆大杯'), 'drink'); assert.equal(classify('脆香油条'), 'side');
  assert.equal(foodKind('原味板烧鸡腿麦满分'), 'muffin'); assert.equal(foodKind('脆薯饼'), 'hashbrown');
  assert.ok(!('withOrder' in quoteArgs('1450713', breakfastCombo))); assert.ok(!JSON.stringify(quoteArgs('1450713', breakfastCombo)).includes('test-card'));
  assert.deepEqual(upstreamData({ content: [{ type: 'text', text: JSON.stringify({ success: true, code: 200, data: { price: 2700 } }) }] }), { price: 2700 });
  assert.throws(() => upstreamData({ content: [{ type: 'text', text: 'not-json' }] }));
  assert.throws(() => upstreamData({ content: [{ type: 'text', text: '{"success":false,"code":401}' }] }), { code: 'AUTH' });
  assert.equal(isAuthFailure({ code: 'CLIENT_HTTP_NOT_IMPLEMENTED', message: 'Error POSTing to endpoint: 当前鉴权码不存在或已失效!' }), true);
  assert.equal(isAuthFailure({ message: 'Connection timed out' }), false);
  assert.equal(normalizeStores([{ storeCode: '12345', storeName: '店', businessStatus: false, secret: 'excluded' }])[0].open, false);
  assert.equal('secret' in normalizeStores([{ storeCode: '12345', storeName: '店', businessStatus: true, secret: 'excluded' }])[0], false);
});
test('menu deduplicates compositions, uses actual quote and includes budget boundary', async () => {
  let quoteCalls = 0;
  const call = async (tool, args) => {
    if (tool === 'query-meals') return { categories: [], meals: { '990001': { name: '单人套餐', currentPrice: '1' }, '990002': { name: '单人套餐', currentPrice: '2' } } };
    if (tool === 'query-meal-detail') return detail(args.code);
    if (tool === 'calculate-price') { quoteCalls++; return { price: 3000 }; }
    throw new Error('unexpected');
  };
  const result = await buildMenu(call, { id: '12345', name: '测试店' }, 3000);
  assert.equal(result.snapshot.meals.length, 3); assert.equal(quoteCalls, 3); assert.equal(result.requests.size, 3);
  assert.ok(result.snapshot.meals.every(m => m.price === 3000));
  await assert.rejects(buildMenu(call, { id: '12345' }, 2999), { code: 'TOO_FEW' });
});
test('bounded cache, query coalescing, upstream concurrency and expired queued work', async () => {
  const memo = cacheQuery(); let count = 0;
  const work = async () => { count++; await new Promise(r => setTimeout(r, 15)); return 1; };
  assert.deepEqual(await Promise.all(Array.from({ length: 30 }, () => memo('same', work))), Array(30).fill(1)); assert.equal(count, 1);
  const map = new Map(); for (let i = 0; i < 20; i++) boundedPut(map, i, i, 3); assert.equal(map.size, 3); assert.ok(!map.has(0));
  const limit = limiter(2, 50); let active = 0, max = 0;
  await Promise.all(Array.from({ length: 25 }, () => limit(async () => { active++; max = Math.max(max, active); await new Promise(r => setTimeout(r, 3)); active--; })));
  assert.equal(max, 2);
  await assert.rejects(limit(() => { throw new Error('must not run'); }, AbortSignal.abort()), { code: 'TIMEOUT' });
});
test('HTTP trust boundaries, development flow and snapshot errors', async t => {
  const app = createApp({ demo: true, log: false }); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => app.close()); const base = `http://127.0.0.1:${app.server.address().port}${BASE}`;
  const request = async (path, body, headers = {}) => { const r = await fetch(`${base}api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  assert.equal((await (await fetch(`${base}api/health`)).json()).status, 'development');
  assert.equal((await request('stores', { city: '', query: 'x' })).status, 400);
  assert.equal((await request('stores', { city: '上海', query: '人民广场' }, { Origin: 'https://untrusted.example' })).status, 403);
  const stores = await request('stores', { city: '上海', query: '人民广场' }); assert.equal(stores.status, 200);
  const menu = await request('menu', { storeId: stores.data.stores[0].id, budget: 3000 }); assert.equal(menu.status, 200); assert.equal(menu.data.demo, true);
  assert.equal((await request('menu', { storeId: 'forged', budget: 3000 })).status, 410);
  assert.equal((await request('menu', { storeId: 'demo-store', budget: '30' })).status, 400);
  assert.equal((await request('quote', { snapshotId: menu.data.id, mealIds: ['forged'] })).status, 400);
  assert.equal((await request('quote', { snapshotId: 'expired', mealIds: ['test-meal-1'] })).status, 410);
  const quote = await request('quote', { snapshotId: menu.data.id, mealIds: ['test-meal-1'] }); assert.equal(quote.data.quotes[0].available, true);
  assert.equal((await request('calculate-price', { items: [] })).status, 404);
  assert.equal((await request('stores', { city: 'x', query: 'x'.repeat(9000) })).status, 413);
  assert.equal((await fetch(`${base}.env`)).status, 404);
});
test('production without token never returns development meals', async t => {
  const app = createApp({ log: false }); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); t.after(() => app.close());
  const response = await fetch(`http://127.0.0.1:${app.server.address().port}${BASE}api/stores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: '上海', query: '人民广场' }) });
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'UNCONFIGURED');
});

test('public HTTP never exposes credentials, private files or raw upstream errors', async t => {
  const secret = 'synthetic-private-value-for-test';
  const app = createApp({ token: secret, mapKey: secret, locate: async () => { throw new Error(`upstream rejected ${secret}`); }, log: false });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}${BASE}`;
  for (const path of ['.env', '.git/config', 'server.mjs', 'mcp.mjs', 'package-lock.json', 'qa/private/live-evidence.json', '%2e%2e%2f.env']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.equal((await response.text()).includes(secret), false);
  }
  const health = await fetch(base + 'api/health');
  assert.equal((await health.text()).includes(secret), false);
  const response = await fetch(base + 'api/places', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: '上海', query: '人民广场' }) });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: { code: 'SERVER', message: '服务暂时开小差了，请重试。' } });
});
