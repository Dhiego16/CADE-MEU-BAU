// Proxy para OpenRouteService — mantém a API key apenas no servidor.
// Configure a env var ORS_API_KEY no painel da Vercel (Project Settings > Environment Variables).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { startLng, startLat, endLng, endLat } = req.query;

  if (!startLng || !startLat || !endLng || !endLat) {
    return res.status(400).json({ erro: 'Parâmetros obrigatórios: startLng, startLat, endLng, endLat.' });
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    console.error('ORS_API_KEY não configurada nas env vars.');
    return res.status(500).json({ erro: 'Serviço de rota indisponível no momento.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${apiKey}&start=${startLng},${startLat}&end=${endLng},${endLat}`;
    const orsRes = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!orsRes.ok) {
      return res.status(orsRes.status).json({ erro: 'Erro ao calcular rota.' });
    }

    const data = await orsRes.json();
    return res.status(200).json(data);
  } catch (err) {
    clearTimeout(timeout);
    console.error('Erro ao buscar rota:', err);
    return res.status(500).json({ erro: 'Erro ao calcular rota', mensagem: err.message });
  }
}
