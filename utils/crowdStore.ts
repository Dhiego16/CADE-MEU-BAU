// Guarda em memória o resumo de lotação por linha e avisa os cards quando chega dado novo.
// Os pedidos de vários cards são juntados num só (até 20 chaves por requisição).

import { Bucket } from './historyApi';
import { bucketFor } from './predictionHistory';
import { CrowdSummary, CrowdLevel, fetchCrowd, MAX_KEYS_PER_REQUEST } from './crowdApi';

const TTL_MS = 5 * 60_000;
const MIN_REPORTS = 3;      // relatos mínimos pra exibir
const MIN_DEVICES = 2;      // aparelhos diferentes mínimos pra exibir
const REPORT_GAP_MS = 20 * 60_000;
const REPORTED_KEY = 'cade_meu_bau_lotacao_rep';

const cache = new Map<string, CrowdSummary>();
const requestedAt = new Map<string, number>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeCrowd(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
export const getCrowdVersion = () => version;
export const getCrowd = (key: string): CrowdSummary | null => cache.get(key) ?? null;

const notify = () => { version += 1; listeners.forEach(l => l()); };

async function flush() {
  flushTimer = null;
  const keys = [...pending];
  pending.clear();
  for (let i = 0; i < keys.length; i += MAX_KEYS_PER_REQUEST) {
    const chunk = keys.slice(i, i + MAX_KEYS_PER_REQUEST);
    const data = await fetchCrowd(chunk);
    if (!data) { chunk.forEach(k => requestedAt.delete(k)); continue; } // tenta de novo mais tarde
    chunk.forEach(k => cache.set(k, data[k] ?? {}));
    notify();
  }
}

/** Pede (em lote) o resumo de uma linha, no máximo 1x a cada 5 min por chave. */
export function ensureCrowd(key: string): void {
  const now = Date.now();
  if (now - (requestedAt.get(key) ?? 0) < TTL_MS) return;
  requestedAt.set(key, now);
  pending.add(key);
  if (!flushTimer) flushTimer = setTimeout(flush, 60);
}

export interface CrowdLabel {
  level: 'vazio' | 'cheio' | 'lotado';
  reports: number;
}

/** Só devolve algo se houver relatos suficientes de aparelhos diferentes nessa faixa de horário. */
export function crowdLabel(summary: CrowdSummary | null, bucket: Bucket = bucketFor()): CrowdLabel | null {
  const s = summary?.[bucket];
  if (!s || s.n < MIN_REPORTS || s.d < MIN_DEVICES) return null;
  const level = s.m < 1.5 ? 'vazio' : s.m < 2.5 ? 'cheio' : 'lotado';
  return { level, reports: s.n };
}

// ── Limite local: 1 relato por linha a cada 20 min neste aparelho ────────────
const readReported = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(REPORTED_KEY) || '{}'); } catch { return {}; }
};
export function canReportCrowd(key: string, now = Date.now()): boolean {
  return now - (readReported()[key] ?? 0) >= REPORT_GAP_MS;
}
export function markReportedCrowd(key: string, now = Date.now()): void {
  try {
    const all = readReported();
    for (const k of Object.keys(all)) if (now - all[k] > REPORT_GAP_MS) delete all[k];
    all[key] = now;
    localStorage.setItem(REPORTED_KEY, JSON.stringify(all));
  } catch { /* ignora */ }
}

export type { CrowdLevel };
