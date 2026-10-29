import { useState, useEffect, useRef, useCallback } from 'react';
import { CloudSync } from './useCloudSync';
import { readVaultDoc, writeVaultDoc, deleteVaultDoc, watchVaultDoc } from '../utils/cloud';
import {
  VaultPayload, VaultBlob, MIN_PASSPHRASE,
  newSalt, deriveKey, encryptPayload, decryptPayload, mergePayload, snapshotPayload,
  readLocalPayload, writeLocalPayload, saveDeviceKey, loadDeviceKey, clearDeviceKey,
} from '../utils/vault';

export type VaultState = 'off' | 'needs_login' | 'checking' | 'none' | 'locked' | 'unlocked' | 'error';

export interface SitpassVault {
  state: VaultState;
  busy: boolean;
  error: string | null;
  lastSyncAt: number | null;
  setup: (passphrase: string) => Promise<boolean>;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => Promise<void>;
  reset: () => Promise<void>;
  retry: () => void;
}

const POLL_MS = 3000;
const PUSH_DEBOUNCE_MS = 800;

export function useSitpassVault(cloud: CloudSync): SitpassVault {
  const uid = cloud.user?.uid ?? null;
  const [state, setState] = useState<VaultState>(cloud.configured ? 'needs_login' : 'off');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  const keyRef = useRef<CryptoKey | null>(null);
  const saltRef = useRef('');
  const lastSynced = useRef('');
  const unsubRef = useRef<(() => void) | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(() => {
    unsubRef.current?.(); unsubRef.current = null;
    if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null; }
    keyRef.current = null;
  }, []);

  /** Abre o cofre com a chave: mescla com o aparelho, grava o que faltar e passa a escutar a nuvem. */
  const activate = useCallback(async (u: string, key: CryptoKey, salt: string, remoteBlob: VaultBlob | null) => {
    const remote = remoteBlob ? await decryptPayload(key, u, remoteBlob) : null; // lança se a senha estiver errada
    const local = readLocalPayload();
    const merged = mergePayload(local, remote);

    if (!remote || snapshotPayload(merged) !== snapshotPayload(remote)) {
      await writeVaultDoc(u, await encryptPayload(key, u, merged, salt));
    }
    keyRef.current = key;
    saltRef.current = salt;
    lastSynced.current = snapshotPayload(merged);
    if (snapshotPayload(merged) !== snapshotPayload(local)) writeLocalPayload(merged);

    unsubRef.current?.();
    unsubRef.current = await watchVaultDoc(u, async blob => {
      if (!blob || blob.salt !== saltRef.current) {
        // cofre apagado ou recriado em outro aparelho: esta chave não vale mais
        await clearDeviceKey(u);
        teardown();
        setState(blob ? 'locked' : 'none');
        return;
      }
      try {
        const p = await decryptPayload(keyRef.current!, u, blob);
        if (snapshotPayload(p) === lastSynced.current) return;
        lastSynced.current = snapshotPayload(p);
        writeLocalPayload(p);
        setLastSyncAt(Date.now());
      } catch { teardown(); setState('locked'); }
    });
    setLastSyncAt(Date.now());
    setError(null);
    setState('unlocked');
  }, [teardown]);

  // ── Ao entrar com Google: descobre se já existe cofre e se este aparelho já está liberado ──
  useEffect(() => {
    teardown();
    setError(null);
    if (!cloud.configured) { setState('off'); return; }
    if (!uid) { setState('needs_login'); return; }

    let cancelled = false;
    setState('checking');
    (async () => {
      try {
        const blob = await readVaultDoc(uid);
        if (cancelled) return;
        if (!blob) { setState('none'); return; }
        const key = await loadDeviceKey(uid, blob.salt);
        if (key) {
          try { await activate(uid, key, blob.salt, blob); return; }
          catch { await clearDeviceKey(uid); }
        }
        if (!cancelled) setState('locked');
      } catch {
        if (!cancelled) { setError('Não foi possível acessar os cartões na nuvem.'); setState('error'); }
      }
    })();
    return () => { cancelled = true; teardown(); };
  }, [uid, cloud.configured, attempt, activate, teardown]);

  // ── Aberto: envia mudanças feitas neste aparelho ─────────────────────────
  useEffect(() => {
    if (state !== 'unlocked' || !uid) return;
    const check = () => {
      if (!keyRef.current) return;
      if (snapshotPayload(readLocalPayload()) === lastSynced.current) return;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(async () => {
        const cur = readLocalPayload();
        try {
          await writeVaultDoc(uid, await encryptPayload(keyRef.current!, uid, cur, saltRef.current));
          lastSynced.current = snapshotPayload(cur);
          setLastSyncAt(Date.now());
          setError(null);
        } catch { setError('Falha ao sincronizar os cartões.'); }
      }, PUSH_DEBOUNCE_MS);
    };
    const id = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null; }
    };
  }, [state, uid]);

  // ── Ações ────────────────────────────────────────────────────────────────
  const setup = useCallback(async (passphrase: string): Promise<boolean> => {
    if (!uid || busy) return false;
    if (passphrase.length < MIN_PASSPHRASE) { setError(`Use pelo menos ${MIN_PASSPHRASE} caracteres.`); return false; }
    setBusy(true); setError(null);
    try {
      const salt = newSalt();
      const key = await deriveKey(passphrase, salt);
      await activate(uid, key, salt, null);
      await saveDeviceKey(uid, salt, key);
      return true;
    } catch { setError('Não foi possível criar o cofre. Tente de novo.'); return false; }
    finally { setBusy(false); }
  }, [uid, busy, activate]);

  const unlock = useCallback(async (passphrase: string): Promise<boolean> => {
    if (!uid || busy) return false;
    setBusy(true); setError(null);
    try {
      const blob = await readVaultDoc(uid);
      if (!blob) { setState('none'); return false; }
      const key = await deriveKey(passphrase, blob.salt);
      try { await activate(uid, key, blob.salt, blob); }
      catch (e) {
        // GCM falha na autenticação quando a senha está errada
        if (e instanceof DOMException || (e as Error)?.name === 'OperationError') { setError('Senha incorreta.'); return false; }
        throw e;
      }
      await saveDeviceKey(uid, blob.salt, key);
      return true;
    } catch { setError('Não foi possível abrir o cofre. Verifique a conexão.'); return false; }
    finally { setBusy(false); }
  }, [uid, busy, activate]);

  const lock = useCallback(async () => {
    if (uid) await clearDeviceKey(uid);
    teardown();
    setState('locked');
  }, [uid, teardown]);

  const reset = useCallback(async () => {
    if (!uid) return;
    setBusy(true);
    try {
      await deleteVaultDoc(uid);
      await clearDeviceKey(uid);
      teardown();
      setLastSyncAt(null);
      setError(null);
      setState('none');
    } catch { setError('Não foi possível apagar da nuvem.'); }
    finally { setBusy(false); }
  }, [uid, teardown]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  return { state, busy, error, lastSyncAt, setup, unlock, lock, reset, retry };
}
