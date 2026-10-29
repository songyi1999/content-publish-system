/**
 * 天气组件（PD-02，免费数据源 open-meteo，无需 Key）：
 * - 坐标来源优先级：URL 参数 ?lat=&lon=（内网固定场所推荐）> localStorage 缓存 > IP 定位（ip-api.com）
 * - 断网/失败时静默隐藏，不影响播放
 */
export interface WeatherNow {
  temperature: number;
  weatherCode: number;
  updatedAt: number;
}

const CACHE_KEY = 'cps.weather';
const COORD_KEY = 'cps.coords';
const TTL_MS = 60 * 60 * 1000;

export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '❄️';
  return '⛈️';
}

async function coordsFromUrl(): Promise<{ lat: number; lon: number } | null> {
  const p = new URLSearchParams(location.search);
  const lat = Number(p.get('lat'));
  const lon = Number(p.get('lon'));
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
    localStorage.setItem(COORD_KEY, JSON.stringify({ lat, lon }));
    return { lat, lon };
  }
  return null;
}

async function cachedCoords(): Promise<{ lat: number; lon: number } | null> {
  const raw = localStorage.getItem(COORD_KEY);
  if (raw) return JSON.parse(raw) as { lat: number; lon: number };
  return null;
}

async function coordsFromIp(): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch('http://ip-api.com/json/?fields=lat,lon', { signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { lat?: number; lon?: number };
    if (typeof j.lat === 'number' && typeof j.lon === 'number') {
      localStorage.setItem(COORD_KEY, JSON.stringify({ lat: j.lat, lon: j.lon }));
      return { lat: j.lat, lon: j.lon };
    }
  } catch {
    /* 离线容忍 */
  }
  return null;
}

export async function fetchWeather(): Promise<WeatherNow | null> {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const w = JSON.parse(cached) as WeatherNow;
    if (Date.now() - w.updatedAt < TTL_MS) return w;
  }
  const coords = (await coordsFromUrl()) ?? (await cachedCoords()) ?? (await coordsFromIp());
  if (!coords) return null;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const j = (await res.json()) as { current_weather?: { temperature: number; weathercode: number } };
    if (!j.current_weather) return null;
    const w: WeatherNow = {
      temperature: Math.round(j.current_weather.temperature),
      weatherCode: j.current_weather.weathercode,
      updatedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
    return w;
  } catch {
    return cached ? (JSON.parse(cached) as WeatherNow) : null;
  }
}
