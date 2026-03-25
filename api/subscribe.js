import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: 'https://capable-worm-81663.upstash.io',
  token: 'gQAAAAAAAT7_AAIncDFjYTc2ZmY2MDk1MGU0NmM2YTAwNTRlMmM2MzNlZWIyNXAxODE2NjM',
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { subscription, lineKey, minutes, stopId, lineNumber, destination } = req.body;

  if (!subscription || !lineKey || !stopId || !lineNumber) {
    return res.status(400).json({ erro: 'Dados incompletos' });
  }

  const alertId = `alert:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  // Salva o alerta com expiração de 2 horas
  await redis.set(
    alertId,
    JSON.stringify({
      subscription,
      lineKey,
      minutes,
      stopId,
      lineNumber,
      destination: destination || '',
      createdAt: Date.now(),
    }),
    { ex: 60 * 60 * 2 }
  );

  // Indexa o ID para conseguir listar todos os alertas ativos
  await redis.sadd('alerts:all', alertId);

  return res.status(200).json({ ok: true, alertId });
}
