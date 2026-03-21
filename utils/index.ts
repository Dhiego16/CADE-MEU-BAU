// ─── Feedback tátil ──────────────────────────────────────────────────────────
export const haptic = (ms: number | number[] = 50) => {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
};

// ─── Compartilhamento de linha ────────────────────────────────────────────────
export const shareLine = async (stopId: string, lineNumber: string) => {
  const url = `${window.location.origin}?ponto=${stopId}&linha=${lineNumber}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Cadê meu Baú?', text: `🚍 Linha ${lineNumber} — Ponto ${stopId}`, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copiado!');
    }
  } catch { /* cancelado */ }
};

// ─── Formatação e validação de CPF ───────────────────────────────────────────
export const formatCpf = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const isValidCpf = (cpf: string): boolean => {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 || r === 11 ? 0 : r;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
};

// ─── Normalização de tempo de chegada ────────────────────────────────────────
export const normalizeTime = (time: unknown): string => {
  if (time === null || time === undefined) return 'SEM PREVISÃO';
  const str = String(time).trim();
  if (!str || /^[-.]+$/.test(str) || str === 'SEM PREVISÃO' || str === '....') return 'SEM PREVISÃO';
  return str.replace(/\s*min(utos?)?/gi, '');
};

// ─── Cor de urgência para tempo de chegada ───────────────────────────────────
export const getUrgencyColor = (timeStr: string): string => {
  if (!timeStr || timeStr === 'SEM PREVISÃO') return 'bg-slate-800 text-slate-500';
  const clean = timeStr.toLowerCase();
  if (clean.includes('agora')) return 'bg-red-600 text-white';
  if (clean.includes('aprox')) return 'bg-blue-500 text-white';
  const mins = parseInt(timeStr.replace(/\D/g, '')) || 0;
  if (mins <= 3) return 'bg-red-600 text-white';
  if (mins <= 8) return 'bg-yellow-500 text-black';
  return 'bg-emerald-500 text-white';
};

// ─── Constantes globais ───────────────────────────────────────────────────────
export const REFRESH_INTERVAL = 20;
export const SPLASH_DURATION = 2000;
export const MAX_HISTORY = 5;
export const BASE_URL = '/api/ponto';
