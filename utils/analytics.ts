// Contador de eventos de uso (próprio, sem dado pessoal). Os eventos vão em lote pra
// /api/eventos, que só soma contagens por dia. Respeita o "Não rastrear" do navegador.

type Props = {
  line?: string;
  stop?: string;
  src?: 'manual' | 'history' | 'nearby' | 'suggestion' | 'map' | 'link';
  tab?: 'search' | 'favs' | 'map' | 'sitpass';
  nivel?: 1 | 2 | 3;
  kind?: 'line' | 'stop';
};
export type EventName =
  | 'search' | 'favorite_add' | 'favorite_remove' | 'trip_start' | 'trip_cancel' | 'tab_view'
  | 'theme_toggle' | 'share' | 'alert_create' | 'suggestion_click' | 'lotacao_report' | 'first_open';

const ENDPOINT = '/api/eventos';
const FLUSH_MS = 15_000;
const MAX_BATCH = 30;

const queue: Array<{ e: EventName; p?: Props }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function enabled(): boolean {
  try {
    if (import.meta.env.DEV) return false;
    if (isOptedOut()) return false;
    const w = window as unknown as { doNotTrack?: string };
    return navigator.doNotTrack !== '1' && w.doNotTrack !== '1';
  } catch { return false; }
}

function flush(useBeacon = false): void {
  if (timer) { clearTimeout(timer); timer = null; }
  while (queue.length > 0) {
    const body = JSON.stringify({ ev: queue.splice(0, MAX_BATCH) });
    try {
      if (useBeacon && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
          .catch(() => { /* sem rede: perde o lote, sem problema */ });
      }
    } catch { /* ignora */ }
  }
}

function listen(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  window.addEventListener('pagehide', () => flush(true));
}

export function trackEvent(e: EventName, p?: Props): void {
  if (!enabled()) return;
  listen();
  queue.push(p ? { e, p } : { e });
  if (queue.length >= MAX_BATCH) flush();
  else if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
}

// ── Não contar as minhas visitas ────────────────────────────────────────────
// Abra o app uma vez com ?semcontar=1 no aparelho que você quer excluir (e ?semcontar=0 pra voltar).
// Vale pro contador próprio e pro Vercel Analytics (via beforeSend em index.tsx).
const OPT_OUT_KEY = 'cade_meu_bau_sem_contar';

export function isOptedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
}

/** Lê ?semcontar da URL, liga/desliga a exclusão e limpa o parâmetro do endereço. */
export function applyOptOutFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const v = url.searchParams.get('semcontar');
    if (v === null) return;
    if (v === '0') localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, '1');
    url.searchParams.delete('semcontar');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* sem localStorage: ignora */ }
}

// ── Primeira abertura neste aparelho ────────────────────────────────────────
// Conta 1x por aparelho (marca local, sem identificar ninguém). Quem já usava o app antes
// desta marca existir é reconhecido pelos dados que já tem guardados e NÃO conta como novo.
// Limitação: quem limpar os dados do navegador conta de novo.
const SEEN_KEY = 'cade_meu_bau_visto';
const LEGACY_KEYS = [
  'cade_meu_bau_onboarding_done', 'cade_meu_bau_theme', 'cade_meu_bau_search_history',
  'cade_meu_bau_app_favs', 'cade_meu_bau_alerts', 'sitpass_cpfs_salvos',
];

export function markFirstOpen(): void {
  if (!enabled()) return;
  try {
    if (localStorage.getItem(SEEN_KEY)) return;
    localStorage.setItem(SEEN_KEY, '1');
    const returning = LEGACY_KEYS.some(k => localStorage.getItem(k) !== null);
    if (!returning) trackEvent('first_open');
  } catch { /* sem localStorage: não conta, pra não contar o mesmo aparelho várias vezes */ }
}

// De onde veio a busca (digitada, histórico, ponto próximo…): quem dispara marca antes de buscar.
let pendingSource: NonNullable<Props['src']> = 'manual';
export const markSearchSource = (src: NonNullable<Props['src']>): void => { pendingSource = src; };
export function consumeSearchSource(): NonNullable<Props['src']> {
  const s = pendingSource;
  pendingSource = 'manual';
  return s;
}
