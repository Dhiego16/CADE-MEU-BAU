import { useState, useCallback, useRef } from 'react';
import { BusLine } from '../types';
import { haptic } from '../utils';

// ─── Helper: converte chave VAPID base64 para Uint8Array ─────────────────────
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer.buffer;
}
export function useNotifications() {
  const [activeAlerts, setActiveAlerts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_alerts') || '{}'); } catch { return {}; }
  });
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    () => ('Notification' in window ? Notification.permission : 'denied')
  );
  const [showAlertModal, setShowAlertModal] = useState<string | null>(null);
  const activeAlertsRef = useRef(activeAlerts);
  const lastCheckedLinesRef = useRef<string>('');

  // Mantém ref sincronizada com state
  const updateActiveAlerts = useCallback((updater: (prev: Record<string, number>) => Record<string, number>) => {
    setActiveAlerts(prev => {
      const next = updater(prev);
      activeAlertsRef.current = next;
      localStorage.setItem('cade_meu_bau_alerts', JSON.stringify(next));
      return next;
    });
  }, []);

  const requestNotifPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    return result === 'granted';
  }, []);

  const sendNotification = useCallback(async (title: string, body: string) => {
    if (Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: 'cade-meu-bau',
          renotify: true,
          vibrate: [200, 100, 200],
        } as NotificationOptions & { renotify: boolean; vibrate: number[] });
      } else {
        new Notification(title, { body, icon: '/icons/icon-192x192.png' });
      }
    } catch (err) {
      console.warn('Notificação falhou:', err);
      try { new Notification(title, { body }); } catch { /* ignore */ }
    }
  }, []);

  // ─── Registra alerta no servidor para funcionar em segundo plano ───────────
  const registerPushAlert = useCallback(async (
    lineKey: string,
    minutes: number,
    stopId: string,
    lineNumber: string,
    destination: string
  ): Promise<boolean> => {
    try {
      // Verifica se o navegador suporta Push API
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push API não suportada neste navegador');
        return false;
      }

      const vapidKey = (import.meta as unknown as { env: Record<string, string> }).env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.warn('VAPID_PUBLIC_KEY não configurada');
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      // Pega subscription existente ou cria uma nova
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      // Envia pro servidor
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          lineKey,
          minutes,
          stopId,
          lineNumber,
          destination,
        }),
      });

      if (!response.ok) {
        console.warn('Erro ao registrar alerta no servidor');
        return false;
      }

      return true;
    } catch (err) {
      console.error('Erro ao registrar push:', err);
      return false;
    }
  }, []);

  const removeAlert = useCallback((lineKey: string) => {
    haptic(40);
    updateActiveAlerts(prev => {
      const next = { ...prev };
      delete next[lineKey];
      return next;
    });
  }, [updateActiveAlerts]);

  const setAlert = useCallback(async (lineKey: string, minutes: number) => {
    const granted = await requestNotifPermission();
    if (!granted) {
      alert('Permissão de notificação negada. Ative nas configurações do navegador.');
      return;
    }

    haptic([40, 30, 60]);
    updateActiveAlerts(prev => ({ ...prev, [lineKey]: minutes }));
    setShowAlertModal(null);

    // Extrai stopId e lineNumber do lineKey (formato "stopId::lineNumber")
    const parts = lineKey.split('::');
    const stopId = parts[0] || '';
    const lineNumber = parts[1] || '';

    // Tenta registrar no servidor para funcionar em segundo plano
    // Se falhar, o alerta local ainda funciona enquanto o app estiver aberto
    registerPushAlert(lineKey, minutes, stopId, lineNumber, '').catch(() => {
      console.warn('Push em segundo plano não disponível, usando alerta local');
    });

    await sendNotification(
      '🚍 Alerta configurado!',
      `Você será avisado quando o baú estiver a ${minutes} min.`
    );
  }, [requestNotifPermission, updateActiveAlerts, sendNotification, registerPushAlert]);

  const checkAlerts = useCallback(async (lines: BusLine[]) => {
    const alerts = activeAlertsRef.current;
    if (Object.keys(alerts).length === 0) return;

    const fingerprint = lines.map(l => `${l.stopSource}:${l.number}:${l.nextArrival}`).join('|');
    if (fingerprint === lastCheckedLinesRef.current) return;
    lastCheckedLinesRef.current = fingerprint;

    for (const line of lines) {
      const key = `${line.stopSource ?? ''}::${line.number}`;
      const alertMinutes = alerts[key];
      if (alertMinutes === undefined) continue;
      const nextStr = line.nextArrival ?? '';
      if (nextStr === 'SEM PREVISÃO') continue;
      const isNow = nextStr.toLowerCase().includes('agora');
      const mins = isNow ? 0 : parseInt(nextStr.replace(/\D/g, '')) || 999;
      if (mins <= alertMinutes) {
        const msg = isNow
          ? `O baú ${line.number} está chegando AGORA no ponto ${line.stopSource}!`
          : `O baú ${line.number} chega em ${mins} min no ponto ${line.stopSource}!`;
        await sendNotification('🚍 Baú chegando!', msg);
        haptic([100, 50, 100]);
        removeAlert(key);
      }
    }
  }, [removeAlert, sendNotification]);

  return {
    activeAlerts,
    activeAlertsRef,
    notifPermission,
    showAlertModal,
    setShowAlertModal,
    removeAlert,
    setAlert,
    checkAlerts,
    sendNotification,
    requestNotifPermission,
    registerPushAlert,
  };
}
