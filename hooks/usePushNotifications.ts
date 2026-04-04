const WORKER_URL = 'https://cade-meu-bau-alerts.cj22233333.workers.dev';

async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${WORKER_URL}/vapid-public-key`);
  const data = await res.json();
  return data.key;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const key = await getVapidPublicKey();
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
}

export async function registerAlert(
  stopId: string,
  lineNumber: string,
  thresholdMinutes: number
): Promise<{ ok: boolean; key?: string; error?: string }> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, error: 'permission_denied' };

    const subscription = await subscribeToPush();
    if (!subscription) return { ok: false, error: 'push_unavailable' };

    const res = await fetch(`${WORKER_URL}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        stopId,
        lineNumber,
        thresholdMinutes,
      }),
    });

    const data = await res.json();
    return { ok: true, key: data.key };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function unregisterAlert(key: string): Promise<void> {
  try {
    await fetch(`${WORKER_URL}/alerts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
  } catch { /* ignora */ }
}
