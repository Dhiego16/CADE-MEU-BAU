import React, { memo, useEffect, useState } from 'react';
import { BusLine, ThemeTokens } from '../types';
import { Suggestion } from '../utils/usage';

interface SuggestionCardProps {
  suggestion: Suggestion;
  stopName: string;
  theme: ThemeTokens;
  fetchPreview: (stopId: string, line: string) => Promise<{ lines: BusLine[]; error?: string | null }>;
  onOpen: () => void;
}

// Previsão da sugestão: guarda 1 min pra não repetir a consulta ao reabrir a aba
const previewCache = new Map<string, { ts: number; text: string | null }>();
const PREVIEW_TTL_MS = 60_000;

const etaText = (t?: string): string | null => {
  if (!t) return null;
  const s = t.toLowerCase();
  if (s.includes('agora')) return 'agora';
  if (s.includes('sem prev')) return null;
  const m = s.match(/\d+/);
  return m ? `${m[0]} min` : null;
};

const minutesOf = (t?: string): number => {
  const s = (t ?? '').toLowerCase();
  if (s.includes('agora')) return 0;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 9999;
};

const SuggestionCard = memo(({ suggestion, stopName, theme, fetchPreview, onOpen }: SuggestionCardProps) => {
  const cacheKey = `${suggestion.stopId}::${suggestion.line ?? ''}`;
  const [eta, setEta] = useState<string | null>(() => previewCache.get(cacheKey)?.text ?? null);

  useEffect(() => {
    const cached = previewCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PREVIEW_TTL_MS) { setEta(cached.text); return; }
    let cancelled = false;
    fetchPreview(suggestion.stopId, suggestion.line ?? '')
      .then(({ lines }) => {
        if (cancelled) return;
        const pool = suggestion.line ? lines.filter(l => l.number === suggestion.line) : lines;
        const best = pool.reduce<BusLine | null>(
          (acc, l) => (!acc || minutesOf(l.nextArrival) < minutesOf(acc.nextArrival) ? l : acc), null,
        );
        const text = best ? etaText(best.nextArrival) : null;
        previewCache.set(cacheKey, { ts: Date.now(), text });
        setEta(text);
      })
      .catch(() => { /* sem previsão: o cartão continua útil como atalho */ });
    return () => { cancelled = true; };
  }, [cacheKey]); // eslint-disable-line

  const name = stopName.replace(/\s*\(\d+\)$/, '');

  return (
    <button
      onClick={onOpen}
      className={`${theme.card} border border-yellow-400/40 rounded-[2rem] p-4 w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform`}
      style={{ animation: 'staggerIn 0.3s ease-out both' }}
    >
      <div className="shrink-0 w-11 h-11 rounded-2xl bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center text-xl">
        🕒
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-yellow-400 mb-0.5">Sugestão pra agora</p>
        <p className={`font-black text-[13px] truncate ${theme.destText}`}>
          Ponto {suggestion.stopId}{name ? ` · ${name}` : ''}
        </p>
        <p className={`text-[9px] font-bold uppercase tracking-widest ${theme.subtext} mt-0.5`}>
          {suggestion.line ? `Linha ${suggestion.line} · ` : ''}você costuma buscar nesse horário
        </p>
      </div>
      <div className="shrink-0 text-right">
        {eta ? (
          <>
            <p className="font-black text-lg text-yellow-400 leading-none">{eta === 'agora' ? 'AGORA' : eta}</p>
            <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} mt-1`}>próximo</p>
          </>
        ) : (
          <span className="text-yellow-400 font-black text-lg">›</span>
        )}
      </div>
    </button>
  );
});

export default SuggestionCard;
