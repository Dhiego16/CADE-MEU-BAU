import type { BusLine } from '../types';

// Guarda a última previsão boa de cada consulta (ponto + linha) no aparelho.
// Serve só pra quando o app abre SEM rede/RMTC: mostra o último resultado com a idade
// ("há 12 min") em vez de uma tela de erro. Nunca é usado como se fosse previsão fresca.

const STORAGE_KEY = 'cade_meu_bau_last_results';
export const MAX_AGE_MS = 60 * 60 * 1000; // passou de 1 h, a previsão não serve mais
const MAX_ENTRIES = 30;

export interface CachedLines {
  t: number;
  lines: BusLine[];
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Dict = Record<string, CachedLines>;

const defaultStore = (): Store | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

export const lastResultKey = (stopId: string, lineFilter: string): string =>
  `${stopId.trim().padStart(5, '0')}|${lineFilter.trim()}`;

function readAll(store: Store): Dict {
  try {
    const raw = store.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function saveLastResult(
  stopId: string, lineFilter: string, lines: BusLine[],
  now: number = Date.now(), store: Store | null = defaultStore(),
): void {
  if (!store || lines.length === 0) return;
  try {
    const all = readAll(store);
    all[lastResultKey(stopId, lineFilter)] = { t: now, lines };
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys.sort((a, b) => all[a].t - all[b].t)
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach(k => { delete all[k]; });
    }
    store.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* storage cheio ou bloqueado: sem cache, sem problema */ }
}

export function loadLastResult(
  stopId: string, lineFilter: string,
  now: number = Date.now(), store: Store | null = defaultStore(),
): CachedLines | null {
  if (!store) return null;
  const hit = readAll(store)[lastResultKey(stopId, lineFilter)];
  if (!hit || !Array.isArray(hit.lines) || hit.lines.length === 0) return null;
  if (typeof hit.t !== 'number' || now - hit.t > MAX_AGE_MS || hit.t > now + 60_000) return null;
  return hit;
}
