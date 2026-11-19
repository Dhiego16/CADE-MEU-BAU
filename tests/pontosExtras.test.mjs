import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePontos, loadExtraStops, tileOf, findExtraStop, getExtraStops, __resetPontosExtras } from '../utils/pontosExtras.ts';

const memStore = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
};
const P = (id, nome = `Ponto ${id}`) => ({ id, lat: -16.68, lng: -49.25, nome });
const T0 = 1_800_000_000_000;
const fetchOk = (stops, counter) => async (url) => { if (counter) counter.n += 1; counter && (counter.url = url); return { ok: true, json: async () => ({ stops }) }; };

test.beforeEach(() => __resetPontosExtras());

test('mergePontos: ponto local vence e não duplica', () => {
  const base = [P('05946', 'Local')];
  const out = mergePontos(base, [P('05946', 'OSM'), P('07662')]);
  assert.deepEqual(out.map(p => p.id), ['05946', '07662']);
  assert.equal(out[0].nome, 'Local');
});

test('carrega da API, guarda no aparelho e não busca de novo dentro da validade', async () => {
  const store = memStore(); const c = { n: 0 };
  const a = await loadExtraStops(-16.68, -49.24, { fetchImpl: fetchOk([P('07662')], c), store, now: T0 });
  assert.equal(a.length, 1);
  assert.match(c.url, /^\/api\/pontos-osm\?lat=-?16\.\d+&lng=-?49\.\d+$/);
  const b = await loadExtraStops(-16.6801, -49.2401, { fetchImpl: fetchOk([], c), store, now: T0 + 3600_000 });
  assert.equal(b.length, 1);
  assert.equal(c.n, 1);
  assert.equal(findExtraStop('7662').id, '07662');
  assert.equal(getExtraStops().length, 1);
});

test('só pede para a quadra, nunca a localização exata', async () => {
  const c = { n: 0 };
  await loadExtraStops(-16.68123456, -49.25987654, { fetchImpl: fetchOk([], c), store: memStore(), now: T0 });
  const t = tileOf(-16.68123456, -49.25987654);
  assert.ok(c.url.includes(`lat=${t.lat}&lng=${t.lng}`));
  assert.ok(!c.url.includes('68123456'));
});

test('fora da Grande Goiânia: nem chama a API', async () => {
  const c = { n: 0 };
  const r = await loadExtraStops(-23.55, -46.63, { fetchImpl: fetchOk([P('07662')], c), store: memStore(), now: T0 });
  assert.deepEqual(r, []);
  assert.equal(c.n, 0);
});

test('API fora do ar: devolve [] sem estourar; usa cache vencido se existir', async () => {
  const store = memStore();
  const down = async () => { throw new Error('rede'); };
  assert.deepEqual(await loadExtraStops(-16.68, -49.25, { fetchImpl: down, store, now: T0 }), []);
  await loadExtraStops(-16.68, -49.25, { fetchImpl: fetchOk([P('07662')]), store, now: T0 });
  __resetPontosExtras();
  const velho = await loadExtraStops(-16.68, -49.25, { fetchImpl: down, store, now: T0 + 30 * 24 * 3600_000 });
  assert.equal(velho.length, 1);
});

test('descarta dados fora do formato (id inválido, fora da região, HTML no nome)', async () => {
  const sujo = [
    P('07662', '<script>x</script>Av'),
    { id: '123', lat: -16.68, lng: -49.25, nome: 'curto' },
    { id: '99999', lat: -10, lng: -49.25, nome: 'longe' },
    { id: '88888', lat: 'x', lng: -49.25, nome: 'tipo' },
    null,
  ];
  const r = await loadExtraStops(-16.68, -49.25, { fetchImpl: fetchOk(sujo), store: memStore(), now: T0 });
  assert.deepEqual(r.map(p => p.id), ['07662']);
  assert.ok(!/[<>]/.test(r[0].nome));
});
