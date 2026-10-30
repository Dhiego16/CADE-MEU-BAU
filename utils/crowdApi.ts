// Cliente do "Tá lotado?" (/api/lotacao). Tudo é "melhor esforço": sem rede, o app segue normal.

import { Bucket, clientId } from './historyApi';

export type CrowdLevel = 1 | 2 | 3; // 1 vazio · 2 cheio · 3 lotado
export interface CrowdBucketStat { n: number; d: number; m: number }
export type CrowdSummary = Partial<Record<Bucket, CrowdBucketStat>>;

const ENDPOINT = '/api/lotacao';
const KEY_RE = /^\d{1,6}::[0-9A-Za-z_.\-]{1,16}$/;
export const MAX_KEYS_PER_REQUEST = 20;

/** Envia um relato. Devolve true se o servidor aceitou. */
export async function reportCrowd(key: string, level: CrowdLevel, bucket: Bucket): Promise<boolean> {
  if (!KEY_RE.test(key)) return false;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ k: key, n: level, b: bucket, c: clientId() }),
    });
    return res.ok;
  } catch { return false; }
}

export async function fetchCrowd(keys: string[]): Promise<Record<string, CrowdSummary> | null> {
  const wanted = [...new Set(keys)].filter(k => KEY_RE.test(k)).slice(0, MAX_KEYS_PER_REQUEST);
  if (wanted.length === 0) return null;
  try {
    const res = await fetch(`${ENDPOINT}?keys=${encodeURIComponent(wanted.join(','))}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data && typeof json.data === 'object' ? json.data : null;
  } catch { return null; }
}
