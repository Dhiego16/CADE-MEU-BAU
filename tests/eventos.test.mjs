import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler, aggregate, dayId } from '../api/eventos.js';
import { fakeDb, fakeInc, fakeRes, newIp } from './helpers.mjs';

const post = (handler, body, ip = newIp()) => {
  const res = fakeRes();
  return handler({ method: 'POST', headers: { 'x-forwarded-for': ip }, body }, res).then(() => res);
};
const get = (handler, query = {}, headers = {}) => {
  const res = fakeRes();
  return handler({ method: 'GET', query, headers }, res).then(() => res);
};

test('aggregate soma eventos válidos e descarta o resto', () => {
  const { counts, valid } = aggregate([
    { e: 'search', p: { line: '110', stop: '9005', src: 'nearby' } },
    { e: 'search', p: { line: '110', stop: '09005', src: 'manual' } },
    { e: 'tab_view', p: { tab: 'map' } },
    { e: 'lotacao_report', p: { line: '020', stop: '31700', nivel: 3 } },
    { e: 'evento_inventado' },                                   // fora da lista
    { e: 'search', p: { line: '<script>', stop: 'abc', src: 'x' } }, // props inválidas: conta o evento, ignora as props
    null, 42,
  ]);
  assert.equal(valid, 5);
  assert.deepEqual(counts.eventos, { search: 3, tab_view: 1, lotacao_report: 1 });
  assert.deepEqual(counts.linhas, { '110': 2, '020': 1 });
  assert.deepEqual(counts.pontos, { '09005': 2, '31700': 1 }); // "9005" vira "09005"
  assert.deepEqual(counts.origens, { nearby: 1, manual: 1 });
  assert.deepEqual(counts.abas, { map: 1 });
  assert.deepEqual(counts.lotacao, { '3': 1 });
});

test('aggregate limita o tamanho do lote', () => {
  const many = Array.from({ length: 100 }, () => ({ e: 'theme_toggle' }));
  assert.equal(aggregate(many).valid, 30);
});

test('dayId usa o horário de Brasília', () => {
  // 01:00 UTC ainda é o dia anterior em Brasília (UTC-3)
  assert.equal(dayId(Date.UTC(2026, 9, 29, 1, 0, 0)), '2026-10-28');
  assert.equal(dayId(Date.UTC(2026, 9, 29, 12, 0, 0)), '2026-10-29');
});

test('POST grava contagens somadas no documento do dia', async () => {
  const db = fakeDb();
  const h = makeHandler(async () => db, async () => fakeInc);
  const ev = [{ e: 'search', p: { line: '110', stop: '09005', src: 'history' } }, { e: 'theme_toggle' }];
  assert.equal((await post(h, { ev })).statusCode, 200);
  assert.equal((await post(h, { ev })).statusCode, 200);
  const doc = db.store.get(`eventos/${dayId()}`);
  assert.equal(doc.eventos.search, 2);
  assert.equal(doc.eventos.theme_toggle, 2);
  assert.equal(doc.linhas['110'], 2);
  assert.equal(doc.pontos['09005'], 2);
});

test('POST sem evento válido dá 400', async () => {
  const h = makeHandler(async () => fakeDb(), async () => fakeInc);
  assert.equal((await post(h, { ev: [{ e: 'x' }] })).statusCode, 400);
  assert.equal((await post(h, 'não é json')).statusCode, 400);
});

test('GET exige a chave e devolve totais e rankings', async () => {
  process.env.EVENTOS_KEY = 'segredo-bem-longo';
  const db = fakeDb();
  const h = makeHandler(async () => db, async () => fakeInc);
  await post(h, { ev: [
    { e: 'search', p: { line: '110', stop: '09005' } },
    { e: 'search', p: { line: '110', stop: '09005' } },
    { e: 'search', p: { line: '020', stop: '31700' } },
  ] });

  assert.equal((await get(h, {})).statusCode, 401);
  assert.equal((await get(h, { key: 'errada' })).statusCode, 401);

  const ok = await get(h, { key: 'segredo-bem-longo', dias: '3' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.totais.search, 3);
  assert.deepEqual(ok.body.topLinhas[0], { nome: '110', total: 2 });
  assert.deepEqual(ok.body.topPontos[0], { nome: '09005', total: 2 });

  const viaHeader = await get(h, {}, { 'x-eventos-key': 'segredo-bem-longo' });
  assert.equal(viaHeader.statusCode, 200);

  delete process.env.EVENTOS_KEY;
  assert.equal((await get(h, { key: 'qualquer' })).statusCode, 503);
});
