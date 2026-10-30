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
  | 'theme_toggle' | 'share' | 'alert_create' | 'suggestion_click' | 'lotacao_report';

const ENDPOINT = '/api/eventos';
const FLUSH_MS = 15_000;
const MAX_BATCH = 30;

const queue: Array<{ e: EventName; p?: Props }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function enabled(): boolean {
  try {
    if (import.meta.env.DEV) return false;
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

// De onde veio a busca (digitada, histórico, ponto próximo…): quem dispara marca antes de buscar.
let pendingSource: NonNullable<Props['src']> = 'manual';
export const markSearchSource = (src: NonNullable<Props['src']>): void => { pendingSource = src; };
export function consumeSearchSource(): NonNullable<Props['src']> {
  const s = pendingSource;
  pendingSource = 'manual';
  return s;
}
