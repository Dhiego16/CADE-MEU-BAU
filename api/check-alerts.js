import { Redis } from '@upstash/redis';
import webpush from 'web-push';

const redis = new Redis({
  url: 'https://capable-worm-81663.upstash.io',
  token: 'gQAAAAAAAT7_AAIncDFjYTc2ZmY2MDk1MGU0NmM2YTAwNTRlMmM2MzNlZWIyNXAxODE2NjM',
});

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || 'contato@cademeubau.vercel.app'),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  console.log('check-alerts iniciado');

  const authHeader = req.headers['authorization'];
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron) {
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
          console.log('QStash: assinatura inválida');
          return res.status(401).json({ erro: 'Não autorizado' });
        }
      } catch (e) {
        console.log('QStash: erro na verificação:', e.message);
        return res.status(401).json({ erro: 'Não autorizado' });
      }
    } else {
      console.log('Não autorizado: sem CRON_SECRET nem QStash keys');
      return res.status(401).json({ erro: 'Não autorizado' });
    }
  }

  let alertIds;
  try {
    alertIds = await redis.smembers('alerts:all');
    console.log('Alertas encontrados:', alertIds?.length);
  } catch (err) {
    console.log('Erro ao buscar alertas:', err.message);
    return res.status(500).json({ erro: 'Erro ao buscar alertas', detalhe: err.message });
  }

  if (!alertIds || alertIds.length === 0) {
    console.log('Nenhum alerta ativo');
    return res.status(200).json({ ok: true, checked: 0, message: 'Nenhum alerta ativo' });
  }

  const results = { checked: alertIds.length, notified: 0, removed: 0, errors: 0 };

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  for (const alertId of alertIds) {
    try {
      const raw = await redis.get(alertId);

      if (!raw) {
        await redis.srem('alerts:all', alertId);
        results.removed++;
        continue;
      }

      const alert = typeof raw === 'string' ? JSON.parse(raw) : raw;
      console.log(`Processando alerta: ponto=${alert.stopId} linha=${alert.lineNumber} threshold=${alert.minutes}min`);

      const url = `${baseUrl}/api/ponto?ponto=${alert.stopId}&linha=${alert.lineNumber}`;
      let apiRes;
      try {
        apiRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
      } catch (e) {
        console.log('Erro ao buscar RMTC:', e.message);
        results.errors++;
        continue;
      }

      if (!apiRes.ok) { results.errors++; continue; }

      const data = await apiRes.json();
      if (!data?.horarios?.length) {
        console.log('Sem horários para este ponto/linha');
        continue;
      }

      const proximo = data.horarios[0]?.proximo ?? data.horarios[0]?.previsao ?? '';
      const proxStr = String(proximo).trim();
      console.log(`Próximo ônibus: "${proxStr}"`);

      if (!proxStr || proxStr === 'SEM PREVISÃO' || /^[-.\s]+$/.test(proxStr)) continue;

      let mins = 999;
      if (proxStr.toLowerCase().includes('agora')) {
        mins = 0;
      } else {
        const parsed = parseInt(proxStr.replace(/\D/g, ''));
        if (!isNaN(parsed)) mins = parsed;
      }

      console.log(`Minutos: ${mins}, threshold: ${alert.minutes}`);

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
          console.log('Push enviado com sucesso!');
          results.notified++;
        } catch (pushErr) {
          console.log('Erro ao enviar push:', pushErr.message, 'status:', pushErr.statusCode);
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            await redis.del(alertId);
            await redis.srem('alerts:all', alertId);
            results.removed++;
          }
          results.errors++;
          continue;
        }

        await redis.del(alertId);
        await redis.srem('alerts:all', alertId);
        results.removed++;
      }
    } catch (err) {
      console.log(`Erro ao processar alerta ${alertId}:`, err.message);
      results.errors++;
    }
  }

  console.log('Resultado final:', JSON.stringify(results));
  return res.status(200).json({ ok: true, ...results });
}
