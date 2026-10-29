// Histórico coletivo de previsões: junta as chegadas medidas por todos os aparelhos.
//
//   POST /api/historico   { k: "12345::020", e: 3.5, b: "pico_manha", c: "<id anônimo>" }
//   GET  /api/historico?keys=12345::020,12345::101  →  { data: { "<key>": [[erro, faixa], ...] } }
//
// Requer a env var FIREBASE_SERVICE_ACCOUNT (JSON da conta de serviço do Firebase) na Vercel.
// Nenhum dado pessoal é guardado: só ponto, linha, erro em minutos, faixa de horário e um id aleatório
// do aparelho (usado apenas para limitar o spam).

const KEY_RE = /^\d{1,6}::[0-9A-Za-z_.\-]{1,16}$/;
const BUCKETS = new Set(['pico_manha', 'pico_tarde', 'fora']);
const CLIENT_RE = /^[0-9A-Za-z\-]{8,64}$/;

const ERR_MIN = -15;
const ERR_MAX = 30;
const MAX_ITEMS = 60;
const MAX_AGE_MS = 60 * 24 * 3600 * 1000;      // descarta medições com mais de 60 dias
const SAME_DEVICE_GAP_MS = 8 * 60 * 1000;       // um aparelho conta no máx. 1x por linha a cada 8 min
const MAX_KEYS_PER_GET = 20;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_POSTS = 60;                      // por IP, por instância
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
      console.error('historico: Firebase indisponível:', err?.message);
      return res.status(503).json({ erro: 'Histórico coletivo indisponível.' });
    }

    // ── Leitura ────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const keys = String(req.query?.keys ?? '')
        .split(',').map(s => s.trim()).filter(k => KEY_RE.test(k));
      const unique = [...new Set(keys)].slice(0, MAX_KEYS_PER_GET);
      if (unique.length === 0) return res.status(400).json({ erro: 'Informe ?keys=ponto::linha,...' });

      try {
        const refs = unique.map(k => db.collection('predicoes').doc(docId(k)));
        const snaps = await db.getAll(...refs);
        const data = {};
        snaps.forEach((snap, i) => {
          const items = snap.exists ? (snap.data().items ?? []) : [];
          data[unique[i]] = items.map(it => [it.e, it.b]);
        });
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return res.json({ data });
      } catch (err) {
        console.error('historico GET:', err?.message);
        return res.status(500).json({ erro: 'Falha ao ler o histórico.' });
      }
    }

    // ── Gravação ───────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const ip = String(req.headers?.['x-forwarded-for'] ?? 'x').split(',')[0].trim();
      if (rateLimited(ip)) return res.status(429).json({ erro: 'Muitas medições. Tente mais tarde.' });

      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      const { k, e, b, c } = body ?? {};

      if (typeof k !== 'string' || !KEY_RE.test(k)) return res.status(400).json({ erro: 'Chave inválida.' });
      if (typeof e !== 'number' || !Number.isFinite(e) || e < ERR_MIN || e > ERR_MAX) {
        return res.status(400).json({ erro: 'Erro fora do intervalo.' });
      }
      if (!BUCKETS.has(b)) return res.status(400).json({ erro: 'Faixa inválida.' });
      if (typeof c !== 'string' || !CLIENT_RE.test(c)) return res.status(400).json({ erro: 'Id inválido.' });

      const now = Date.now();
      const device = c.slice(0, 12);
      const entry = { e: Math.round(e * 10) / 10, b, t: now, c: device };

      try {
        const ref = db.collection('predicoes').doc(docId(k));
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
        console.error('historico POST:', err?.message);
        return res.status(500).json({ erro: 'Falha ao gravar a medição.' });
      }
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  };
}

// ── Conexão real com o Firestore (só quando a função é chamada) ──────────────
let dbPromise = null;
async function getRealDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      const credentials = JSON.parse(raw);
      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
      return getFirestore(app);
    })();
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

export default makeHandler(getRealDb);
