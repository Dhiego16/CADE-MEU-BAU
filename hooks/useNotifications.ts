import { useState, useCallback, useRef } from 'react';
import { BusLine } from '../types';
import { haptic } from '../utils';

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

    await sendNotification(
      '🚍 Alerta configurado!',
      `Você será avisado quando o baú estiver a ${minutes} min.`
    );
  }, [requestNotifPermission, updateActiveAlerts, sendNotification]);

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
  };
}
