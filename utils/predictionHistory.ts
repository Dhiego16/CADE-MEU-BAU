// ─── Histórico de previsões ──────────────────────────────────────────────────
// Guarda o que a RMTC previu e compara com o momento em que o ônibus de fato
// sumiu da lista do ponto (= chegou). Com isso o card consegue dizer
// "costuma atrasar ~3 min" e mostrar um nível de confiança.
//
// Tudo roda no aparelho (localStorage): só aprende enquanto o app está aberto.

export type Confidence = 'alta' | 'media' | 'baixa';

export interface PredictionInsight {
  /** quantas chegadas reais já foram medidas para essa linha neste ponto */
  samples: number;
  /** quantas chegadas são necessárias antes de mostrar o resumo */
  needed: number;
  /** mediana do erro em minutos: positivo = atrasa, negativo = adianta */
  medianErrorMin: number;
  confidence: Confidence;
  /** texto pronto pra exibir; null enquanto ainda está aprendendo */
  label: string | null;
  tone: 'late' | 'early' | 'ok' | 'learning';
}

interface Sample { ts: number; eta: number }
interface Track { samples: Sample[]; lastTs: number; lastEta: number }
interface Store {
  v: 1;
  tracks: Record<string, Track>;
  errors: Record<string, number[]>;
  touched: Record<string, number>;
}

const STORAGE_KEY = 'cade_meu_bau_pred_v1';
export const MIN_SAMPLES = 3;

const MAX_ERRORS_PER_KEY = 30;
const MAX_KEYS = 150;
const MAX_TRACK_SAMPLES = 60;
const TRACK_STALE_MS = 15 * 60_000;      // sem leitura por 15 min: descarta o acompanhamento
const NEW_BUS_JUMP_MIN = 3;              // ETA subiu >3 min além do esperado: é outro ônibus
const ARRIVED_MAX_ETA = 2;               // só considera "chegou" se o último ETA visto era ≤2 min
const ARRIVED_MAX_GAP_MS = 150_000;      // e se a última leitura foi há ≤2,5 min
const MIN_LEAD_MIN = 3;                  // só avalia previsões feitas com ≥3 min de antecedência
const STRONG_LEAD_MIN = 5;               // preferência: previsões feitas com 5–15 min de antecedência,
const STRONG_LEAD_MAX = 15;              // que é quando o usuário decide se corre ou espera
const ERR_MIN = -15;
const ERR_MAX = 30;
const DEDUPE_MS = 10_000;

// ── Interpretação do texto de previsão ───────────────────────────────────────
/** Converte o texto da RMTC em minutos. null = sem previsão confiável. */
export function parseEtaMinutes(raw: string | undefined | null, now = Date.now()): number | null {
  if (!raw) return null;
  const t = String(raw).trim().toLowerCase();
  if (!t || t.includes('sem previs') || t.includes('aprox')) return null; // aprox = tempo "especulado"
  if (t.includes('agora') || t.includes('chegando')) return 0;

  const hhmm = t.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) {
    const d = new Date(now);
    d.setHours(parseInt(hhmm[1], 10), parseInt(hhmm[2], 10), 0, 0);
    let diff = (d.getTime() - now) / 60_000;
    if (diff < -60) diff += 24 * 60; // virou o dia
    return diff < 0 ? 0 : Math.round(diff);
  }

  const digits = t.replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n <= 180 ? n : null;
}

// ── Persistência + store reativo ─────────────────────────────────────────────
let store: Store | null = null;
let version = 0;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const insightCache = new Map<string, { v: number; insight: PredictionInsight }>();

function emptyStore(): Store { return { v: 1, tracks: {}, errors: {}, touched: {} }; }

function load(): Store {
  if (store) return store;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    store = parsed && parsed.v === 1 && parsed.tracks && parsed.errors && parsed.touched ? parsed : emptyStore();
  } catch { store = emptyStore(); }
  return store as Store;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(load())); } catch { /* cota cheia: segue sem salvar */ }
  }, 1500);
}

function emit() {
  version++;
  listeners.forEach(l => l());
}

export function subscribePredictions(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export const getPredictionVersion = () => version;

function prune(s: Store, now: number) {
  for (const k of Object.keys(s.tracks)) {
    if (now - s.tracks[k].lastTs > TRACK_STALE_MS) delete s.tracks[k];
  }
  const keys = Object.keys(s.touched);
  if (keys.length > MAX_KEYS) {
    keys.sort((a, b) => s.touched[a] - s.touched[b]);
    for (const k of keys.slice(0, keys.length - MAX_KEYS)) {
      delete s.touched[k]; delete s.errors[k]; delete s.tracks[k];
    }
  }
}

// ── Núcleo: registra uma leitura da previsão ─────────────────────────────────
function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Fecha o acompanhamento de um ônibus que acabou de chegar e devolve o erro (min). */
function finalizeTrack(track: Track, arrivedAt: number): number | null {
  const lead = track.samples.filter(s => s.eta >= MIN_LEAD_MIN);
  if (lead.length < 2) return null; // precisa ter visto o ônibus se aproximando
  const strong = lead.filter(s => s.eta >= STRONG_LEAD_MIN && s.eta <= STRONG_LEAD_MAX);
  const pool = strong.length >= 2 ? strong : lead;
  const errs = pool.map(s => (arrivedAt - (s.ts + s.eta * 60_000)) / 60_000);
  const e = median(errs);
  return e < ERR_MIN || e > ERR_MAX ? null : Math.round(e * 10) / 10;
}

export function recordObservation(key: string, etaText: string | undefined | null, now = Date.now()): void {
  const eta = parseEtaMinutes(etaText, now);
  const s = load();
  const track = s.tracks[key];
  let changed = false;

  if (eta === null) return; // sem previsão: não mexe (o ônibus pode só estar fora do ar por instantes)

  if (track) {
    const gap = now - track.lastTs;

    if (gap < DEDUPE_MS) return;

    if (gap > TRACK_STALE_MS) {
      delete s.tracks[key];
    } else {
      const elapsedMin = gap / 60_000;
      const expectedNow = track.lastEta - elapsedMin;

      if (eta > expectedNow + NEW_BUS_JUMP_MIN) {
        // ETA "subiu": o ônibus que estava sendo acompanhado já passou pelo ponto
        if (track.lastEta <= ARRIVED_MAX_ETA && gap <= ARRIVED_MAX_GAP_MS) {
          const arrivedAt = track.lastTs + gap / 2; // sumiu entre as duas leituras
          const err = finalizeTrack(track, arrivedAt);
          if (err !== null) {
            const list = (s.errors[key] ??= []);
            list.push(err);
            if (list.length > MAX_ERRORS_PER_KEY) list.splice(0, list.length - MAX_ERRORS_PER_KEY);
            changed = true;
          }
        }
        delete s.tracks[key];
      } else if (eta < expectedNow - 6) {
        // caiu de repente: provavelmente outro ônibus; recomeça sem contabilizar
        delete s.tracks[key];
      }
    }
  }

  const cur = s.tracks[key];
  if (cur) {
    cur.samples.push({ ts: now, eta });
    if (cur.samples.length > MAX_TRACK_SAMPLES) cur.samples.splice(0, cur.samples.length - MAX_TRACK_SAMPLES);
    cur.lastTs = now;
    cur.lastEta = eta;
  } else {
    s.tracks[key] = { samples: [{ ts: now, eta }], lastTs: now, lastEta: eta };
  }
  s.touched[key] = now;
  prune(s, now);
  scheduleSave();
  if (changed) { insightCache.delete(key); emit(); }
}

/** Registra as leituras de todas as linhas de um ponto de uma vez. */
export function recordStopObservations(
  stopSource: string,
  lines: Array<{ number: string; nextArrival?: string }>,
): void {
  const now = Date.now();
  for (const l of lines) recordObservation(`${stopSource}::${l.number}`, l.nextArrival, now);
}

// ── Leitura: resumo para o card ──────────────────────────────────────────────
export function getPredictionInsight(key: string): PredictionInsight | null {
  const cached = insightCache.get(key);
  if (cached && cached.v === version) return cached.insight;

  const errs = load().errors[key];
  let insight: PredictionInsight | null = null;

  if (errs && errs.length > 0) {
    const n = errs.length;
    if (n < MIN_SAMPLES) {
      insight = {
        samples: n, needed: MIN_SAMPLES, medianErrorMin: 0,
        confidence: 'baixa', label: null, tone: 'learning',
      };
    } else {
      const med = median(errs);
      const mad = median(errs.map(e => Math.abs(e - med))); // dispersão robusta a outliers
      const confidence: Confidence =
        n >= 5 && mad <= 1 ? 'alta' : mad <= 2.5 ? 'media' : 'baixa';
      const rounded = Math.round(Math.abs(med));
      let tone: PredictionInsight['tone'] = 'ok';
      let label = 'previsão costuma bater';
      if (med >= 1.5) { tone = 'late'; label = `costuma atrasar ~${rounded} min`; }
      else if (med <= -1.5) { tone = 'early'; label = `costuma chegar ~${rounded} min antes`; }
      insight = { samples: n, needed: MIN_SAMPLES, medianErrorMin: med, confidence, label, tone };
    }
  }

  if (insight) insightCache.set(key, { v: version, insight });
  return insight;
}

/** Só para testes. */
export function __resetPredictionStore() {
  store = emptyStore();
  insightCache.clear();
  version++;
}
