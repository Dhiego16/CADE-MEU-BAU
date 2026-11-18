import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLastResult, loadLastResult, lastResultKey, MAX_AGE_MS } from '../utils/lastResult.ts';

const memStore = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
};
const line = (n) => ({ id: `x-${n}`, number: n, name: n, origin: '', destination: 'D', schedules: [], frequencyMinutes: 0, status: 'Normal', nextArrival: '5 MIN' });
const T0 = 1_800_000_000_000;

test('chave normaliza o ponto com 5 dígitos', () => {
  assert.equal(lastResultKey('9005', ' 110 '), '09005|110');
});

test('salva e recupera o último resultado', () => {
  const s = memStore();
  saveLastResult('9005', '', [line('110')], T0, s);
  const hit = loadLastResult('09005', '', T0 + 5 * 60_000, s);
  assert.equal(hit.t, T0);
  assert.equal(hit.lines[0].number, '110');
});

test('descarta resultado com mais de 1 hora', () => {
  const s = memStore();
  saveLastResult('9005', '', [line('110')], T0, s);
  assert.equal(loadLastResult('9005', '', T0 + MAX_AGE_MS + 1, s), null);
});

test('consultas diferentes (com/sem filtro de linha) não se misturam', () => {
  const s = memStore();
  saveLastResult('9005', '110', [line('110')], T0, s);
  assert.equal(loadLastResult('9005', '', T0, s), null);
});

test('não salva lista vazia e tolera storage corrompido', () => {
  const s = memStore();
  saveLastResult('9005', '', [], T0, s);
  assert.equal(loadLastResult('9005', '', T0, s), null);
  s.setItem('cade_meu_bau_last_results', '{lixo');
  assert.equal(loadLastResult('9005', '', T0, s), null);
  saveLastResult('9005', '', [line('110')], T0, s); // recupera sozinho
  assert.ok(loadLastResult('9005', '', T0, s));
});

test('mantém no máximo 30 consultas, descartando as mais antigas', () => {
  const s = memStore();
  for (let i = 0; i < 35; i++) saveLastResult(String(10000 + i), '', [line('1')], T0 + i, s);
  assert.equal(loadLastResult('10000', '', T0 + 100, s), null);
  assert.ok(loadLastResult('10034', '', T0 + 100, s));
});
