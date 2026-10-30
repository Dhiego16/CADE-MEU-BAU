// Contador de eventos de uso (substitui os "custom events" do Vercel Analytics, que só
// existem nos planos pagos). Guarda APENAS contagens por dia — sem id de aparelho, sem IP,
// sem nada que identifique alguém.
//
//   POST /api/eventos   { ev: [ { e: "search", p: { line: "110", stop: "09005", src: "nearby" } }, ... ] }
//   GET  /api/eventos?dias=7&key=<EVENTOS_KEY>   → totais, por dia e rankings (só você)
//
// Env vars na Vercel: FIREBASE_SERVICE_ACCOUNT e EVENTOS_KEY (uma senha longa à sua escolha).

import { createHash, timingSafeEqual } from 'node:crypto';
import { getRealDb, getRealIncrement } from './_db.js';

const EVENTS = new Set([
  'search', 'favorite_add', 'favorite_remove', 'trip_start', 'trip_cancel', 'tab_view',
  'theme_toggle', 'share', 'alert_create', 'suggestion_click', 'lotacao_report',
]);
const LINE_STOP_EVENTS = new Set(['search', 'favorite_add', 'trip_start', 'share', 'lotacao_report']);
const SOURCES = new Set(['manual', 'history', 'nearby', 'suggestion', 'map', 'link']);
const TABS = new Set(['search', 'favs', 'map', 'sitpass']);
const KINDS = new Set(['line', 'stop']);
const LEVELS = new Set(['1', '2', '3']);
const LINE_RE = /^[0-9A-Za-z]{1,6}$/;
const STOP_RE = /^\d{1,6}$/;

const MAX_EVENTS_PER_BATCH = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_BATCHES = 40;                     // por IP, por instância
const rate = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const r = rate.get(ip);
  if (!r || now - r.start > RATE_WINDOW_MS) {
    if (rate.size > 2000) rate.clear();
    rate.set(ip, { start: now, n: 1 });
    return false;
  }
  r.n += 1;
  return r.n > RATE_MAX_BATCHES;
}

/** Dia (AAAA-MM-DD) no horário de Brasília (UTC-3). */
export const dayId = (ts = Date.now()) => new Date(ts - 3 * 3600 * 1000).toISOString().slice(0, 10);

const bump = (obj, key, n = 1) => { obj[key] = (obj[key] ?? 0) + n; };

/** Valida e soma os eventos de um lote. Ignora silenciosamente o que for inválido. */
export function aggregate(events) {
  const c = { eventos: {}, linhas: {}, pontos: {}, abas: {}, origens: {}, lotacao: {}, tipos: {} };
  let valid = 0;
  for (const item of Array.isArray(events) ? events.slice(0, MAX_EVENTS_PER_BATCH) : []) {
    const e = item?.e;
    if (typeof e !== 'string' || !EVENTS.has(e)) continue;
    const p = item?.p && typeof item.p === 'object' ? item.p : {};
    valid += 1;
    bump(c.eventos, e);
    if (LINE_STOP_EVENTS.has(e)) {
      if (typeof p.line === 'string' && LINE_RE.test(p.line)) bump(c.linhas, p.line.toUpperCase());
      if (typeof p.stop === 'string' && STOP_RE.test(p.stop)) bump(c.pontos, p.stop.padStart(5, '0'));
    }
    if (e === 'tab_view' && TABS.has(p.tab)) bump(c.abas, p.tab);
    if (e === 'search' && SOURCES.has(p.src)) bump(c.origens, p.src);
    if (e === 'lotacao_report' && LEVELS.has(String(p.nivel))) bump(c.lotacao, String(p.nivel));
    if (e === 'share' && KINDS.has(p.kind)) bump(c.tipos, p.kind);
  }
  return { counts: c, valid };
}

const sha = (s) => createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => timingSafeEqual(sha(a), sha(b));

function topN(map, n = 10) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([nome, total]) => ({ nome, total }));
}

export function makeHandler(getDb, getIncrement) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Eventos-Key');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // ── Gravação (aberta, em lote) ─────────────────────────────────────────
    if (req.method === 'POST') {
      const ip = String(req.headers?.['x-forwarded-for'] ?? 'x').split(',')[0].trim();
      if (rateLimited(ip)) return res.status(429).json({ erro: 'Muitos envios.' });

      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      const { counts, valid } = aggregate(body?.ev);
      if (valid === 0) return res.status(400).json({ erro: 'Nenhum evento válido.' });

      try {
        const db = await getDb();
        const inc = await getIncrement();
        const update = {};
        for (const [group, map] of Object.entries(counts)) {
          const entries = Object.entries(map);
          if (entries.length === 0) continue;
          update[group] = Object.fromEntries(entries.map(([k, n]) => [k, inc(n)]));
        }
        await db.collection('eventos').doc(dayId()).set(update, { merge: true });
        return res.status(200).json({ ok: true, n: valid });
      } catch (err) {
        console.error('eventos POST:', err?.message);
        return res.status(500).json({ erro: 'Falha ao gravar os eventos.' });
      }
    }

    // ── Leitura (só com a chave) ───────────────────────────────────────────
    if (req.method === 'GET') {
      const expected = process.env.EVENTOS_KEY;
      if (!expected) return res.status(503).json({ erro: 'EVENTOS_KEY não configurada.' });
      const provided = req.query?.key ?? req.headers?.['x-eventos-key'] ?? '';
      if (!provided || !safeEqual(provided, expected)) return res.status(401).json({ erro: 'Não autorizado.' });

      const dias = Math.min(60, Math.max(1, parseInt(req.query?.dias, 10) || 7));
      try {
        const db = await getDb();
        const ids = Array.from({ length: dias }, (_, i) => dayId(Date.now() - i * 24 * 3600 * 1000));
        const snaps = await db.getAll(...ids.map(id => db.collection('eventos').doc(id)));
        const porDia = {};
        const total = { eventos: {}, linhas: {}, pontos: {}, abas: {}, origens: {}, lotacao: {}, tipos: {} };
        snaps.forEach((snap, i) => {
          if (!snap.exists) return;
          const d = snap.data();
          porDia[ids[i]] = d.eventos ?? {};
          for (const g of Object.keys(total)) {
            for (const [k, n] of Object.entries(d[g] ?? {})) bump(total[g], k, Number(n) || 0);
          }
        });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({
          dias,
          totais: total.eventos,
          porDia,
          topLinhas: topN(total.linhas),
          topPontos: topN(total.pontos),
          abas: total.abas,
          origensDeBusca: total.origens,
          lotacao: total.lotacao,
        });
      } catch (err) {
        console.error('eventos GET:', err?.message);
        return res.status(500).json({ erro: 'Falha ao ler os eventos.' });
      }
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  };
}

export default makeHandler(getRealDb, getRealIncrement);
