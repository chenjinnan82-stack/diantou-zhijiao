import { AppError } from './mcp.mjs';

const text = (s, n = 180) => typeof s === 'string' ? s.trim().slice(0, n) : '';
export async function findPlaces(input, key, request = fetch) {
  if (!key) throw new AppError('MAP_UNCONFIGURED', '地点服务正在配置，请稍后重试。', 503);
  const get = async (path, params) => {
    const url = new URL(path, 'https://apis.map.qq.com');
    url.search = new URLSearchParams({ ...params, key, output: 'json' });
    try {
      const response = await request(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.status === 347) return { data: [] };
      if (data.status === 120) throw new AppError('MAP_BUSY', '地点查询有些繁忙，请稍后重试。', 429);
      if (data.status === 121) throw new AppError('MAP_QUOTA', '今日地点查询暂不可用，请稍后再试。已开始的游戏可以继续。', 503);
      if (data.status !== 0) throw new Error();
      return data;
    } catch (error) { if (error instanceof AppError) throw error; throw error?.name==='TimeoutError'||error?.name==='AbortError' ? new AppError('MAP_TIMEOUT', '地点查询超时了，请重试或手动搜索地点。', 504) : new AppError('MAP', '地点查询没有完成，请重试或手动搜索地点。', 502); }
  };
  if (input.coords !== undefined) {
    const c = input.coords;
    if (!c || !Number.isFinite(c.latitude) || Math.abs(c.latitude) > 90 || !Number.isFinite(c.longitude) || Math.abs(c.longitude) > 180 || !Number.isFinite(c.accuracy) || c.accuracy < 0) throw new AppError('INPUT', '定位数据不完整，请重新定位。', 400);
    if (c.accuracy > 1500) throw new AppError('LOCATION_COARSE', '这次定位范围太大，请重新定位，或输入附近的地标。', 422);
    const translated = await get('/ws/coord/v1/translate', { locations: `${c.latitude},${c.longitude}`, type: '1' });
    const p = translated.locations?.[0];
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) throw new AppError('MAP', '没有取得有效位置，请手动搜索地点。');
    const data = await get('/ws/geocoder/v1/', { location: `${p.lat},${p.lng}`, get_poi: '0' });
    const r = data.result, city = text(r?.address_component?.city, 30), address = text(r?.formatted_addresses?.standard_address || r?.address);
    if (!city || !address || (r.ad_info?.nation_code && String(r.ad_info.nation_code) !== '156')) throw new AppError('LOCATION', '没有找到可用的中国大陆地址，请手动搜索地点。', 422);
    return [{ city, address, name: text(r.formatted_addresses?.recommend || address), query: address, source: 'gps', accuracy: Math.ceil(c.accuracy) }];
  }
  const city = text(input.city, 30), keyword = text(input.query, 80);
  if (!city || !keyword || city !== input.city?.trim() || keyword !== input.query?.trim() || /[\x00-\x1f(),]/.test(city + keyword)) throw new AppError('INPUT', '请填写城市和附近的地标。', 400);
  const data = await get('/ws/place/v1/suggestion', { keyword, region: city, region_fix: '1', policy: '0', page_size: '5', page_index: '1' });
  const normalized = s => s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const cityName = normalized(city).replace(/市$/, '');
  let query = normalized(keyword);
  if (query.startsWith(cityName) && query.length > cityName.length) query = query.slice(cityName.length).replace(/^市/, '');
  // The provider may silently drop unmatched words. Only offer an actual matching city and landmark/address.
  return (data.data || []).filter(p => Number(p.type) !== 4 && text(p.city) && text(p.title) && text(p.address)
    && normalized(p.city).replace(/市$/, '') === cityName && query && normalized(`${p.title}${p.address}`).includes(query)).slice(0, 5).map(p => ({
    city: text(p.city, 30), name: text(p.title, 100), address: text(p.address), query: text(`${p.address} ${p.title}`, 200), source: 'search'
  }));
}
