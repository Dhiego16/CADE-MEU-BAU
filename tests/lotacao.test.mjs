import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler, summarize } from '../api/lotacao.js';
import { fakeDb, fakeRes, newIp } from './helpers.mjs';

const post = (handler, body, ip = newIp()) => {
  const res = fakeRes();
  return handler({ method: 'POST', headers: { 'x-forwarded-for': ip }, body }, res).then(() => res);
};
const get = (handler, keys) => {
  const res = fakeRes();
  return handler({ method: 'GET', query: { keys }, headers: {} }, res).then(() => res);
};
const valid = (over = {}) => ({ k: '09005::110', n: 2, b: 'pico_manha', c: 'aparelho-0001', ...over });

test('rejeita chave, nível, faixa e id inválidos', async () => {
  const h = makeHandler(async () => fakeDb());
  assert.equal((await post(h, valid({ k: 'abc' }))).statusCode, 400);
  assert.equal((await post(h, valid({ n: 5 }))).statusCode, 400);
  assert.equal((await post(h, valid({ n: '2' }))).statusCode, 400);
  assert.equal((await post(h, valid({ b: 'madrugada' }))).statusCode, 400);
  assert.equal((await post(h, valid({ c: '!!' }))).statusCode, 400);
});

test('grava um relato e ignora repetição do mesmo aparelho em menos de 20 min', async () => {
  const db = fakeDb();
  const h = makeHandler(async () => db);
  assert.equal((await post(h, valid())).body.ok, true);
  const dup = await post(h, valid());
  assert.equal(dup.body.ok, false);
  assert.equal(dup.body.motivo, 'duplicada');
  assert.equal(db.store.get('lotacao/09005_110').items.length, 1);
});

test('resume por faixa com mediana e nº de aparelhos diferentes', () => {
  const now = Date.now();
  const items = [
    { n: 3, b: 'pico_manha', t: now, c: 'a' },
    { n: 3, b: 'pico_manha', t: now, c: 'b' },
    { n: 1, b: 'pico_manha', t: now, c: 'c' },   // um relato fora da curva
    { n: 2, b: 'fora', t: now, c: 'a' },
    { n: 1, b: 'pico_tarde', t: now - 30 * 24 * 3600 * 1000, c: 'a' }, // velho demais
  ];
  const s = summarize(items, now);
  assert.deepEqual(s.pico_manha, { n: 3, d: 3, m: 3 });   // mediana ignora o outlier
  assert.deepEqual(s.fora, { n: 1, d: 1, m: 2 });
  assert.equal(s.pico_tarde, undefined);
});

test('GET devolve o resumo das chaves pedidas', async () => {
  const db = fakeDb();
  const h = makeHandler(async () => db);
  await post(h, valid({ c: 'aaaaaaaaaaaa-1' }));
  await post(h, valid({ c: 'bbbbbbbbbbbb-2' }));
  const res = await get(h, '09005::110,99999::020');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data['09005::110'].pico_manha.n, 2);
  assert.equal(res.body.data['09005::110'].pico_manha.d, 2);
  assert.deepEqual(res.body.data['99999::020'], {});
  assert.equal((await get(h, 'lixo')).statusCode, 400);
});

test('limita relatos por IP', async () => {
  const h = makeHandler(async () => fakeDb());
  const ip = newIp();
  let last;
  for (let i = 0; i < 45; i++) last = await post(h, valid({ c: `${String(i).padStart(12, '0')}-x` }), ip);
  assert.equal(last.statusCode, 429);
});

test('503 se o Firebase estiver fora', async () => {
  const h = makeHandler(async () => { throw new Error('sem credencial'); });
  assert.equal((await post(h, valid())).statusCode, 503);
});
