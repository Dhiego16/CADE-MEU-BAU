// Pontos de ônibus do OpenStreetMap com código da RMTC, perto de uma localização.
//
//   GET /api/pontos-osm?lat=-16.68&lng=-49.25
//        → { fonte, centro, raioM, total, comCodigo, stops: [{ id, lat, lng, nome }] }
//   GET /api/pontos-osm?lat=..&lng=..&diag=1   (diagnóstico: quantos pontos o OSM tem e quantos têm código)
//
// A localização é arredondada pra "quadras" de ~2 km (cache e privacidade). Resposta fica em cache
// na Vercel por 24 h. Se o Overpass falhar, devolve 502 e o app segue só com o pontos.json.

import { dentroDaRegiao, tileCenter, buildQuery, parseOsmPontos, RAIO_M } from './_osmPontos.js';

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'cade-meu-bau/1.0 (+https://cademeubau.vercel.app)';
const FETCH_TIMEOUT_MS = 8500;
const CACHE_TTL_MS = 6 * 3600 * 1000;
const CACHE_MAX = 100;
const cache = new Map();

export async function consultarOverpass(lat, lng, fetchImpl = fetch) {
  const body = new URLSearchParams({ data: buildQuery(lat, lng) }).toString();
  const controllers = MIRRORS.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach(c => c.abort()), FETCH_TIMEOUT_MS);

  try {
    const json = await Promise.any(MIRRORS.map(async (url, i) => {
      const res = await fetchImpl(url, {
        method: 'POST',
        signal: controllers[i].signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const j = await res.json();
      // Overpass devolve 200 com "remark" quando estoura tempo/memória
      if (!Array.isArray(j?.elements) || (j.remark && j.elements.length === 0)) throw new Error('Overpass sem dados');
      return j;
    }));
    controllers.forEach(c => c.abort()); // cancela o espelho que perdeu a corrida
    return parseOsmPontos(json);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' });

  const lat = Number.parseFloat(String(req.query?.lat));
  const lng = Number.parseFloat(String(req.query?.lng));
  if (!dentroDaRegiao(lat, lng)) {
    return res.status(400).json({ erro: 'lat/lng ausentes ou fora da Grande Goiânia.' });
  }

  const centro = tileCenter(lat, lng);
  const key = `${centro.lat},${centro.lng}`;
  const diag = String(req.query?.diag ?? '') === '1';
  const now = Date.now();

  let hit = cache.get(key);
  if (!hit || now - hit.time > CACHE_TTL_MS) {
    try {
      const data = await consultarOverpass(centro.lat, centro.lng);
      hit = { time: now, data };
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, hit);
    } catch (err) {
      console.error('[pontos-osm] Overpass falhou:', err instanceof Error ? err.message : err);
      return res.status(502).json({ erro: 'Mapa colaborativo indisponível agora.' });
    }
  }

  const { stops, total, comCodigo, semCodigo } = hit.data;
  const out = { fonte: 'osm', centro, raioM: RAIO_M, total, comCodigo, stops };
  if (diag) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ...out, stops: stops.slice(0, 5), exemplosSemCodigo: semCodigo });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json(out);
}
