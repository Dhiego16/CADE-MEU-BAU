import * as cheerio from 'cheerio';

// Parser do HTML de horários da RMTC (view "pedhorarios").
// Fica fora de api/ponto.js pra poder ser testado sem rede (arquivos com "_" não viram rota na Vercel).

/** O HTML tem a tabela que o parser conhece? Se não, o layout da RMTC provavelmente mudou. */
export function layoutReconhecido(html) {
  return typeof html === 'string' && html.includes('horariosRmtc');
}

export function parseHorarios(html, linhaDesejada) {
  const $ = cheerio.load(html);
  const horarios = [];

  $('table.horariosRmtc tr.linha').each((i, el) => {
    const tds = $(el).find('td');
    if (tds.length < 4) return;

    const linha    = $(tds[0]).text().replace(/\D/g, '');
    const destino  = $(tds[1]).text().trim();
    const proximo  = $(tds[2]).text().replace(/\s+/g, ' ').trim();
    const seguinte = $(tds[3]).text().trim();

    if (!linha) return;
    if (linhaDesejada && linha !== linhaDesejada) return;

    horarios.push({ linha, destino, proximo, seguinte });
  });

  return horarios;
}
