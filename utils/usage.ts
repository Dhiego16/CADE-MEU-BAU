// Sugestão "pra agora": aprende em que horário você costuma buscar cada ponto/linha e
// sugere o mais provável pro momento (dia útil x fim de semana, janela de ±1h30).
// Tudo fica no aparelho (localStorage); nada disso vai pra nuvem.

export interface UsageEntry { s: string; l: string | null; t: number }
export interface Suggestion { stopId: string; line: string | null; days: number }

const KEY = 'cade_meu_bau_uso';
const MAX_ENTRIES = 300;
const MAX_AGE_DAYS = 60;
const WINDOW_MIN = 90;          // janela em volta do horário atual
const MIN_DAYS = 2;             // só sugere depois de aparecer em pelo menos 2 dias diferentes
const HALF_LIFE_DAYS = 21;      // o hábito recente pesa mais que o antigo
const DEDUPE_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export const normalizeStop = (raw: string): string | null => {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 0 || d.length > 6) return null;
  return d.length < 5 ? d.padStart(5, '0') : d;
};

export const normalizeLine = (raw: string | null | undefined): string | null => {
  const l = String(raw ?? '').trim().toUpperCase();
  return /^[0-9A-Z]{1,6}$/.test(l) ? l : null;
};

const dayType = (d: Date) => (d.getDay() === 0 || d.getDay() === 6 ? 'fds' : 'util');
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const circDiff = (a: number, b: number) => { const x = Math.abs(a - b); return Math.min(x, 1440 - x); };
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Núcleo puro (sem localStorage): devolve o ponto/linha mais provável pra este momento. */
export function suggestFor(entries: UsageEntry[], now = Date.now()): Suggestion | null {
  const nowD = new Date(now);
  const nowType = dayType(nowD);
  const nowMin = minutesOfDay(nowD);

  const byStop = new Map<string, { score: number; days: Set<string>; lines: Map<string | null, number>; total: number }>();
  for (const e of entries) {
    const age = now - e.t;
    if (age < 0 || age > MAX_AGE_DAYS * DAY_MS) continue;
    const d = new Date(e.t);
    if (dayType(d) !== nowType) continue;
    if (circDiff(minutesOfDay(d), nowMin) > WINDOW_MIN) continue;

    const g = byStop.get(e.s) ?? { score: 0, days: new Set<string>(), lines: new Map<string | null, number>(), total: 0 };
    g.score += Math.pow(0.5, age / (HALF_LIFE_DAYS * DAY_MS));
    g.days.add(ymd(d));
    g.lines.set(e.l, (g.lines.get(e.l) ?? 0) + 1);
    g.total += 1;
    byStop.set(e.s, g);
  }

  let best: { stopId: string; score: number; days: number; line: string | null } | null = null;
  for (const [stopId, g] of byStop) {
    if (g.days.size < MIN_DAYS) continue;
    // Linha: a mais frequente, desde que apareça em mais da metade das buscas desse ponto
    let line: string | null = null;
    let lineCount = 0;
    for (const [l, n] of g.lines) if (l && n > lineCount) { line = l; lineCount = n; }
    if (lineCount * 2 <= g.total) line = null;
    if (!best || g.score > best.score) best = { stopId, score: g.score, days: g.days.size, line };
  }
  return best ? { stopId: best.stopId, line: best.line, days: best.days } : null;
}

// ── localStorage ─────────────────────────────────────────────────────────────
export function loadUsage(): UsageEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw)
      ? raw.filter((e): e is UsageEntry => e && typeof e.s === 'string' && typeof e.t === 'number')
      : [];
  } catch { return []; }
}

/** Registra uma busca (ignora repetição da mesma consulta em menos de 30 min). */
export function recordUsage(stopRaw: string, lineRaw?: string | null, now = Date.now()): void {
  const s = normalizeStop(stopRaw);
  if (!s) return;
  const l = normalizeLine(lineRaw);
  try {
    const entries = loadUsage().filter(e => now - e.t < MAX_AGE_DAYS * DAY_MS);
    const last = entries[entries.length - 1];
    if (last && last.s === s && last.l === l && now - last.t < DEDUPE_MS) return;
    entries.push({ s, l, t: now });
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch { /* sem espaço / modo privado */ }
}

export const suggestNow = (): Suggestion | null => suggestFor(loadUsage());
