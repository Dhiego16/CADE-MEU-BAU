import { useState, useEffect, useRef, useCallback } from 'react';
import { FavoriteItem, RoutineItem } from '../types';
import {
  isCloudConfigured, CloudUser, CloudData,
  watchAuth, signInGoogle, signOutCloud, readCloud, writeCloud, watchCloud, mergeData,
} from '../utils/cloud';

const ENABLED_KEY = 'cade_meu_bau_cloud_enabled';
const FAVS_KEY = 'cade_meu_bau_app_favs';
const ROUTINES_KEY = 'cade_meu_bau_routines';
const PUSH_DEBOUNCE_MS = 1500;

export type CloudStatus = 'off' | 'signed_out' | 'syncing' | 'synced' | 'error';

export interface CloudSync {
  configured: boolean;
  user: CloudUser | null;
  status: CloudStatus;
  lastSyncAt: number | null;
  busy: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const snapshot = (d: CloudData) => JSON.stringify({ f: d.favorites, r: d.routines });

export function useCloudSync(
  favorites: FavoriteItem[],
  setFavorites: (v: FavoriteItem[]) => void,
  routines: RoutineItem[],
  setRoutines: (v: RoutineItem[]) => void,
): CloudSync {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [status, setStatus] = useState<CloudStatus>(isCloudConfigured ? 'signed_out' : 'off');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const latest = useRef<CloudData>({ favorites, routines });
  latest.current = { favorites, routines };
  const lastSynced = useRef('');       // último estado que sabemos estar igual na nuvem
  const ready = useRef(false);         // só envia depois da mescla inicial
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubCloud = useRef<(() => void) | null>(null);

  const applyRemote = useCallback((d: CloudData) => {
    lastSynced.current = snapshot(d);
    try {
      localStorage.setItem(FAVS_KEY, JSON.stringify(d.favorites));
      localStorage.setItem(ROUTINES_KEY, JSON.stringify(d.routines));
    } catch { /* sem espaço: segue só em memória */ }
    setFavorites(d.favorites);
    setRoutines(d.routines);
  }, [setFavorites, setRoutines]);

  // ── Login: só carrega o SDK se a pessoa já ativou a nuvem antes ──────────
  const authUnsub = useRef<(() => void) | null>(null);
  const authStarting = useRef<Promise<void> | null>(null);

  const ensureWatching = useCallback((): Promise<void> => {
    if (!isCloudConfigured || authUnsub.current) return Promise.resolve();
    if (!authStarting.current) {
      authStarting.current = watchAuth(setUser)
        .then(u => { authUnsub.current = u; })
        .finally(() => { authStarting.current = null; });
    }
    return authStarting.current;
  }, []);

  useEffect(() => {
    if (!isCloudConfigured || localStorage.getItem(ENABLED_KEY) !== '1') return;
    ensureWatching().catch(() => setStatus('error'));
    return () => { authUnsub.current?.(); authUnsub.current = null; };
  }, [ensureWatching]);

  // ── Ao entrar: mescla uma vez e passa a ouvir a nuvem ────────────────────
  useEffect(() => {
    if (!isCloudConfigured) return;
    unsubCloud.current?.();
    unsubCloud.current = null;
    ready.current = false;

    if (!user) { setStatus('signed_out'); return; }

    let cancelled = false;
    setStatus('syncing');
    (async () => {
      try {
        const remote = await readCloud(user.uid);
        if (cancelled) return;
        const merged = mergeData(latest.current, remote);
        if (!remote || snapshot(merged) !== snapshot(remote)) await writeCloud(user.uid, merged);
        if (cancelled) return;
        applyRemote(merged);
        ready.current = true;
        setLastSyncAt(Date.now());
        setStatus('synced');
        unsubCloud.current = await watchCloud(user.uid, d => {
          if (snapshot(d) === lastSynced.current) return;
          applyRemote(d);
          setLastSyncAt(Date.now());
          setStatus('synced');
        });
        if (cancelled) { unsubCloud.current?.(); unsubCloud.current = null; }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; unsubCloud.current?.(); unsubCloud.current = null; };
  }, [user, applyRemote, attempt]);

  // ── Mudou algo neste aparelho: envia depois de uma pausa ─────────────────
  useEffect(() => {
    if (!user || !ready.current) return;
    const now = snapshot({ favorites, routines });
    if (now === lastSynced.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      try {
        setStatus('syncing');
        await writeCloud(user.uid, latest.current);
        lastSynced.current = snapshot(latest.current);
        setLastSyncAt(Date.now());
        setStatus('synced');
      } catch { setStatus('error'); }
    }, PUSH_DEBOUNCE_MS);
    return () => { if (pushTimer.current) clearTimeout(pushTimer.current); };
  }, [favorites, routines, user]);

  const signIn = useCallback(async () => {
    if (!isCloudConfigured || busy) return;
    setBusy(true);
    try {
      localStorage.setItem(ENABLED_KEY, '1');
      await ensureWatching(); // listener de login ativo antes de abrir o popup
      await signInGoogle();
    } catch { setStatus('error'); }
    finally { setBusy(false); }
  }, [busy, ensureWatching]);

  const signOut = useCallback(async () => {
    try { await signOutCloud(); } catch { /* ignora */ }
    localStorage.removeItem(ENABLED_KEY);
    ready.current = false;
    setUser(null);
    setLastSyncAt(null);
  }, []);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  return { configured: isCloudConfigured, user, status, lastSyncAt, busy, signIn, signOut, retry };
}
