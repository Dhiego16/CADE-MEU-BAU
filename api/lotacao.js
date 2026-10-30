// "Tá lotado?": relatos de lotação feitos pelos usuários, por ponto + linha.
//
//   POST /api/lotacao   { k: "12345::110", n: 1|2|3, b: "pico_manha", c: "<id anônimo>" }
//        n: 1 = vazio, 2 = cheio, 3 = lotado
//   GET  /api/lotacao?keys=12345::110,12345::020
//        → { data: { "<key>": { pico_manha: { n, d, m }, ... } } }
//        n = nº de relatos, d = nº de aparelhos diferentes, m = mediana (1 a 3)
//
// Usa a mediana (resiste a relatos fora da curva) e devolve a contagem de aparelhos
// diferentes pra o app só exibir quando houver gente suficiente.
// Nenhum dado pessoal: só ponto, linha, nível, faixa de horário e um id aleatório do aparelho.

import { getRealDb } from './_db.js';

const KEY_RE = /^\d{1,6}::[0-9A-Za-z_.\-]{1,16}$/;
const BUCKETS = ['pico_manha', 'pico_tarde', 'fora'];
const CLIENT_RE = /^[0-9A-Za-z\-]{8,64}$/;

const MAX_ITEMS = 60;
const MAX_AGE_MS = 21 * 24 * 3600 * 1000;       // relatos com mais de 21 dias saem
const SAME_DEVICE_GAP_MS = 20 * 60 * 1000;      // um aparelho conta 1x por linha a cada 20 min
const MAX_KEYS_PER_GET = 20;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_POSTS = 40;                       // por IP, por instância
const rate = new Map();

const docId = (key) => key.replace('::', '_');

function rateLimited(ip) {
  const now = Date.now();
  const r = rate.get(ip);
  if (!r || now - r.start > RATE_WINDOW_MS) {
    if (rate.size > 2000) rate.clear();
    rate.set(ip, { start: now, n: 1 });
    return false;
  }
  r.n += 1;
  return r.n > RATE_MAX_POSTS;
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Resume os relatos por faixa de horário. */
export function summarize(items, now = Date.now()) {
  const out = {};
  for (const b of BUCKETS) {
    const inBucket = items.filter(it => it.b === b && now - it.t < MAX_AGE_MS);
    if (inBucket.length === 0) continue;
    out[b] = {
      n: inBucket.length,
      d: new Set(inBucket.map(it => it.c)).size,
      m: median(inBucket.map(it => it.n)),
    };
  }
  return out;
}

export function makeHandler(getDb) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let db;
    try {
      db = await getDb();
    } catch (err) {
      console.error('lotacao: Firebase indisponível:', err?.message);
      return res.status(503).json({ erro: 'Relatos de lotação indisponíveis.' });
    }

    // ── Leitura ────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const keys = String(req.query?.keys ?? '')
        .split(',').map(s => s.trim()).filter(k => KEY_RE.test(k));
      const unique = [...new Set(keys)].slice(0, MAX_KEYS_PER_GET);
      if (unique.length === 0) return res.status(400).json({ erro: 'Informe ?keys=ponto::linha,...' });

      try {
        const refs = unique.map(k => db.collection('lotacao').doc(docId(k)));
        const snaps = await db.getAll(...refs);
        const now = Date.now();
        const data = {};
        snaps.forEach((snap, i) => {
          data[unique[i]] = summarize(snap.exists ? (snap.data().items ?? []) : [], now);
        });
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.json({ data });
      } catch (err) {
        console.error('lotacao GET:', err?.message);
        return res.status(500).json({ erro: 'Falha ao ler os relatos.' });
      }
    }

    // ── Gravação ───────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const ip = String(req.headers?.['x-forwarded-for'] ?? 'x').split(',')[0].trim();
      if (rateLimited(ip)) return res.status(429).json({ erro: 'Muitos relatos. Tente mais tarde.' });

      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      const { k, n, b, c } = body ?? {};

      if (typeof k !== 'string' || !KEY_RE.test(k)) return res.status(400).json({ erro: 'Chave inválida.' });
      if (![1, 2, 3].includes(n)) return res.status(400).json({ erro: 'Nível inválido.' });
      if (!BUCKETS.includes(b)) return res.status(400).json({ erro: 'Faixa inválida.' });
      if (typeof c !== 'string' || !CLIENT_RE.test(c)) return res.status(400).json({ erro: 'Id inválido.' });

      const now = Date.now();
      const device = c.slice(0, 12);
      const entry = { n, b, t: now, c: device };

      try {
        const ref = db.collection('lotacao').doc(docId(k));
        const result = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          let items = snap.exists ? (snap.data().items ?? []) : [];
          items = items.filter(it => now - it.t < MAX_AGE_MS);
          if (items.some(it => it.c === device && now - it.t < SAME_DEVICE_GAP_MS)) return 'dup';
          items.push(entry);
          if (items.length > MAX_ITEMS) items = items.slice(items.length - MAX_ITEMS);
          tx.set(ref, { items, updatedAt: now });
          return 'ok';
        });
        return res.status(200).json({ ok: result === 'ok', motivo: result === 'dup' ? 'duplicada' : undefined });
      } catch (err) {
        console.error('lotacao POST:', err?.message);
        return res.status(500).json({ erro: 'Falha ao gravar o relato.' });
      }
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  };
}

export default makeHandler(getRealDb);
