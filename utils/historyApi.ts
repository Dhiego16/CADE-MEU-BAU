// Cliente do histórico coletivo (/api/historico). Tudo é "melhor esforço":
// se a API estiver fora, o app segue com o histórico local.

export type Bucket = 'pico_manha' | 'pico_tarde' | 'fora';
export type GlobalItems = Array<[number, Bucket]>;

const ENDPOINT = '/api/historico';
const CLIENT_ID_KEY = 'cade_meu_bau_cid';
const KEY_RE = /^\d{1,6}::[0-9A-Za-z_.\-]{1,16}$/;
const FETCH_TTL_MS = 5 * 60_000;
const MAX_KEYS_PER_REQUEST = 20;

/** Id aleatório e anônimo do aparelho: serve só para limitar medições repetidas. */
function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id || !/^[0-9A-Za-z\-]{8,64}$/.test(id)) {
      id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch { return 'sem-storage-0000'; }
}

/** Envia uma chegada medida (erro em minutos: positivo = atrasou). */
export function reportArrival(key: string, errorMin: number, bucket: Bucket): void {
  if (!KEY_RE.test(key) || typeof fetch !== 'function') return;
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ k: key, e: errorMin, b: bucket, c: clientId() }),
      keepalive: true,
    }).catch(() => { /* sem rede: a medição fica só no histórico local */ });
  } catch { /* ignora */ }
}

const lastFetch = new Map<string, number>();

/** Busca o histórico coletivo das chaves pedidas (só as que não foram buscadas há pouco). */
export async function fetchGlobalHistory(keys: string[]): Promise<Record<string, GlobalItems> | null> {
  if (typeof fetch !== 'function') return null;
  const now = Date.now();
  const wanted = [...new Set(keys)]
    .filter(k => KEY_RE.test(k) && now - (lastFetch.get(k) ?? 0) > FETCH_TTL_MS)
    .slice(0, MAX_KEYS_PER_REQUEST);
  if (wanted.length === 0) return null;
  wanted.forEach(k => lastFetch.set(k, now));

  try {
    const res = await fetch(`${ENDPOINT}?keys=${encodeURIComponent(wanted.join(','))}`);
    if (!res.ok) { wanted.forEach(k => lastFetch.delete(k)); return null; }
    const json = await res.json();
    return json?.data && typeof json.data === 'object' ? json.data : null;
  } catch {
    wanted.forEach(k => lastFetch.delete(k));
    return null;
  }
}
