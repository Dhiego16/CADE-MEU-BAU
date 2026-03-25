import { Redis } from '@upstash/redis';
import webpush from 'web-push';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL, // Mudamos de KV_ para UPSTASH_
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || 'contato@cademeubau.vercel.app'),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // Aceita apenas chamada do cron da Vercel (Bearer token)
  const authHeader = req.headers['authorization'];
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // Também aceita chamada direta do QStash (assinatura) se configurado
  if (!isVercelCron) {
    // Tenta validar assinatura do QStash se as envs existirem
    if (process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY) {
      try {
        const { Receiver } = await import('@upstash/qstash');
        const receiver = new Receiver({
          currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
          nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
        });

        const body = await new Promise((resolve) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => resolve(data));
        });

        const isValid = await receiver.verify({
          signature: req.headers['upstash-signature'],
          body: body || '',
        });

        if (!isValid) {
          return res.status(401).json({ erro: 'Não autorizado' });
        }
      } catch {
        return res.status(401).json({ erro: 'Não autorizado' });
      }
    } else {
      return res.status(401).json({ erro: 'Não autorizado' });
    }
  }

  let alertIds;
  try {
    alertIds = await redis.smembers('alerts:all');
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao buscar alertas', detalhe: err.message });
  }

  if (!alertIds || alertIds.length === 0) {
    return res.status(200).json({ ok: true, checked: 0, message: 'Nenhum alerta ativo' });
  }

  const results = { checked: alertIds.length, notified: 0, removed: 0, errors: 0 };

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  for (const alertId of alertIds) {
    try {
      const raw = await redis.get(alertId);

      // Alerta expirou (TTL do Redis zerou) — limpa o índice
      if (!raw) {
        await redis.srem('alerts:all', alertId);
        results.removed++;
        continue;
      }

      const alert = typeof raw === 'string' ? JSON.parse(raw) : raw;

      // Busca horário atual do ponto/linha na RMTC
      const url = `${baseUrl}/api/ponto?ponto=${alert.stopId}&linha=${alert.lineNumber}`;
      let apiRes;
      try {
        apiRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
      } catch {
        results.errors++;
        continue;
      }

      if (!apiRes.ok) { results.errors++; continue; }

      const data = await apiRes.json();
      if (!data?.horarios?.length) continue;

      const proximo = data.horarios[0]?.proximo ?? data.horarios[0]?.previsao ?? '';
      const proxStr = String(proximo).trim();

      if (!proxStr || proxStr === 'SEM PREVISÃO' || /^[-.\s]+$/.test(proxStr)) continue;

      let mins = 999;
      if (proxStr.toLowerCase().includes('agora')) {
        mins = 0;
      } else {
        const parsed = parseInt(proxStr.replace(/\D/g, ''));
        if (!isNaN(parsed)) mins = parsed;
      }

      if (mins <= alert.minutes) {
        const payload = JSON.stringify({
          title: '🚍 Baú chegando!',
          body: mins === 0
            ? `Linha ${alert.lineNumber} está chegando AGORA no ponto ${alert.stopId}!`
            : `Linha ${alert.lineNumber} chega em ${mins} min no ponto ${alert.stopId}!`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          data: {
            url: `/?ponto=${alert.stopId}&linha=${alert.lineNumber}`,
          },
        });

        try {
          await webpush.sendNotification(alert.subscription, payload);
          results.notified++;
        } catch (pushErr) {
          console.error(`Erro ao enviar push para alerta ${alertId}:`, pushErr.message);
          // Subscription inválida/expirada — remove o alerta
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            await redis.del(alertId);
            await redis.srem('alerts:all', alertId);
            results.removed++;
          }
          results.errors++;
          continue;
        }

        // Notificação enviada com sucesso — remove o alerta (one-shot)
        await redis.del(alertId);
        await redis.srem('alerts:all', alertId);
        results.removed++;
      }
    } catch (err) {
      console.error(`Erro ao processar alerta ${alertId}:`, err.message);
      results.errors++;
    }
  }

  return res.status(200).json({ ok: true, ...results });
}
