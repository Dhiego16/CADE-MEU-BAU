import { parseHorarios, layoutReconhecido } from './_parseHorarios.js';

// Cache simples
const cache = new Map();
const CACHE_DURATION = 30 * 1000;
const CACHE_MAX_ENTRIES = 200;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ponto, linha } = req.query;

  if (!ponto) {
    return res.json({
      message: '🚌 API de Horários de Ônibus - RMTC Goiânia',
      uso: {
        'Todas as linhas': '/api/ponto?ponto=12345',
        'Linha específica': '/api/ponto?ponto=12345&linha=020',
      },
    });
  }

  if (!/^\d{1,6}$/.test(String(ponto))) {
    return res.status(400).json({ erro: 'Ponto inválido. Use apenas números.' });
  }

  const linhaDesejada = linha ? linha.replace(/\D/g, '') : null;
  const cacheKey = `${ponto}-${linhaDesejada || 'todas'}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json({ ...cached.data, fromCache: true });
  }

  try {
    const { horarios, layoutOk } = await buscarHorarios(ponto, linhaDesejada);
    const resultado = {
      ponto,
      linha: linhaDesejada || 'todas',
      timestamp: new Date().toISOString(),
      horarios,
    };
    // Sem a tabela conhecida e sem nenhuma linha: pode ser ponto sem previsão agora OU a RMTC mudou o HTML.
    // Não muda o comportamento do app; só deixa rastro nos logs da Vercel e um campo pra diagnóstico.
    if (!layoutOk && horarios.length === 0) {
      resultado.aviso = 'layout_desconhecido';
      console.error(`[ponto] HTML da RMTC sem a tabela esperada (ponto ${ponto}) — layout pode ter mudado.`);
    }
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { timestamp: Date.now(), data: resultado });
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.json(resultado);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ erro: 'Erro ao buscar horários', mensagem: err.message });
  }
}

async function buscarHorarios(ponto, linhaDesejada) {
  const url = `https://www.rmtcgoiania.com.br/index.php?option=com_rmtclinhas&view=pedhorarios&format=raw&ponto=${ponto}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.rmtcgoiania.com.br/',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const html = await res.text();
    return { horarios: parseHorarios(html, linhaDesejada), layoutOk: layoutReconhecido(html) };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
