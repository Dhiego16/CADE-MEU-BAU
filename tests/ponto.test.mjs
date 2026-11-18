import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHorarios, layoutReconhecido } from '../api/_parseHorarios.js';

// HTML mínimo no formato que a RMTC devolve hoje (tabela.horariosRmtc > tr.linha > 4 colunas).
// Se a RMTC mudar o layout e este teste continuar passando, atualize a fixture com um HTML real.
const HTML = `
<table class="horariosRmtc">
  <tr class="cabecalho"><th>Linha</th><th>Destino</th><th>Próximo</th><th>Seguinte</th></tr>
  <tr class="linha"><td> 110 </td><td>TERMINAL CANEDO</td><td>  5   MIN </td><td>18 MIN</td></tr>
  <tr class="linha"><td>020</td><td>CENTRO</td><td>SEM PREVISÃO</td><td>--</td></tr>
  <tr class="linha"><td>7</td><td>NS7 - JD CALIFORNIA</td><td>AGORA</td><td>12 MIN</td></tr>
  <tr class="linha"><td>999</td><td>QUEBRADA</td></tr>
  <tr class="linha"><td></td><td>SEM NUMERO</td><td>1 MIN</td><td>2 MIN</td></tr>
</table>`;

test('extrai linha, destino, próximo e seguinte normalizando espaços', () => {
  const r = parseHorarios(HTML);
  assert.deepEqual(r[0], { linha: '110', destino: 'TERMINAL CANEDO', proximo: '5 MIN', seguinte: '18 MIN' });
  assert.deepEqual(r[1], { linha: '020', destino: 'CENTRO', proximo: 'SEM PREVISÃO', seguinte: '--' });
  assert.equal(r[2].linha, '7');
});

test('ignora linhas incompletas ou sem número', () => {
  const r = parseHorarios(HTML);
  assert.equal(r.length, 3);
  assert.ok(!r.some(x => x.linha === '999'));
});

test('filtra por linha desejada', () => {
  const r = parseHorarios(HTML, '020');
  assert.equal(r.length, 1);
  assert.equal(r[0].destino, 'CENTRO');
  assert.deepEqual(parseHorarios(HTML, '555'), []);
});

test('detecta quando o layout é reconhecido ou não', () => {
  assert.equal(layoutReconhecido(HTML), true);
  assert.equal(layoutReconhecido('<div class="novo-layout"><p>Sem tabela</p></div>'), false);
  assert.equal(layoutReconhecido(''), false);
  assert.equal(layoutReconhecido(undefined), false);
});

test('HTML vazio ou de outro layout não quebra e devolve lista vazia', () => {
  assert.deepEqual(parseHorarios(''), []);
  assert.deepEqual(parseHorarios('<html><body>Manutenção</body></html>'), []);
});
