// ─── Cofre do SitPass ────────────────────────────────────────────────────────
// Criptografa os dados sensíveis (CPFs, cartão favorito, último saldo) NO APARELHO
// antes de mandá-los para a nuvem. O servidor só enxerga texto cifrado: a senha
// nunca sai daqui. AES-256-GCM, chave derivada da senha por PBKDF2 (SHA-256).

import type { CartaoFavorito } from '../hooks/useSitpass';
import type { SaldoHistorico } from '../types';

export const VAULT_RESTORED_EVENT = 'cade-sitpass-restored';

const CPFS_KEY = 'sitpass_cpfs_salvos';
const FAV_KEY = 'cade_meu_bau_sitpass_favorito';
const SALDO_KEY = 'cade_meu_bau_saldo_historico';
const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 8;
const MAX_CPFS = 3;

export interface VaultPayload {
  cpfs: string[];
  favorito: CartaoFavorito | null;
  saldo: SaldoHistorico | null;
}
export interface VaultBlob { v: 1; salt: string; iv: string; ct: string }

const te = new TextEncoder();
const td = new TextDecoder();

// ── base64 ───────────────────────────────────────────────────────────────────
const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// ── cripto ───────────────────────────────────────────────────────────────────
export const newSalt = (): string => toB64(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveKey(passphrase: string, saltB64: string, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // não extraível: nem o próprio app consegue ler a chave, só usá-la
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPayload(key: CryptoKey, uid: string, payload: VaultPayload, salt: string): Promise<VaultBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(uid) }, // amarra o cofre à conta
    key,
    te.encode(JSON.stringify(normalizePayload(payload))),
  );
  return { v: 1, salt, iv: toB64(iv), ct: toB64(ct) };
}

/** Lança erro se a senha estiver errada ou o conteúdo tiver sido alterado. */
export async function decryptPayload(key: CryptoKey, uid: string, blob: VaultBlob): Promise<VaultPayload> {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(blob.iv), additionalData: te.encode(uid) },
    key,
    fromB64(blob.ct),
  );
  return normalizePayload(JSON.parse(td.decode(buf)));
}

// ── formato canônico (garante comparação estável entre aparelhos) ────────────
const str = (v: unknown, max = 80): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function normalizePayload(p: Partial<VaultPayload> | null | undefined): VaultPayload {
  const cpfs = Array.isArray(p?.cpfs) ? p!.cpfs.filter(c => typeof c === 'string' && c.length > 0 && c.length <= 20) : [];
  const f = p?.favorito as Partial<CartaoFavorito> | null | undefined;
  const favorito: CartaoFavorito | null = f && typeof f.cpf === 'string' && f.cpf
    ? {
        cpf: str(f.cpf, 20),
        cartaoIndex: typeof f.cartaoIndex === 'number' ? f.cartaoIndex : 0,
        cartaoNumero: str(f.cartaoNumero),
        cartaoDescricao: str(f.cartaoDescricao),
        tipoParceria: str(f.tipoParceria),
      }
    : null;
  const s = p?.saldo as Partial<SaldoHistorico> | null | undefined;
  const saldo: SaldoHistorico | null = s && typeof s.saldo_formatado === 'string'
    ? {
        saldo_formatado: str(s.saldo_formatado, 30),
        cartaoDescricao: str(s.cartaoDescricao),
        data: str(s.data, 20),
        hora: str(s.hora, 10),
      }
    : null;
  return { cpfs: [...new Set(cpfs)].slice(0, MAX_CPFS), favorito, saldo };
}

export const snapshotPayload = (p: VaultPayload): string => JSON.stringify(normalizePayload(p));

// ── mescla (primeira vez que um aparelho abre o cofre) ───────────────────────
function saldoTime(s: SaldoHistorico | null): number {
  if (!s) return 0;
  const [d, m, y] = s.data.split('/').map(Number);
  const [hh, mm] = s.hora.split(':').map(Number);
  const t = new Date(y, (m ?? 1) - 1, d, hh || 0, mm || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function mergePayload(local: VaultPayload, remote: VaultPayload | null): VaultPayload {
  if (!remote) return normalizePayload(local);
  return normalizePayload({
    cpfs: [...local.cpfs, ...remote.cpfs],
    favorito: local.favorito ?? remote.favorito,
    saldo: saldoTime(remote.saldo) > saldoTime(local.saldo) ? remote.saldo : (local.saldo ?? remote.saldo),
  });
}

// ── dados locais (as mesmas chaves que o resto do app já usa) ────────────────
const readJson = <T,>(k: string, fallback: T): T => {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
};

export const readLocalPayload = (): VaultPayload => normalizePayload({
  cpfs: readJson<string[]>(CPFS_KEY, []),
  favorito: readJson<CartaoFavorito | null>(FAV_KEY, null),
  saldo: readJson<SaldoHistorico | null>(SALDO_KEY, null),
});

/** Grava no aparelho e avisa as telas para recarregarem. */
export function writeLocalPayload(p: VaultPayload): void {
  const n = normalizePayload(p);
  try {
    localStorage.setItem(CPFS_KEY, JSON.stringify(n.cpfs));
    if (n.favorito) localStorage.setItem(FAV_KEY, JSON.stringify(n.favorito)); else localStorage.removeItem(FAV_KEY);
    if (n.saldo) localStorage.setItem(SALDO_KEY, JSON.stringify(n.saldo)); else localStorage.removeItem(SALDO_KEY);
  } catch { /* sem espaço */ }
  window.dispatchEvent(new Event(VAULT_RESTORED_EVENT));
}

// ── chave guardada neste aparelho (IndexedDB, não extraível) ─────────────────
const IDB_NAME = 'cade_meu_bau_vault';
const IDB_STORE = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

export async function saveDeviceKey(uid: string, salt: string, key: CryptoKey): Promise<void> {
  try { await idb('readwrite', s => s.put({ salt, key }, uid)); } catch { /* modo privado: pede a senha de novo depois */ }
}
export async function loadDeviceKey(uid: string, salt: string): Promise<CryptoKey | null> {
  try {
    const v = await idb<{ salt: string; key: CryptoKey } | undefined>('readonly', s => s.get(uid));
    return v && v.salt === salt ? v.key : null;
  } catch { return null; }
}
export async function clearDeviceKey(uid: string): Promise<void> {
  try { await idb('readwrite', s => s.delete(uid)); } catch { /* ignora */ }
}
