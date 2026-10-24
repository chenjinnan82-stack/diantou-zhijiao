// Explicit development data; never selected as a fallback for a failed real request.
import { randomUUID } from 'node:crypto';
export const demoStore = { id: 'demo-store', name: '纸上麦当劳 · 开发测试门店', address: '本机预览使用，不是真实门店', open: true, hours: '开发预览' };
const item = (code, name, group) => ({ code, name, group, quantity: 1, spec: '标准' });
export function demoMenu(budget = 3000) {
  const mains = ['麦辣鸡腿汉堡', '板烧鸡腿堡', '麦香鱼', '双层吉士汉堡', '原味鸡腿麦满分', '鲜蔬鸡肉卷'];
  const meals = mains.map((name, i) => ({ id: `test-meal-${i + 1}`, name: `${name}套餐`, price: 2200 + i * 100, items: [item(`main-${i}`, name, 'main'), item(i % 3 === 0 ? 'corn' : 'fries', i % 3 === 0 ? '小杯玉米杯' : '中薯条', 'side'), item(i % 2 === 0 ? 'cola' : 'tea', i % 2 === 0 ? '可乐中杯' : '阳光柠檬红茶中杯', 'drink')] })).filter(m => m.price <= budget);
  const long = meals.find(m => m.id === 'test-meal-6');
  if (long) long.name = '鲜蔬鸡肉卷搭配中薯条与阳光柠檬红茶套餐';
  return { id: randomUUID(), createdAt: new Date().toISOString(), store: demoStore, budget, meals, conditions: ['开发测试餐单，商品、门店与价格均不代表实际可售情况。'], demo: true };
}
export function demoTrayMenu(budget = 3000) {
  const food = [
    ['101', '麦辣鸡腿汉堡', 'main', 2200], ['102', '板烧鸡腿堡', 'main', 2400], ['103', '麦香鱼', 'main', 2300], ['104', '双层吉士汉堡', 'main', 2100], ['105', '火腿扒麦满分', 'main', 1000], ['106', '鲜蔬鸡肉卷', 'main', 1600],
    ['201', '中薯条', 'side', 1400], ['202', '麦乐鸡（5块）', 'side', 1300], ['203', '小杯玉米杯', 'side', 1000], ['204', '香芋派', 'side', 750], ['205', '圆筒冰淇淋', 'side', 500], ['206', '脆薯饼', 'side', 850],
    ['301', '可乐（小杯）', 'drink', 950], ['302', '阳光柠檬红茶', 'drink', 950], ['303', '小杯鲜萃咖啡', 'drink', 950], ['304', '纯牛奶（盒装）', 'drink', 1050], ['305', '100%苹果汁', 'drink', 1150], ['306', '优品豆浆', 'drink', 950]
  ];
  return { mode: 'tray', id: randomUUID(), createdAt: new Date().toISOString(), store: demoStore, budget, products: food.map(([code, name, group, price]) => ({ id: `test-${code}`, code, name, group, price, spec: '标准', conditions: [] })), conditions: ['开发测试食物与价格，不代表真实可售餐品。'], demo: true };
}

export function demoCatalog() {
  const singles=demoTrayMenu().products;
  const extras=Array.from({length:18},(_,i)=>({code:String(600+i),name:`测试饮品 ${i+1} 号`}));
  const combos=[['901','麦辣鸡腿堡三件套'],['902','双人分享八件套'],['903','随心配 1＋1']];
  const meals=Object.fromEntries([...singles,...extras].map(p=>[p.code,{name:p.name,currentPrice:'1'}]));
  for(const [id,name]of combos)meals[id]={name};
  return {categories:[{name:'套餐',meals:combos.map(([code])=>({code}))},...['main','side','drink'].map((g,i)=>({name:['主食','小食','饮料'][i],meals:singles.filter(p=>p.group===g).map(p=>({code:p.code}))})),{name:'更多测试饮品',meals:extras.map(p=>({code:p.code}))}],meals};
}
export function demoDetail(code) {
  const products=demoTrayMenu().products;
  const choice=(id,quantity=0)=>({code:id,name:products.find(p=>p.code===id)?.name||'测试饮品',quantity:quantity||1,isDefault:quantity?1:0,maxQuantity:-1});
  const round=(id,name,n,ids)=>({id,name,quantity:n,minQuantity:n,maxQuantity:n,choices:ids.map((code,i)=>choice(code,i===0?n:0))});
  const combos={
    '901':[round(1,'主食',1,['101','102']),round(2,'配餐',1,['201','203']),round(3,'饮料',1,['301','302','303','304'])],
    '902':[round(1,'汉堡',2,['101','102','103']),round(2,'小食',4,['201','202','203']),round(3,'饮料',2,['301','302','303'])],
    '903':[round(1,'蓝区',1,['101','202']),round(2,'粉区',1,['301','205'])]
  };
  return {code,name:demoCatalog().meals[code].name,rounds:combos[code]||[]};
}
export function demoQuote(request) {
  const prices={'901':3200,'902':8900,'903':1390};
  const extra=(request.roundList||[]).flatMap(r=>r.comboItemList).filter(i=>i.code==='303').reduce((n,i)=>n+i.quantity*100,0);
  return {price:(prices[request.productCode]||demoTrayMenu().products.find(p=>p.code===request.productCode)?.price||1000)+extra};
}
export const demoPlaces = async () => [{city:'上海',name:'人民广场 · 测试地点',address:'测试地址',query:'人民广场',source:'search'}];
