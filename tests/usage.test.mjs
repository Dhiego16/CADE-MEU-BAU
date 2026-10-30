import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestFor, normalizeStop, normalizeLine } from '../utils/usage.ts';

const DAY = 24 * 3600 * 1000;
// Terça-feira, 27/out/2026, 07:15 (horário local do ambiente de teste)
const NOW = new Date(2026, 9, 27, 7, 15).getTime();
const at = (daysAgo, h, m = 0) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

test('normaliza ponto e linha', () => {
  assert.equal(normalizeStop('9005'), '09005');
  assert.equal(normalizeStop('09005'), '09005');
  assert.equal(normalizeStop('abc'), null);
  assert.equal(normalizeStop('1234567'), null);
  assert.equal(normalizeLine(' 110 '), '110');
  assert.equal(normalizeLine('<x>'), null);
  assert.equal(normalizeLine(''), null);
});

test('sugere o ponto buscado em dias úteis nesse horário', () => {
  // ter/qua/qui/sex da semana passada, ~7h
  const entries = [7, 6, 5, 4].map(d => ({ s: '09005', l: '110', t: at(d, 7, 10) }));
  const s = suggestFor(entries, NOW);
  assert.deepEqual(s, { stopId: '09005', line: '110', days: 4 });
});

test('não sugere com menos de 2 dias diferentes', () => {
  const sameDay = [{ s: '09005', l: '110', t: at(3, 7, 0) }, { s: '09005', l: '110', t: at(3, 7, 40) }];
  assert.equal(suggestFor(sameDay, NOW), null);
});

test('ignora outro horário e fim de semana', () => {
  const tarde = [5, 4, 3].map(d => ({ s: '09005', l: null, t: at(d, 18, 0) }));
  assert.equal(suggestFor(tarde, NOW), null);                       // 18h está fora da janela de 7h15
  const sabados = [10, 17, 24].map(d => ({ s: '09005', l: null, t: at(d, 7, 15) }));
  const dow = new Date(NOW - 10 * DAY).getDay();
  assert.equal(dow, 6);                                              // 17/10 foi sábado
  assert.equal(suggestFor(sabados, NOW), null);                      // hoje é dia útil
});

test('o hábito recente pesa mais que o antigo', () => {
  const antigo = [42, 41, 35, 28].map(d => ({ s: '11111', l: null, t: at(d, 7, 0) }));
  const recente = [7, 6].map(d => ({ s: '22222', l: null, t: at(d, 7, 0) }));
  assert.equal(suggestFor([...antigo, ...recente], NOW)?.stopId, '22222');
});

test('só sugere a linha se ela dominar as buscas do ponto', () => {
  const dominante = [
    { s: '09005', l: '110', t: at(5, 7) }, { s: '09005', l: '110', t: at(4, 7) },
    { s: '09005', l: null, t: at(3, 7) },
  ];
  assert.equal(suggestFor(dominante, NOW)?.line, '110');
  const dividido = [
    { s: '09005', l: '110', t: at(5, 7) }, { s: '09005', l: '020', t: at(4, 7) },
    { s: '09005', l: null, t: at(3, 7) }, { s: '09005', l: null, t: at(2, 7) },
  ];
  assert.equal(suggestFor(dividido, NOW)?.line, null);
});

test('janela circular em volta da meia-noite', () => {
  const noite = new Date(2026, 9, 27, 23, 50).getTime();
  const entries = [5, 4].map(d => { const x = new Date(noite - d * DAY); x.setHours(0, 20, 0, 0); return { s: '33333', l: null, t: x.getTime() }; });
  assert.equal(suggestFor(entries, noite)?.stopId, '33333');
});
