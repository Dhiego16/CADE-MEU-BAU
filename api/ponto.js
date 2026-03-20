import * as cheerio from 'cheerio';

// Cache simples
const cache = new Map();
const CACHE_DURATION = 30 * 1000;

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

  if (isNaN(ponto)) {
    return res.status(400).json({ erro: 'Ponto inválido. Use apenas números.' });
  }

  const linhaDesejada = linha ? linha.replace(/\D/g, '') : null;
  const cacheKey = `${ponto}-${linhaDesejada || 'todas'}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json({ ...cached.data, fromCache: true });
  }

  try {
    const horarios = await buscarHorarios(ponto, linhaDesejada);
    const resultado = {
      ponto,
      linha: linhaDesejada || 'todas',
      timestamp: new Date().toISOString(),
      horarios,
    };
    cache.set(cacheKey, { timestamp: Date.now(), data: resultado });
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
    return parseHorarios(html, linhaDesejada);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function parseHorarios(html, linhaDesejada) {
  const $ = cheerio.load(html);
  const horarios = [];

  $('table.horariosRmtc tr.linha').each((i, el) => {
    const tds = $(el).find('td');
    if (tds.length < 4) return;

    const linha   = $(tds[0]).text().replace(/\D/g, '');
    const destino = $(tds[1]).text().trim();
    const proximo = $(tds[2]).text().replace(/\s+/g, ' ').trim();
    const seguinte = $(tds[3]).text().trim();

    if (!linha) return;
    if (linhaDesejada && linha !== linhaDesejada) return;

    horarios.push({ linha, destino, proximo, seguinte });
  });

  return horarios;
}
