// Pontos de ônibus do OpenStreetMap (via Overpass) — lógica pura, testável sem rede.
// Só interessa ponto que tenha o CÓDIGO da RMTC (4–5 dígitos): sem ele não dá pra consultar a previsão.

export const REGIAO = { latMin: -17.15, latMax: -16.30, lngMin: -49.70, lngMax: -48.80 }; // Grande Goiânia
export const TILE = 0.02;      // ~2,2 km: o app só pede por "quadras" fixas (cache + não envia localização exata)
export const RAIO_M = 3500;    // cobre 2 km a partir de qualquer ponto do quadrado
export const MAX_STOPS = 1500;

// Tags onde o código do ponto costuma aparecer no OSM, em ordem de preferência
const TAGS_CODIGO = ['ref:rmtc', 'ref', 'local_ref'];

export const dentroDaRegiao = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= REGIAO.latMin && lat <= REGIAO.latMax && lng >= REGIAO.lngMin && lng <= REGIAO.lngMax;

const r4 = (n) => Math.round(n * 10000) / 10000;

export const tileCenter = (lat, lng) => ({
  lat: r4(Math.round(lat / TILE) * TILE),
  lng: r4(Math.round(lng / TILE) * TILE),
});

export const buildQuery = (lat, lng, raio = RAIO_M) =>
  `[out:json][timeout:8];(` +
  `node["highway"="bus_stop"](around:${raio},${lat},${lng});` +
  `node["public_transport"="platform"]["bus"="yes"](around:${raio},${lat},${lng});` +
  `);out body ${MAX_STOPS};`;

export function codigoDoPonto(tags) {
  for (const t of TAGS_CODIGO) {
    const v = String(tags?.[t] ?? '').trim();
    if (/^\d{4,5}$/.test(v)) return v.padStart(5, '0');
  }
  return null;
}

// Nome vem de gente editando mapa: tira marcação/aspas/controle pra nunca virar HTML por engano
export const limparNome = (s) =>
  String(s ?? '').replace(/[\u0000-\u001f<>"'`&\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

export function parseOsmPontos(json) {
  const elements = Array.isArray(json?.elements) ? json.elements : [];
  const stops = [];
  const vistos = new Set();
  const semCodigo = [];
  let total = 0;

  for (const el of elements) {
    if (el?.type !== 'node' || !Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
    total += 1;
    const id = codigoDoPonto(el.tags);
    if (!id) {
      if (semCodigo.length < 3) semCodigo.push(el.tags ?? {});
      continue;
    }
    if (vistos.has(id) || !dentroDaRegiao(el.lat, el.lon)) continue;
    vistos.add(id);
    const nome = limparNome(el.tags?.name);
    stops.push({
      id,
      lat: Math.round(el.lat * 1e6) / 1e6,
      lng: Math.round(el.lon * 1e6) / 1e6,
      nome: nome ? `${nome} (${id})` : `Ponto ${id}`,
    });
  }
  return { stops, total, comCodigo: stops.length, semCodigo };
}
