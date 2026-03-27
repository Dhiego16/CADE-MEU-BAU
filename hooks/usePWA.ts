import { useState, useEffect, useRef } from 'react';
import { haptic } from '../utils';

export interface UsePWAReturn {
  showInstallBanner: boolean;
  showIosInstructions: boolean;
  showUpdateBanner: boolean;
  isInstalled: boolean;
  isIosDevice: boolean;
  handleInstall: () => Promise<void>;
  dismissInstallBanner: () => void;
  setShowIosInstructions: (v: boolean) => void;
  applyUpdate: () => void;
}

export function usePWA(): UsePWAReturn {
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches
  );
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);

  // ── Install banner (Android/Chrome) e iOS Safari ──────────────────────────
  useEffect(() => {
    if (isInstalled) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const dismissed = localStorage.getItem('cade_meu_bau_install_dismissed');

    if (isIos && isSafari && !dismissed) {
      const t = setTimeout(() => setShowInstallBanner(true), 3000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      if (!dismissed) setShowInstallBanner(true);
    };

    const installed = () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    const fb = setTimeout(() => { if (!dismissed) setShowInstallBanner(true); }, 4000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
      clearTimeout(fb);
    };
  }, [isInstalled]);

  // ── Service Worker update detection ───────────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(reg => {
      swRegistrationRef.current = reg;
      if (reg.waiting) setShowUpdateBanner(true);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            setShowUpdateBanner(true);
          }
        });
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });
  }, []);

  const handleInstall = async () => {
    haptic(50);
    if (deferredInstallPrompt) {
      (deferredInstallPrompt as unknown as { prompt: () => void }).prompt();
      setShowInstallBanner(false);
    } else {
      setShowIosInstructions(true);
    }
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('cade_meu_bau_install_dismissed', 'true');
    haptic(30);
  };

  const applyUpdate = () => {
    const reg = swRegistrationRef.current;
    if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    setShowUpdateBanner(false);
  };

  return {
    showInstallBanner,
    showIosInstructions,
    showUpdateBanner,
    isInstalled,
    isIosDevice,
    handleInstall,
    dismissInstallBanner,
    setShowIosInstructions,
    applyUpdate,
  };
}
