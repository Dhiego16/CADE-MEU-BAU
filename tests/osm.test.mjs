import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOsmPontos, codigoDoPonto, tileCenter, dentroDaRegiao, buildQuery, limparNome } from '../api/_osmPontos.js';
import handler, { consultarOverpass } from '../api/pontos-osm.js';
import { fakeRes } from './helpers.mjs';

const node = (id, lat, lon, tags) => ({ type: 'node', id, lat, lon, tags });
const OSM = {
  elements: [
    node(1, -16.68, -49.25, { highway: 'bus_stop', name: 'Av. Goiás', ref: '5946' }),
    node(2, -16.69, -49.26, { highway: 'bus_stop', name: 'Praça Cívica', 'ref:rmtc': '07662', ref: '123456' }),
    node(3, -16.70, -49.27, { highway: 'bus_stop', name: 'Sem código' }),
    node(4, -16.71, -49.28, { highway: 'bus_stop', ref: 'A12' }),
    node(5, -16.68, -49.25, { highway: 'bus_stop', name: 'Duplicado', ref: '05946' }),
    node(6, -10.0, -49.25, { highway: 'bus_stop', ref: '11111' }),            // fora da região
    node(7, -16.72, -49.29, { highway: 'bus_stop', name: '<img src=x onerror=alert(1)>', ref: '22222' }),
    { type: 'way', id: 8, tags: { ref: '33333' } },                           // não é nó
  ],
};

test('código vem de ref:rmtc/ref/local_ref e só aceita 4–5 dígitos', () => {
  assert.equal(codigoDoPonto({ ref: '5946' }), '05946');
  assert.equal(codigoDoPonto({ 'ref:rmtc': '07662', ref: '99999' }), '07662');
  assert.equal(codigoDoPonto({ local_ref: '12345' }), '12345');
  assert.equal(codigoDoPonto({ ref: '123456' }), null);
  assert.equal(codigoDoPonto({ ref: 'A12' }), null);
  assert.equal(codigoDoPonto({ ref: '05946;05947' }), null);
  assert.equal(codigoDoPonto(undefined), null);
});

test('parse: só pontos com código, sem duplicata, dentro da região', () => {
  const r = parseOsmPontos(OSM);
  assert.deepEqual(r.stops.map(s => s.id), ['05946', '07662', '22222']);
  assert.equal(r.total, 7);            // nós lidos (a "way" não conta)
  assert.equal(r.comCodigo, 3);
  assert.equal(r.stops[0].nome, 'Av. Goiás (05946)');
  assert.equal(r.semCodigo.length, 2); // nós 3 e 4 (o nó 6 tem código, mas está fora da região)
});

test('nome é higienizado (nada de HTML) e ponto sem nome vira "Ponto NNNNN"', () => {
  const r = parseOsmPontos(OSM);
  const xss = r.stops.find(s => s.id === '22222');
  assert.ok(!/[<>"'&]/.test(xss.nome));
  assert.equal(limparNome('  A   "B"  <c> '), 'A B c');
  const semNome = parseOsmPontos({ elements: [node(9, -16.7, -49.2, { ref: '44444' })] });
  assert.equal(semNome.stops[0].nome, 'Ponto 44444');
});

test('entrada inválida não quebra', () => {
  assert.deepEqual(parseOsmPontos(null).stops, []);
  assert.deepEqual(parseOsmPontos({ elements: 'x' }).stops, []);
  assert.deepEqual(parseOsmPontos({ elements: [null, {}, node(1, NaN, 1, { ref: '12345' })] }).stops, []);
});

test('região e quadras: Goiânia dentro, resto do Brasil fora, centro estável', () => {
  assert.equal(dentroDaRegiao(-16.68, -49.25), true);
  assert.equal(dentroDaRegiao(-23.55, -46.63), false);
  assert.equal(dentroDaRegiao(NaN, -49), false);
  assert.deepEqual(tileCenter(-16.6801, -49.2499), tileCenter(-16.6850, -49.2450)); // mesma quadra
  assert.notDeepEqual(tileCenter(-16.68, -49.24), tileCenter(-16.68, -49.30)); // quadras diferentes
  assert.match(buildQuery(-16.68, -49.26), /around:3500,-16.68,-49.26/);
});

const okFetch = (json) => async () => ({ ok: true, json: async () => json });

test('consultarOverpass usa o espelho que responder e faz o parse', async () => {
  let calls = 0;
  const f = async (url, init) => {
    calls += 1;
    assert.equal(init.method, 'POST');
    assert.match(init.body, /data=/);
    if (url.includes('kumi')) throw new Error('espelho fora');
    return { ok: true, json: async () => OSM };
  };
  const r = await consultarOverpass(-16.68, -49.26, f);
  assert.equal(r.comCodigo, 3);
  assert.equal(calls, 2);
});

test('consultarOverpass falha quando todos os espelhos falham ou vêm com "remark" vazio', async () => {
  await assert.rejects(consultarOverpass(-16.68, -49.26, async () => ({ ok: false, status: 504, json: async () => ({}) })));
  await assert.rejects(consultarOverpass(-16.68, -49.26, okFetch({ elements: [], remark: 'runtime error: timeout' })));
});

test('handler: valida método e região antes de qualquer rede', async () => {
  let r = fakeRes();
  await handler({ method: 'POST', query: {} }, r);
  assert.equal(r.statusCode, 405);
  r = fakeRes();
  await handler({ method: 'GET', query: { lat: '-23.5', lng: '-46.6' } }, r);
  assert.equal(r.statusCode, 400);
  r = fakeRes();
  await handler({ method: 'GET', query: {} }, r);
  assert.equal(r.statusCode, 400);
});
