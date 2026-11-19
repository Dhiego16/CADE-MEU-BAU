// Pontos extras (OpenStreetMap) além do pontos.json, carregados por região conforme o usuário se move.
// Falhou, sem rede ou fora da Grande Goiânia? Devolve [] e o app segue só com o pontos.json.

export interface PontoExtra {
  id: string;
  lat: number;
  lng: number;
  nome: string;
}

export const TILE = 0.02;
const REGIAO = { latMin: -17.15, latMax: -16.30, lngMin: -49.70, lngMax: -48.80 };
const STORAGE_KEY = 'cade_meu_bau_pontos_osm';
const TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_TILES = 12;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
type Cached = Record<string, { t: number; stops: PontoExtra[] }>;

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export const dentroDaRegiao = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= REGIAO.latMin && lat <= REGIAO.latMax && lng >= REGIAO.lngMin && lng <= REGIAO.lngMax;

export const tileOf = (lat: number, lng: number) => ({
  lat: r4(Math.round(lat / TILE) * TILE),
  lng: r4(Math.round(lng / TILE) * TILE),
});

const tileKey = (t: { lat: number; lng: number }) => `${t.lat},${t.lng}`;

const defaultStore = (): Store | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

// Memória da sessão: id → ponto (usado pela busca por nome e pelas coordenadas do modo viagem)
const memory = new Map<string, PontoExtra>();
const inflight = new Map<string, Promise<PontoExtra[]>>();

export const getExtraStops = (): PontoExtra[] => Array.from(memory.values());

export const findExtraStop = (id: string): PontoExtra | undefined => memory.get(id.padStart(5, '0'));

/** Junta pontos locais com extras: em caso de mesmo código, o ponto local (pontos.json) vence. */
export function mergePontos<T extends PontoExtra>(base: T[], extras: PontoExtra[]): PontoExtra[] {
  const seen = new Set<string>();
  const out: PontoExtra[] = [];
  for (const p of base) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  for (const p of extras) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// Não confia nem no próprio servidor: só aceita o formato esperado e dentro da região
function sanitize(list: unknown): PontoExtra[] {
  if (!Array.isArray(list)) return [];
  const out: PontoExtra[] = [];
  for (const raw of list) {
    const p = raw as Partial<PontoExtra> | null;
    if (!p || typeof p.id !== 'string' || !/^\d{5}$/.test(p.id)) continue;
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || !dentroDaRegiao(p.lat, p.lng)) continue;
    const nome = typeof p.nome === 'string' ? p.nome.replace(/[\u0000-\u001f<>"'`&\\]/g, '').trim().slice(0, 80) : '';
    out.push({ id: p.id, lat: p.lat, lng: p.lng, nome: nome || `Ponto ${p.id}` });
  }
  return out;
}

function readCache(store: Store | null): Cached {
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function writeCache(store: Store | null, all: Cached) {
  if (!store) return;
  try {
    const keys = Object.keys(all);
    if (keys.length > MAX_TILES) {
      keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - MAX_TILES).forEach(k => { delete all[k]; });
    }
    store.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* storage cheio: segue sem cache */ }
}

const remember = (stops: PontoExtra[]) => stops.forEach(p => memory.set(p.id, p));

export async function loadExtraStops(
  lat: number,
  lng: number,
  opts: { fetchImpl?: FetchLike; store?: Store | null; now?: number; signal?: AbortSignal } = {},
): Promise<PontoExtra[]> {
  if (!dentroDaRegiao(lat, lng)) return [];
  const store = opts.store === undefined ? defaultStore() : opts.store;
  const now = opts.now ?? Date.now();
  const tile = tileOf(lat, lng);
  const key = tileKey(tile);

  const cached = readCache(store)[key];
  const fresh = cached && now - cached.t < TTL_MS ? sanitize(cached.stops) : null;
  if (fresh) { remember(fresh); return fresh; }

  const running = inflight.get(key);
  if (running) return running;

  const doFetch = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const job = (async () => {
    try {
      const res = await doFetch(`/api/pontos-osm?lat=${tile.lat}&lng=${tile.lng}`, { signal: opts.signal });
      if (!res.ok) throw new Error('http');
      const data = (await res.json()) as { stops?: unknown };
      const stops = sanitize(data?.stops);
      const all = readCache(store);
      all[key] = { t: now, stops };
      writeCache(store, all);
      remember(stops);
      return stops;
    } catch {
      // Falhou: usa o cache vencido se existir (melhor ponto velho do que nenhum), senão nada
      const old = cached ? sanitize(cached.stops) : [];
      remember(old);
      return old;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

/** Só pra testes: zera a memória da sessão. */
export const __resetPontosExtras = () => { memory.clear(); inflight.clear(); };
