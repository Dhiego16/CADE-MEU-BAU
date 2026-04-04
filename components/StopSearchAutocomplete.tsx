import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ThemeTokens } from '../types';
import PONTOS_DATA from '../pontos.json';

interface PontoData {
  id: string;
  lat: number;
  lng: number;
  nome: string;
}

interface StopSearchAutocompleteProps {
  theme: ThemeTokens;
  lightTheme: boolean;
  onSelectStop: (stopId: string) => void;
  placeholder?: string;
}

const PONTOS = PONTOS_DATA as PontoData[];

const normalize = (s: string) =>
  s.toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .trim();

const searchPontos = (query: string): PontoData[] => {
  if (!query || query.length < 2) return [];
  const norm = normalize(query);
  const tokens = norm.split(/\s+/).filter(Boolean);

  const seen = new Set<string>();
  const results: Array<{ ponto: PontoData; score: number }> = [];

  for (const ponto of PONTOS) {
    if (seen.has(ponto.id)) continue;
    seen.add(ponto.id);

    const nomeNorm = normalize(ponto.nome);
    const idMatch = ponto.id.includes(query.replace(/\D/g, ''));
    const allTokensMatch = tokens.every(t => nomeNorm.includes(t));
    const startsWithMatch = nomeNorm.startsWith(norm);

    if (!allTokensMatch && !idMatch) continue;

    let score = 0;
    if (startsWithMatch) score += 10;
    if (allTokensMatch) score += 5;
    if (idMatch) score += 3;
    score -= nomeNorm.length * 0.01;

    results.push({ ponto, score });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(r => r.ponto);
};

const highlight = (text: string, query: string): React.ReactNode => {
  const norm = normalize(query);
  const normText = normalize(text);
  const idx = normText.indexOf(norm);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(251,191,36,0.35)', color: 'inherit', borderRadius: 2 }}>
        {text.slice(idx, idx + norm.length)}
      </mark>
      {text.slice(idx + norm.length)}
    </>
  );
};

const StopSearchAutocomplete: React.FC<StopSearchAutocompleteProps> = ({
  theme, lightTheme, onSelectStop, placeholder = 'Buscar por nome da rua ou bairro...'
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PontoData[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    const found = searchPontos(val);
    setResults(found);
    setOpen(found.length > 0 && val.length >= 2);
  }, []);

  const handleSelect = useCallback((ponto: PontoData) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelectStop(ponto.id);
  }, [onSelectStop]);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (listRef.current?.contains(e.relatedTarget as Node)) return;
    setTimeout(() => { setOpen(false); setFocused(false); }, 150);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const borderColor = focused
    ? 'border-yellow-400'
    : (lightTheme ? 'border-gray-300' : 'border-white/10');

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        className={`flex items-center gap-2 ${theme.input} border ${borderColor} rounded-2xl px-4 py-3 transition-all`}
        style={{ borderRadius: 16 }}
      >
        <img
          src="/buscar.png"
          alt=""
          style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.5, flexShrink: 0 }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none font-bold text-sm placeholder:text-slate-600"
          style={{ minWidth: 0 }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button
            onMouseDown={e => { e.preventDefault(); setQuery(''); setResults([]); setOpen(false); }}
            className="text-slate-500 text-lg leading-none"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          ref={listRef}
          className={`${theme.card} border shadow-2xl`}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            borderRadius: 16,
            overflow: 'hidden',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          <div
            className={`px-4 py-2 border-b ${lightTheme ? 'border-gray-100' : 'border-white/5'}`}
          >
            <span className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>
              {results.length} ponto{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
            </span>
          </div>
          {results.map((ponto, i) => (
            <button
              key={ponto.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(ponto); }}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-all active:scale-[0.98]
                ${i > 0 ? `border-t ${lightTheme ? 'border-gray-50' : 'border-white/5'}` : ''}
                ${lightTheme ? 'hover:bg-gray-50' : 'hover:bg-white/5'}
              `}
            >
              <div
                className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)' }}
              >
                <img src="/ponto.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`font-black text-[12px] uppercase truncate ${theme.destText}`}>
                  {query.length >= 2 ? highlight(ponto.nome.replace(/\s*\(\d+\)$/, ''), query) : ponto.nome.replace(/\s*\(\d+\)$/, '')}
                </p>
                <p className={`text-[9px] font-bold ${theme.subtext} mt-0.5`}>
                  Ponto nº {ponto.id}
                </p>
              </div>
              <span className="text-yellow-400 font-black text-lg shrink-0">›</span>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && (
        <div
          className={`${theme.card} border shadow-2xl`}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 9999, borderRadius: 16 }}
        >
          <div className="px-4 py-4 text-center">
            <p className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext} opacity-50`}>
              Nenhum ponto encontrado para "{query}"
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default StopSearchAutocomplete;
