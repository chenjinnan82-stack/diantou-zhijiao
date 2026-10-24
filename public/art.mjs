// Original vector drawings. The same source is used on the page and on the photo card.
const ink = '#25231F', paper = '#F4F0E4', yellow = '#E8C547', green = '#70A58B', orange = '#D88443', purple = '#B69ACA';
const face = '<path d="M101 105v5m29-5v5m-21 9q7 9 14 0" fill="none"/>';
const burger = `<path d="M51 119C44 54 184 38 192 116Z" fill="${yellow}"/><path d="m66 84 5-5m20-6 4 4m21-13 3 5m25 4 4-2m16 17 6 2"/><path d="M49 121q14-11 27 1t28 0 29 0 28 0 31 0l-4 17H52Z" fill="${green}"/><path d="m53 139 34-6 28 14 33-13 39 5-3 15H55Z" fill="${orange}"/><path d="m57 153 37 1 19 18 24-16 45-2 3 14H56Z" fill="${yellow}"/><path d="M53 170h135q5 32-62 33-72 0-73-33Z" fill="${orange}"/>${face}`;
const fries = `<path d="m67 138-8-88 17-3 13 91m1-2-1-108 18 1 3 109m4-2 9-99 17 2-4 103m1-2 19-87 17 3-18 91m-86-3-24-66 16-6 28 70" fill="${yellow}"/><path d="m49 115 18 87q56 12 106-1l19-84-35 13-38-16-34 16Z" fill="${orange}"/><path d="m68 137 12 49m86-48-11 49"/><path d="m97 153 1 5m37-6v5m-30 14q13 8 23-2"/>`;
const muffin = `<path d="M54 115q-9-49 64-51 70-3 70 49Z" fill="${paper}"/><path d="m68 91 5-3m22-8 4 3m24-8 5 4m26 8 5-2m14 15 3 2"/><path d="m55 116 133-3-1 28-131 2Z" fill="${orange}"/><path d="m54 142 37-4 27 13 24-15 45 3-3 21-128 1Z" fill="${yellow}"/><path d="M55 162h131q8 38-63 38-74 0-68-38Z" fill="${paper}"/>${face}`;
const hashbrown = `<path d="M77 59q-20 9-21 35l1 73q2 32 35 35l62-1q30-1 31-35l-2-76q-2-31-30-34Z" fill="${yellow}"/><path d="m73 83 4-3m28-9 4 3m39-2 6 3m15 24-3 5m-91 55 4 3m18 24 6-3m38 4 6-4m21-24 4 3m-98-43 3 4"/><path d="m98 114 1 6m40-6v6m-31 19q12 11 24-1"/>`;
const drink = `<path d="m73 72 13 135 79-1 14-134Z" fill="${purple}"/><path d="m81 124 89-7-5 54-80 7Z" fill="${paper}"/><path d="m118 76 9-54 37-8 4 12-30 8-7 43" fill="${green}"/><path d="m66 67 119-2 3 16-123 1Z" fill="${paper}"/><path d="m101 139 1 5m34-9v5m-24 12q10 8 16-2"/><path d="m98 188 48-1"/>`;
const chicken = `<path d="M76 82q-26-40 9-43 22-22 37 11l28 30q52-10 51 36 18 51-47 67-44 9-53-32-39 1-32-32Z" fill="${orange}"/><path d="m78 71-22-19q-12 4-13-7-14-8-6-17 5-14 16-4 11-3 13 8l27 21" fill="${paper}"/><path d="m121 106 7-4m30 18 5 4m-31 31 6-3m37-13 2 4"/><path d="m126 125 1 4m27-14 1 4m-18 13q7 5 10-2"/>`;
const nuggets = `<path d="m44 113 27 87 103 2 26-85Z" fill="${green}"/><path d="M64 129q-28-28-9-45 9-10 25-4 11-26 32-19 14 2 15 27 28-26 47-7 7 10-1 25 29 0 27 27Z" fill="${orange}"/><path d="m76 106q15-17 27 1m27 1q10-13 21-7"/><path d="m88 151 1 5m49-5 1 5m-35 13q11 13 24 0"/>`;
const corn = `<path d="m64 98 10 101q48 19 96-1l9-103Z" fill="${green}"/><ellipse cx="121" cy="98" rx="58" ry="26" fill="${yellow}"/><path d="m81 94 7 3m15-11 6 4m16-3 7 4m16 4 7-1m-44 11 6 4m20-8 5 3"/><path d="m99 144 1 5m37-6v5m-29 16q10 8 17-1"/>`;
const coffee = `<path d="m65 87 13 113q43 10 83-2l12-110Z" fill="${paper}"/><path d="m69 123 100-1-5 44-91 1Z" fill="${orange}"/><path d="m60 78 121-1 3 17H58Z" fill="${ink}"/><path d="m72 77 5-13 89-1 5 14Z" fill="${paper}"/><path d="m105 45q-16-11 1-22m26 22q16-12 1-23m-28 117v5m28-5v5m-20 9q7 7 13-1"/>`;
const wrap = `<path d="M83 47q36-24 71 8l28 111-95 37-30-100Z" fill="${yellow}"/><path d="M83 47q16-18 29 0 22-13 29 7 17-1 13 15l-67 17Z" fill="${green}"/><path d="m60 113 58 17 50-35 22 91-93 28Z" fill="${paper}"/><path d="m118 130 25 68m-48-45v5m65-14v5m-49 13q12 10 19-1"/>`;
const box = `<path d="m47 105 48-39 103 13-35 45Z" fill="${yellow}"/><path d="m47 105 8 80 104 25 4-86Z" fill="${orange}"/><path d="m163 124 35-45-5 99-34 32Z" fill="${green}"/><path d="m78 143 1 5m45 7 1 5m-35 8q12 12 24 5"/>`;
const icecream = `<path d="m77 116 42 96 45-98Z" fill="${yellow}"/><path d="m89 143 47 45m-36-66 47 44m-58 18 56-44m-44 69 29-37"/><path d="M68 116q-12-28 14-37-9-23 19-28-3-23 29-29-7 20 14 28 23 7 16 29 29 7 15 37Z" fill="${paper}"/><path d="m84 79q27 8 74 0m-58-28q18 7 42-1m-43 45v5m34-5v5m-24 7q7 7 14 0"/>`;
const pie = `<path d="m57 73 118-12 15 122-119 14Z" fill="${orange}"/><path d="m67 79 98-9 12 106-98 11Z" fill="${yellow}"/><path d="m86 96 27-3m-21 25 38-4m-32 24 41-4m-34 26 27-3m-64-68 3 6m5 92 6-1m92-95 2 7"/>`;
const porridge = `<path d="m42 109 21 66q56 49 116 0l19-66Z" fill="${green}"/><ellipse cx="120" cy="109" rx="78" ry="30" fill="${paper}"/><path d="m70 108 8 3m23-12 7 3m38 6 7 4m-44 4 8 3m49-72-34 67 10 5 39-66Z" fill="${orange}"/><path d="m95 158 1 5m41-5v5m-30 10q12 10 23-1"/>`;
const water = `<path d="m99 42-2 26-20 22-1 105q40 20 83-1l-2-105-20-23-1-25Z" fill="${paper}"/><path d="m78 117 79-1 1 47-80 1Z" fill="${green}"/><path d="m97 35 41 1v14l-41-1Zm2 101v5m34-5v5m-24 9q9 7 17-1" fill="${purple}"/>`;
const milk = `<path d="m68 77 20-31 57 1 23 31 1 126-101-1Z" fill="${paper}"/><path d="m68 77 72-1 28 2m-28-2 5-29m-5 29 2 127 27 1-1-126Z" fill="${green}"/><path d="m74 114 61-2 1 48-61 2Z" fill="${purple}"/><path d="m88 129v5m29-5v5m-22 13q8 7 15-1"/><path d="m91 47 49 1m-57 131 39-1"/>`;
const juice = milk.replaceAll(purple,orange).replaceAll(green,yellow);
const fishburger = burger.replaceAll(orange,'#C2A676').replace('m53 139 34-6 28 14 33-13 39 5-3 15H55Z','m53 137 134-3 0 22-134-1Z');
const cheeseburger = burger.replaceAll(green,yellow).replaceAll(orange,'#B8845A');
export const kinds = { burger, muffin, chicken, fries, hashbrown, drink, coffee, corn, nuggets, wrap, box, icecream, pie, porridge, water, milk, juice, fishburger, cheeseburger };
export function foodKind(name = '') {
  if (/冰淇淋|麦旋风|阿芙佳朵|圆筒/.test(name)) return 'icecream';
  if (/派/.test(name)) return 'pie';
  if (/粥/.test(name)) return 'porridge';
  if (/纯悦|矿泉水/.test(name)) return 'water';
  if (/苹果汁|橙汁|果汁/.test(name)) return 'juice';
  if (/纯牛奶|盒装牛奶/.test(name)) return 'milk';
  if (/薯饼/.test(name)) return 'hashbrown';
  if (/薯/.test(name)) return 'fries';
  if (/咖啡|鲜萃|拿铁|奶铁|美式|卡布奇诺/.test(name)) return 'coffee';
  if (/可乐|雪碧|茶|牛奶|果汁|饮料|芬达|豆浆|奶昔/.test(name)) return 'drink';
  if (/玉米|沙拉/.test(name)) return 'corn';
  if (/麦乐鸡|鸡块|鸡米花/.test(name)) return 'nuggets';
  if (/卷/.test(name)) return 'wrap';
  if (/麦满分/.test(name)) return 'muffin';
  if (/麦香鱼/.test(name)) return 'fishburger';
  if (/吉士/.test(name)) return 'cheeseburger';
  if (/堡|麦香鸡|麦香鱼/.test(name)) return 'burger';
  if (/鸡腿|鸡翅|炸鸡/.test(name)) return 'chicken';
  return 'box';
}
export function foodSVG(kind, className = '') {
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${kinds[kind] || box}</svg>`;
}
export function orderSVG(order, className = '') {
  if (!order.combo) return foodSVG(foodKind(order.items?.[0]?.name || order.name), className);
  const items = order.items || [], chosen = [];
  for (const group of ['main','side','drink']) { const item=items.find(i=>i.group===group); if(item) chosen.push(item); }
  for (const item of items) { if(chosen.length>=3)break; if(!chosen.includes(item))chosen.push(item); }
  const slots=[[8,35,.57],[92,29,.55],[54,87,.57]], count=items.every(i=>Number.isSafeInteger(i.quantity))?items.reduce((n,i)=>n+i.quantity,0):0;
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 43 204 3-5 170-202-3Z" fill="${paper}"/><path d="m24 54 184 2-3 148-181-1Z" stroke="#a29a87"/>${chosen.map((item,i)=>`<g transform="translate(${slots[i][0]} ${slots[i][1]}) scale(${slots[i][2]})">${kinds[foodKind(item.name)]}</g>`).join('')}<path d="m165 194 50 1-1 26-50-2Z" fill="${yellow}"/><text x="190" y="213" font-family="sans-serif" font-size="15" text-anchor="middle" fill="${ink}" stroke="none">${count?count+'件套':'套餐'}</text></svg>`;
}
export function orderTraySVG(orders, className='') {
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 210" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M26 12 292 15q16 1 17 18l-2 149q-1 16-19 17L27 195q-16-1-16-19L10 34q0-22 16-22Z" fill="${paper}" stroke="${ink}" stroke-width="2.6"/>${orders.map((o,i)=>`<g transform="translate(${(o.x??[.25,.7,.48,.17,.82,.48][i])*280+20-55} ${(o.y??[.36,.35,.72,.74,.73,.24][i])*170+20-55}) scale(.46)">${orderSVG(o).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</g>`).join('')}</svg>`;
}
export function mealSVG(items, className = '', orders) {
  if (orders) return orderTraySVG(orders,className);
  if (items.some(i => Number.isFinite(i.x))) return traySVG(items, className);
  const main = items.find(i => i.group === 'main') || items[0];
  const side = items.find(i => i.group === 'side');
  const cup = items.find(i => i.group === 'drink');
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 210" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="155" cy="182" rx="134" ry="16" fill="${paper}"/>${cup ? `<g transform="translate(187 -5) scale(.65)">${kinds[foodKind(cup.name)]}</g>` : ''}${side ? `<g transform="translate(108 35) scale(.68)">${kinds[foodKind(side.name)]}</g>` : ''}<g transform="translate(-4 5) scale(.86)">${kinds[foodKind(main?.name)]}</g></svg>`;
}
export function traySVG(items = [], className = '', color = paper) {
  const slots = [[.26,.38],[.68,.35],[.48,.70],[.18,.74],[.82,.72],[.48,.23]];
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 210" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M26 12 292 15q16 1 17 18l-2 149q-1 16-19 17L27 195q-16-1-16-19L10 34q0-22 16-22Z" fill="${color}"/><path d="m31 29 255 3q7 0 7 10l-2 131q0 9-10 10L34 180q-7 0-8-9L25 41q0-12 6-12Z"/><path d="m16 89 7-1m271 26 12 1"/>${items.map((item,i) => { const x = item.x ?? slots[i%6][0], y = item.y ?? slots[i%6][1]; return `<g transform="translate(${x*280+20-65} ${y*170+20-65}) scale(.54)">${kinds[foodKind(item.name)]}</g>`; }).join('')}</svg>`;
}
export function coveredTraySVG(color = yellow) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 270" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m32 82 319 1-13 144q-147 17-298-3Z" fill="${paper}"/><path d="M47 67q-2-21 24-23l245 3q20 1 22 22l11 137q-149 18-313-3Z" fill="${color}"/><path d="m60 64 257 3 9 121q-129 14-265-3Z"/><path d="M162 126q-23-33 6-39 30-5 34 28 32-21 41 3 4 20-49 48-56-20-32-40Z" fill="${paper}"/><path d="m179 123v5m27-5v5m-20 13q8 6 14-2M16 121l-12-5m358 35 13-3m-66-119 5-15M65 28l-8-12"/></svg>`;
}
export function envelopeSVG(color = yellow) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 270" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m35 58 311-6 5 190-313 4Z" fill="${color}"/><path d="m37 62 156 109L344 55m-188 90L40 240m188-96 121 96"/><path d="M171 132q-20-22-32 1-8 23 53 51 54-34 36-52-13-15-30 7-8-18-27-7Z" fill="${paper}"/><path d="m179 147v4m24-5v4m-18 9q8 5 12-2M13 105l-10-3m352 63 20 4m-57-140 8-16M53 25l-7-13"/></svg>`;
}
