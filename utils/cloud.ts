// ─── Nuvem (Firebase) ────────────────────────────────────────────────────────
// Carregado sob demanda: quem não entrou com Google nunca baixa o SDK.
// Sem as variáveis VITE_FIREBASE_* o recurso fica desligado e o app segue igual.

import type { FavoriteItem, RoutineItem } from '../types';
import type { VaultBlob } from './vault';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const isCloudConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

export interface CloudUser { uid: string; name: string; email: string; photo: string | null }
export interface CloudData { favorites: FavoriteItem[]; routines: RoutineItem[] }

type FirebaseBundle = {
  auth: import('firebase/auth').Auth;
  db: import('firebase/firestore').Firestore;
  a: typeof import('firebase/auth');
  f: typeof import('firebase/firestore');
};

let bundlePromise: Promise<FirebaseBundle> | null = null;

function getBundle(): Promise<FirebaseBundle> {
  if (!isCloudConfigured) return Promise.reject(new Error('cloud_not_configured'));
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const [{ initializeApp }, a, f] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const app = initializeApp(config as Record<string, string>);
      return { auth: a.getAuth(app), db: f.getFirestore(app), a, f };
    })();
    bundlePromise.catch(() => { bundlePromise = null; });
  }
  return bundlePromise;
}

const toUser = (u: import('firebase/auth').User): CloudUser => ({
  uid: u.uid,
  name: u.displayName ?? '',
  email: u.email ?? '',
  photo: u.photoURL,
});

/** Escuta o login. Devolve a função para cancelar. */
export async function watchAuth(cb: (u: CloudUser | null) => void): Promise<() => void> {
  const { auth, a } = await getBundle();
  return a.onAuthStateChanged(auth, u => cb(u ? toUser(u) : null));
}

export async function signInGoogle(): Promise<void> {
  const { auth, a } = await getBundle();
  const provider = new a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await a.signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    // Popup bloqueado (comum em PWA instalado no iPhone): cai para redirecionamento
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await a.signInWithRedirect(auth, provider);
      return;
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    throw err;
  }
}

export async function signOutCloud(): Promise<void> {
  const { auth, a } = await getBundle();
  await a.signOut(auth);
}

const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)); // Firestore não aceita undefined

export async function readCloud(uid: string): Promise<CloudData | null> {
  const { db, f } = await getBundle();
  const snap = await f.getDoc(f.doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    favorites: Array.isArray(d.favorites) ? d.favorites : [],
    routines: Array.isArray(d.routines) ? d.routines : [],
  };
}

export async function writeCloud(uid: string, data: CloudData): Promise<void> {
  const { db, f } = await getBundle();
  await f.setDoc(f.doc(db, 'users', uid), {
    favorites: clean(data.favorites),
    routines: clean(data.routines),
    updatedAt: f.serverTimestamp(),
  });
}

/** Escuta mudanças vindas de outro aparelho. Ignora o "eco" das próprias gravações. */
export async function watchCloud(uid: string, cb: (d: CloudData) => void): Promise<() => void> {
  const { db, f } = await getBundle();
  return f.onSnapshot(f.doc(db, 'users', uid), snap => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const d = snap.data();
    cb({
      favorites: Array.isArray(d.favorites) ? d.favorites : [],
      routines: Array.isArray(d.routines) ? d.routines : [],
    });
  });
}

// ── Mescla no primeiro login: une o que há no aparelho com o que há na nuvem ──
export function mergeData(local: CloudData, remote: CloudData | null): CloudData {
  if (!remote) return local;
  const favs = new Map<string, FavoriteItem>();
  for (const f of remote.favorites) favs.set(`${f.stopId}::${f.lineNumber}`, f);
  for (const f of local.favorites) {
    const k = `${f.stopId}::${f.lineNumber}`;
    const r = favs.get(k);
    favs.set(k, r ? { ...r, nickname: r.nickname || f.nickname } : f);
  }
  const routines = new Map<string, RoutineItem>();
  for (const r of remote.routines) routines.set(r.id, r);
  for (const r of local.routines) if (!routines.has(r.id)) routines.set(r.id, r);
  return { favorites: [...favs.values()], routines: [...routines.values()] };
}

// ── Cofre do SitPass: users/{uid}/private/sitpass (só texto cifrado) ─────────
const vaultRef = (b: FirebaseBundle, uid: string) => b.f.doc(b.db, 'users', uid, 'private', 'sitpass');

const toBlob = (d: Record<string, unknown> | undefined): VaultBlob | null =>
  d && typeof d.salt === 'string' && typeof d.iv === 'string' && typeof d.ct === 'string'
    ? { v: 1, salt: d.salt, iv: d.iv, ct: d.ct }
    : null;

export async function readVaultDoc(uid: string): Promise<VaultBlob | null> {
  const b = await getBundle();
  const snap = await b.f.getDoc(vaultRef(b, uid));
  return snap.exists() ? toBlob(snap.data()) : null;
}

export async function writeVaultDoc(uid: string, blob: VaultBlob): Promise<void> {
  const b = await getBundle();
  await b.f.setDoc(vaultRef(b, uid), { ...blob, updatedAt: b.f.serverTimestamp() });
}

export async function deleteVaultDoc(uid: string): Promise<void> {
  const b = await getBundle();
  await b.f.deleteDoc(vaultRef(b, uid));
}

export async function watchVaultDoc(uid: string, cb: (blob: VaultBlob | null) => void): Promise<() => void> {
  const b = await getBundle();
  return b.f.onSnapshot(vaultRef(b, uid), snap => {
    if (snap.metadata.hasPendingWrites) return;
    cb(snap.exists() ? toBlob(snap.data()) : null);
  });
}
