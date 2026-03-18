/**
 * Vercel Serverless Function — /api/saldo?cpf=XXXXXXXXXXX
 * Consulta saldo do Bilhete Único no Sitpass
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://www.sitpass.com.br/',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Tenta a requisição até N vezes
async function fetchWithRetry(url, options = {}, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, { ...options, headers: { ...HEADERS, ...options.headers } });
      if (res.ok) return res;
      await sleep(2000);
    } catch {
      await sleep(2000);
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Extrai valor de um input hidden pelo name
function extractInput(html, name) {
  const match = html.match(new RegExp(`value="([^"]*)"\\s*name="${name}"`));
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { cpf } = req.query;

  if (!cpf) {
    return res.status(400).json({ erro: 'CPF não informado' });
  }

  const cpfLimpo = cpf.replace(/\D/g, '');

  if (cpfLimpo.length !== 11) {
    return res.status(400).json({ erro: 'CPF inválido. Digite 11 dígitos.' });
  }

  try {
    // ── Passo 1: busca os dados do cartão ──────────────────────────────────
    const urlCartao = `https://www.sitpass.com.br/servicosonline/consultasaldo/cartoes?cpf=${cpfLimpo}`;
    const resCartao = await fetchWithRetry(urlCartao);

    if (!resCartao) {
      return res.status(503).json({ erro: 'Serviço Sitpass indisponível. Tente novamente.' });
    }

    const htmlCartao = await resCartao.text();

    const cartaoId        = extractInput(htmlCartao, 'cartaoId');
    const crdsnr          = extractInput(htmlCartao, 'crdsnr');
    const cartaoNumero    = extractInput(htmlCartao, 'cartaoNumero');
    const cartaoDescricao = extractInput(htmlCartao, 'cartaoDescricao');
    const tipoParceria    = extractInput(htmlCartao, 'tipoParceria');

    if (!cartaoId) {
      return res.status(404).json({ erro: 'Cartão não encontrado para este CPF.' });
    }

    // ── Passo 2: busca o saldo ─────────────────────────────────────────────
    const params = new URLSearchParams({
      cpf:             cpfLimpo,
      cpfMascara:      '',
      tipoParceria:    tipoParceria ?? '',
      cartaoId:        cartaoId,
      crdsnr:          crdsnr ?? '',
      cartaoDesignId:  '6',
      cartaoDescricao: cartaoDescricao ?? '',
      cartaoNumero:    cartaoNumero ?? '',
    });

    const urlSaldo = `https://www.sitpass.com.br/servicosonline/consultasaldo/cartoes/saldo?${params}`;
    const resSaldo = await fetchWithRetry(urlSaldo);

    if (!resSaldo) {
      return res.status(503).json({ erro: 'Serviço Sitpass indisponível. Tente novamente.' });
    }

    const htmlSaldo = await resSaldo.text();

    const match = htmlSaldo.match(/R\$\s*([\d,.]+)/);

    if (!match) {
      return res.status(404).json({ erro: 'Saldo não encontrado.' });
    }

    return res.status(200).json({
      cpf:             cpfLimpo,
      cartaoNumero:    cartaoNumero ?? '',
      cartaoDescricao: cartaoDescricao ?? '',
      saldo:           match[1],
      saldo_formatado: `R$ ${match[1]}`,
    });

  } catch (err) {
    console.error('Erro na consulta de saldo:', err);
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  }
}
