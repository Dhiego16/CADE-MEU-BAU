// Conexão compartilhada com o Firestore (Admin SDK) para as rotas /api que gravam dados.
// O prefixo "_" faz a Vercel NÃO tratar este arquivo como uma rota.
// Requer a env var FIREBASE_SERVICE_ACCOUNT (JSON da conta de serviço) na Vercel.

let dbPromise = null;

export async function getRealDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      const credentials = JSON.parse(raw);
      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
      return getFirestore(app);
    })();
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

export async function getRealIncrement() {
  const { FieldValue } = await import('firebase-admin/firestore');
  return (n) => FieldValue.increment(n);
}
