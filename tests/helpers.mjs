// Firestore falso (em memória) só pra testar os handlers de /api sem rede.
export function fakeDb() {
  const store = new Map();
  const mergeDeep = (base, add) => {
    const out = { ...base };
    for (const [k, v] of Object.entries(add)) {
      if (v && typeof v === 'object' && '__inc' in v) out[k] = (out[k] ?? 0) + v.__inc;
      else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = mergeDeep(out[k] ?? {}, v);
      else out[k] = v;
    }
    return out;
  };
  const ref = (col, id) => ({ col, id, path: `${col}/${id}` });
  const snap = (r) => ({ exists: store.has(r.path), data: () => store.get(r.path) });
  const db = {
    store,
    collection: (col) => ({
      doc: (id) => ({
        ...ref(col, id),
        set: async (data, opts) => {
          const r = ref(col, id);
          store.set(r.path, opts?.merge ? mergeDeep(store.get(r.path) ?? {}, data) : data);
        },
      }),
    }),
    getAll: async (...refs) => refs.map(snap),
    runTransaction: async (fn) => fn({
      get: async (r) => snap(r),
      set: (r, data) => { store.set(r.path, data); },
    }),
  };
  return db;
}
export const fakeInc = (n) => ({ __inc: n });

export function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

let ipCounter = 0;
export const newIp = () => `10.0.0.${++ipCounter}`;
