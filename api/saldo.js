/**
 * Vercel Serverless Function — /api/saldo?cpf=XXXXXXXXXXX
 * Consulta saldo do Bilhete Único no Sitpass
 * FIX: timeout de 7s por requisição para não deixar a função pendurada
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://www.sitpass.com.br/',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// FIX: fetchWithRetry com timeout por tentativa via AbortController
async function fetchWithRetry(url, options = {}, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { ...HEADERS, ...options.headers },
      });
      clearTimeout(timeoutId);
      if (res.ok) return res;
      // Resposta não-ok mas recebida: não vale retry em 404/403
      if (res.status === 404 || res.status === 403) return res;
      if (i < tentativas - 1) await sleep(1500);
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err?.name === 'AbortError';
      if (isAbort && i === tentativas - 1) throw new Error('TIMEOUT');
      if (i < tentativas - 1) await sleep(1500);
    }
  }
  return null;
}

// Extrai valor de um input hidden pelo name
function extractInput(html, name) {
  // Tenta variações de ordem dos atributos (value antes ou depois de name)
  const patterns = [
    new RegExp(`value="([^"]*)"\\s*name="${name}"`),
    new RegExp(`name="${name}"\\s*[^>]*value="([^"]*)"`),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { cpf } = req.query;

  if (!cpf) return res.status(400).json({ erro: 'CPF não informado' });

  const cpfLimpo = cpf.replace(/\D/g, '');
  if (cpfLimpo.length !== 11) return res.status(400).json({ erro: 'CPF inválido. Digite 11 dígitos.' });

  try {
    // ── Passo 1: busca dados do cartão ────────────────────────────────────
    const urlCartao = `https://www.sitpass.com.br/servicosonline/consultasaldo/cartoes?cpf=${cpfLimpo}`;
    let resCartao;
    try {
      resCartao = await fetchWithRetry(urlCartao);
    } catch (err) {
      if (err?.message === 'TIMEOUT') {
        return res.status(503).json({ erro: 'Sitpass demorou demais para responder. Tente novamente.' });
      }
      throw err;
    }

    if (!resCartao) {
      return res.status(503).json({ erro: 'Serviço Sitpass indisponível. Tente novamente.' });
    }

    if (resCartao.status === 404) {
      return res.status(404).json({ erro: 'CPF não encontrado no Sitpass.' });
    }

    const htmlCartao = await resCartao.text();

    const cartaoId        = extractInput(htmlCartao, 'cartaoId');
    const crdsnr          = extractInput(htmlCartao, 'crdsnr');
    const cartaoNumero    = extractInput(htmlCartao, 'cartaoNumero');
    const cartaoDescricao = extractInput(htmlCartao, 'cartaoDescricao');
    const tipoParceria    = extractInput(htmlCartao, 'tipoParceria');

    if (!cartaoId) {
      // FIX: distingue "CPF não tem cartão" de "página mudou / scraping falhou"
      const hasForm = htmlCartao.includes('consultasaldo');
      if (!hasForm) {
        console.error('Sitpass: estrutura da página mudou. HTML recebido:', htmlCartao.slice(0, 500));
        return res.status(503).json({ erro: 'Sitpass mudou o formato da página. Aguarde atualização.' });
      }
      return res.status(404).json({ erro: 'Nenhum cartão encontrado para este CPF.' });
    }

    // ── Passo 2: busca o saldo ────────────────────────────────────────────
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
    let resSaldo;
    try {
      resSaldo = await fetchWithRetry(urlSaldo);
    } catch (err) {
      if (err?.message === 'TIMEOUT') {
        return res.status(503).json({ erro: 'Sitpass demorou demais ao buscar o saldo. Tente novamente.' });
      }
      throw err;
    }

    if (!resSaldo) {
      return res.status(503).json({ erro: 'Serviço Sitpass indisponível ao buscar saldo.' });
    }

    const htmlSaldo = await resSaldo.text();
    const match = htmlSaldo.match(/R\$\s*([\d,.]+)/);

    if (!match) {
      console.error('Sitpass: saldo não encontrado no HTML de saldo:', htmlSaldo.slice(0, 500));
      return res.status(404).json({ erro: 'Saldo não encontrado. O Sitpass pode estar em manutenção.' });
    }

    return res.status(200).json({
      cpf:             cpfLimpo,
      cartaoNumero:    cartaoNumero ?? '',
      cartaoDescricao: cartaoDescricao ?? '',
      saldo:           match[1],
      saldo_formatado: `R$ ${match[1]}`,
    });

  } catch (err) {
    console.error('Erro inesperado na consulta de saldo:', err);
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  }
}
