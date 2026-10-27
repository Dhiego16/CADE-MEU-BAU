const cache = new Map();
const CACHE_DURATION = 10 * 1000;
const CACHE_MAX_ENTRIES = 200;

export default async function handler(req, res) {
  const raw = String(req.query.linha ?? '000').replace(/\D/g, '');
  if (!raw || raw.length > 4) {
    return res.status(400).json({ erro: 'Linha inválida.' });
  }
  const linha = raw.padStart(3, '0');
  const now = Date.now();

  const cached = cache.get(linha);
  if (cached && now - cached.time < CACHE_DURATION) {
    return res.status(200).json(cached.data);
  }

  const params = new URLSearchParams({
    option: 'com_rmtclinhas',
    view: 'cconaweb',
    format: 'json',
    linha,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`https://rmtcgoiania.com.br/index.php?${params}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://rmtcgoiania.com.br/',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ erro: `RMTC respondeu HTTP ${response.status}` });
    }

    const data = await response.json();

    const onibus = (data.onibus || [])
      .filter(bus => bus.Situacao !== 'ForaServico' && bus.Situacao !== 'Intervalo')
      .map(bus => ({
        numero: bus.Numero,
        lat: bus.Latitude,
        lng: bus.Longitude,
        destino: bus.Destino?.DestinoCurto || 'N/A',
        status: bus.Situacao,
        linha: bus.Linha?.LinhaNumero,
      }));

    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(linha, { data: onibus, time: now });

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');
    res.status(200).json(onibus);
  } catch (err) {
    clearTimeout(timeout);
    res.status(500).json({ erro: err instanceof Error ? err.message : 'Erro ao buscar ônibus' });
  }
}
