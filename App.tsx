import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BusLine } from './types';

interface FavoriteItem {
  stopId: string;
  lineNumber: string;
  destination: string;
  nickname?: string;
}

const REFRESH_INTERVAL = 20;
const SPLASH_DURATION = 2000;
const MAX_HISTORY = 5;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'favs' | 'map'>('search');
  const [isSplash, setIsSplash] = useState(true);
  const [busLines, setBusLines] = useState<BusLine[]>([]);
  const [favoriteBusLines, setFavoriteBusLines] = useState<BusLine[]>([]);
  const [stopId, setStopId] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [removingFavKey, setRemovingFavKey] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSearchingRef = useRef(false);

  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try {
      const saved = localStorage.getItem('cade_meu_bau_app_favs');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Histórico de pontos buscados recentemente
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cade_meu_bau_search_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const baseUrl = 'https://bot-onibus.vercel.app/api/ponto';

  // ─── Splash com duração correta ───────────────────────────────────────────
  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setIsSplash(false);
      if (favorites.length > 0) {
        setActiveTab('favs');
      }
    }, SPLASH_DURATION);
    return () => clearTimeout(splashTimer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Intencionalmente sem `favorites` nas deps: queremos ler apenas o valor inicial

  // ─── Carrega favoritos quando aba de favs abre pela primeira vez ──────────
  const prevTabRef = useRef<string>('');
  useEffect(() => {
    if (activeTab === 'favs' && prevTabRef.current !== 'favs' && favorites.length > 0) {
      loadFavoritesSchedules();
    }
    prevTabRef.current = activeTab;
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalizeTime = (time: unknown): string => {
    if (time === null || time === undefined) return 'SEM PREVISÃO';
    const t = String(time).trim();
    if (!t || /^[-.]+$/.test(t) || t === 'SEM PREVISÃO' || t === '....') {
      return 'SEM PREVISÃO';
    }
    return t.replace(/\s*min(utos?)?/gi, '');
  };

  const performSearch = useCallback(async (sId: string, lFilter: string): Promise<BusLine[]> => {
    if (!sId) return [];
    try {
      let fullUrl = `${baseUrl}?ponto=${sId.trim()}`;
      if (lFilter.trim()) fullUrl += `&linha=${lFilter.trim()}`;

      const res = await fetch(fullUrl);
      if (!res.ok) return [];

      const data = await res.json();

      if (data?.horarios && Array.isArray(data.horarios)) {
        return data.horarios.map((item: Record<string, unknown>, index: number) => {
          const rawLinha = String(item.linha ?? '').trim();
          const formattedLinha = rawLinha.length === 1 ? `NS${rawLinha}` : rawLinha;
          return {
            id: `api-${sId}-${item.linha}-${index}`,
            number: formattedLinha,
            name: formattedLinha,
            origin: '',
            destination: String(item.destino ?? 'Destino não informado'),
            schedules: [],
            frequencyMinutes: 0,
            status: 'Normal' as const,
            nextArrival: normalizeTime(item.proximo ?? item.previsao),
            subsequentArrival: normalizeTime(item.seguinte),
            stopSource: sId,
          };
        });
      }
      return [];
    } catch (err) {
      console.error('Erro na busca:', err);
      return [];
    }
  }, []);

  // ─── Salva histórico ──────────────────────────────────────────────────────
  const addToHistory = useCallback((id: string) => {
    if (!id.trim()) return;
    setSearchHistory(prev => {
      const next = [id, ...prev.filter(h => h !== id)].slice(0, MAX_HISTORY);
      localStorage.setItem('cade_meu_bau_search_history', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSearch = useCallback(async (forcedId?: string, forcedFilter?: string) => {
    const idToSearch = forcedId ?? stopId;
    if (!idToSearch) return;

    // Evita chamadas duplicadas em paralelo
    if (isSearchingRef.current) return;
    isSearchingRef.current = true;

    setIsLoading(true);
    setErrorMsg(null);

    const results = await performSearch(idToSearch, forcedFilter ?? lineFilter);
    setBusLines(results);
    if (results.length === 0) {
      setErrorMsg('Sem Baú na Rua Agora Ou Número do Ponto/Linha Errado!');
    }

    addToHistory(idToSearch);
    setIsLoading(false);
    setCountdown(REFRESH_INTERVAL);
    isSearchingRef.current = false;
  }, [stopId, lineFilter, performSearch, addToHistory]);

  const loadFavoritesSchedules = useCallback(async () => {
    if (favorites.length === 0) return;
    setIsFavoritesLoading(true);
    try {
      const promises = favorites.map(fav => performSearch(fav.stopId, fav.lineNumber));
      const results = await Promise.all(promises);
      setFavoriteBusLines(results.flat());
    } catch (err) {
      console.error('Erro ao carregar favoritos:', err);
    } finally {
      setIsFavoritesLoading(false);
      setCountdown(REFRESH_INTERVAL);
    }
  }, [favorites, performSearch]);

  // ─── Timer centralizado único ─────────────────────────────────────────────
  useEffect(() => {
    const shouldRun =
      (activeTab === 'search' && busLines.length > 0 && !isLoading) ||
      (activeTab === 'favs' && favoriteBusLines.length > 0 && !isFavoritesLoading);

    if (!shouldRun) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (activeTab === 'search') handleSearch();
          else loadFavoritesSchedules();
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeTab, busLines.length, favoriteBusLines.length, isLoading, isFavoritesLoading]);
  // handleSearch e loadFavoritesSchedules são estáveis com useCallback

  // ─── Favoritos ────────────────────────────────────────────────────────────
  const toggleFavorite = useCallback((line: BusLine) => {
    const sId = line.stopSource ?? stopId;
    const key = `${sId}::${line.number}`;
    const isFav = favorites.some(f => f.stopId === sId && f.lineNumber === line.number);

    if (isFav) {
      // Animação de remoção
      setRemovingFavKey(key);
      setTimeout(() => {
        setFavorites(prev => prev.filter(f => !(f.stopId === sId && f.lineNumber === line.number)));
        setFavoriteBusLines(prev => prev.filter(l => !(l.stopSource === sId && l.number === line.number)));
        setRemovingFavKey(null);
      }, 350);
    } else {
      setFavorites(prev => [...prev, { stopId: sId, lineNumber: line.number, destination: line.destination }]);
    }
  }, [favorites, stopId]);

  useEffect(() => {
    localStorage.setItem('cade_meu_bau_app_favs', JSON.stringify(favorites));
  }, [favorites]);

  // ─── Enter no input ───────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ─── Cores de urgência ────────────────────────────────────────────────────
  const getUrgencyColor = (timeStr: string) => {
    if (!timeStr || timeStr === 'SEM PREVISÃO') return 'bg-slate-800 text-slate-500';
    const clean = timeStr.toLowerCase();
    if (clean.includes('agora')) return 'bg-red-600 text-white';
    if (clean.includes('aprox')) return 'bg-blue-500 text-white';
    const mins = parseInt(timeStr.replace(/\D/g, '')) || 0;
    if (mins <= 3) return 'bg-red-600 text-white';
    if (mins <= 8) return 'bg-yellow-500 text-black';
    return 'bg-emerald-500 text-white';
  };

  const renderTimeDisplay = (timeStr: string, isNext: boolean) => {
    const isNoPrev = timeStr === 'SEM PREVISÃO';
    const urgencyClasses = getUrgencyColor(timeStr);
    const isApprox = timeStr.toLowerCase().includes('aprox');

    if (isNoPrev) {
      return (
        <div className={`px-2 py-3 rounded-2xl ${urgencyClasses} font-black uppercase tracking-tighter w-full text-center text-[9px] opacity-40`}>
          {timeStr}
        </div>
      );
    }

    return (
      <div className={`flex flex-col items-center justify-center w-full rounded-2xl py-2 ${urgencyClasses} ${!isNext ? 'opacity-90' : ''}`}>
        <span className={`font-black leading-none tracking-tighter ${isNext ? 'text-2xl' : 'text-xl'}`}>
          {timeStr}
        </span>
        <span className="text-[7px] font-black uppercase tracking-widest mt-0.5 opacity-80">
          MINUTO(S)
        </span>
        {isApprox && (
          <span className="text-[6px] font-black uppercase tracking-widest mt-1 opacity-80 text-center">
            IMPOSSÍVEL RASTREAR O BAÚ AGORA, MOSTRANDO TEMPO ESPECULADO!
          </span>
        )}
      </div>
    );
  };

  // ─── Card de ônibus ───────────────────────────────────────────────────────
  const BusLineCard = ({
    line,
    showFavoriteButton = true,
    isRemoving = false,
  }: {
    line: BusLine;
    showFavoriteButton?: boolean;
    isRemoving?: boolean;
  }) => {
    const sId = line.stopSource ?? stopId;
    const isFav = favorites.some(f => f.stopId === sId && f.lineNumber === line.number);

    return (
      <div
        className="bg-slate-900 border border-white/10 p-5 rounded-[2.5rem] flex flex-col gap-4 shadow-xl active:scale-[0.98] transition-all duration-300"
        style={{
          opacity: isRemoving ? 0 : 1,
          transform: isRemoving ? 'scale(0.92) translateY(-8px)' : undefined,
          transition: 'opacity 0.35s ease, transform 0.35s ease',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="text-4xl font-black text-yellow-400 italic w-24 shrink-0 text-center leading-none tracking-tighter drop-shadow-[0_2px_10px_rgba(251,191,36,0.2)]">
              {line.number}
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="mb-1 pr-2 min-w-0 flex flex-col">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">INDO PARA:</span>
                <span className="font-black text-[13px] uppercase text-white leading-tight break-words">
                  {line.destination}
                </span>
              </div>
              {/* Mostra o ponto de origem no card para identificação nos favoritos */}
              {line.stopSource && (
                <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1">
                  📍 PONTO {line.stopSource}
                </div>
              )}
              <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${line.nextArrival?.toLowerCase().includes('aprox') ? 'bg-red-500' : 'bg-emerald-500'}`} />
                {line.nextArrival?.toLowerCase().includes('aprox') ? 'Offline' : 'Online agora'}
              </div>
            </div>
          </div>
          {showFavoriteButton && (
            <button
              onClick={e => { e.stopPropagation(); toggleFavorite(line); }}
              className={`text-3xl transition-all duration-200 active:scale-150 p-2 ${isFav ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-slate-800'}`}
              aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              {isFav ? '★' : '☆'}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1 bg-black/60 rounded-[1.5rem] p-4 border border-white/5 flex flex-col items-center justify-center min-h-[95px]">
            <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Chega em:</span>
            {renderTimeDisplay(line.nextArrival ?? 'SEM PREVISÃO', true)}
          </div>
          <div className="flex-1 bg-black/30 rounded-[1.5rem] p-4 border border-white/5 flex flex-col items-center justify-center min-h-[95px] opacity-90">
            <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Próximo em:</span>
            {renderTimeDisplay(line.subsequentArrival ?? 'SEM PREVISÃO', false)}
          </div>
        </div>
      </div>
    );
  };

  // ─── Splash ───────────────────────────────────────────────────────────────
  if (isSplash) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-10 overflow-hidden text-center">
        <div className="relative mb-8 flex flex-col items-center scale-110">
          <div className="w-40 h-40 bg-yellow-400 rounded-[3rem] flex items-center justify-center shadow-[0_0_50px_rgba(251,191,36,0.4)] mb-8 transform rotate-[-5deg] overflow-hidden">
            <img
              src="/logo.png"
              alt="Cadê meu Baú"
              className="w-32 h-32 object-contain"
              onError={e => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = '<span class="text-8xl">🚍</span>';
              }}
            />
          </div>
          <div className="bg-yellow-400 text-black px-6 py-2 font-black italic text-2xl skew-x-[-12deg] shadow-[8px_8px_0px_rgba(251,191,36,0.3)] uppercase tracking-tighter">
            Cadê meu Baú?
          </div>
        </div>
        <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full bg-yellow-400 w-1/2 animate-[loading_1.5s_infinite_linear]" />
        </div>
        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.5em] text-slate-500 animate-pulse">
          Rastreando Linhas...
        </p>
        <style>{`@keyframes loading { from { left: -50%; } to { left: 100%; } }`}</style>
      </div>
    );
  }

  // ─── App ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col relative overflow-hidden">

      <header className="pt-[env(safe-area-inset-top)] bg-slate-900/90 border-b border-white/10 p-4 flex justify-between items-center shrink-0 z-50">
        <div className="font-black italic text-yellow-400 text-xl tracking-tighter skew-x-[-10deg]">
          CADÊ MEU BAÚ?
        </div>
        <div className="flex items-center gap-3">
          {((activeTab === 'search' && busLines.length > 0 && !isLoading) ||
            (activeTab === 'favs' && favoriteBusLines.length > 0 && !isFavoritesLoading)) && (
            <div className="text-right flex flex-col items-end">
              <span className="text-[7px] font-black text-slate-500 uppercase leading-none mb-0.5">Auto-Refresh</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-black text-yellow-400 tabular-nums leading-none">{countdown}s</span>
              </div>
            </div>
          )}
          {(isLoading || isFavoritesLoading) && (
            <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </header>

      <div className="flex-grow overflow-y-auto app-container px-4 pt-4 pb-32 space-y-5">

        {/* ── ABA BUSCA ── */}
        {activeTab === 'search' && (
          <div className="page-enter space-y-5">
            <div className="bg-slate-900 p-5 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-4">
              <div className="flex gap-2">
                <div className="flex-[3] relative">
                  <span className="absolute left-4 top-2 text-[8px] font-black text-slate-500 uppercase pointer-events-none">
                    Número do Ponto
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ex: 31700"
                    value={stopId}
                    onChange={e => setStopId(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-black border border-white/10 rounded-2xl px-4 pt-6 pb-3 font-black text-yellow-400 outline-none focus:border-yellow-400 transition-all placeholder:text-slate-800 text-xl"
                  />
                </div>
                <div className="flex-[2] relative">
                  <span className="absolute left-0 top-2 text-[8px] font-black text-slate-500 uppercase text-center w-full pointer-events-none">
                    Num. Onibus (OPCIONAL)
                  </span>
                  <input
                    type="text"
                    placeholder="Ex: 327"
                    value={lineFilter}
                    onChange={e => setLineFilter(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-black border border-white/10 rounded-2xl px-4 pt-6 pb-3 font-black text-white outline-none focus:border-yellow-400 transition-all placeholder:text-slate-800 text-xl text-center"
                  />
                </div>
              </div>
              <button
                onClick={() => handleSearch()}
                disabled={isLoading}
                className="w-full bg-yellow-400 text-black py-5 rounded-2xl font-black btn-active uppercase text-sm tracking-[0.2em] shadow-[0_10px_30px_rgba(251,191,36,0.3)] disabled:opacity-50 transition-all"
              >
                {isLoading ? 'Rastreando...' : 'Localizar Baú'}
              </button>

              {/* Histórico de buscas recentes */}
              {searchHistory.length > 0 && busLines.length === 0 && !isLoading && (
                <div>
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2 px-1">
                    Buscas Recentes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.map(h => (
                      <button
                        key={h}
                        onClick={() => { setStopId(h); handleSearch(h); }}
                        className="bg-slate-800 border border-white/10 text-yellow-400 text-xs font-black px-3 py-2 rounded-xl active:scale-95 transition-transform tracking-wider"
                      >
                        📍 {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl text-center text-red-500 font-bold text-[10px] uppercase tracking-widest animate-pulse">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              {busLines.map(line => (
                <BusLineCard key={line.id} line={line} />
              ))}
              {busLines.length === 0 && !isLoading && (
                <div className="py-20 text-center opacity-10 flex flex-col items-center">
                  <div className="text-9xl mb-6">🚍</div>
                  <p className="font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed text-slate-500">
                    Aguardando número do ponto...
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA FAVORITOS ── */}
        {activeTab === 'favs' && (
          <div className="page-enter space-y-4">
            <div className="flex items-center justify-between px-2 mb-4">
              <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 flex items-center gap-2">
                <span className="text-yellow-400 text-lg">★</span> Minha Garagem
              </h2>
              {favorites.length > 0 && !isFavoritesLoading && (
                <button
                  onClick={loadFavoritesSchedules}
                  className="text-[8px] font-black uppercase tracking-widest text-slate-500 border border-white/10 px-3 py-2 rounded-xl active:scale-95 transition-transform"
                >
                  🔄 Atualizar
                </button>
              )}
            </div>

            {isFavoritesLoading && favorites.length > 0 && (
              <div className="py-10 text-center">
                <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Rastreando seus baús...
                </p>
              </div>
            )}

            {!isFavoritesLoading && favoriteBusLines.map(line => {
              const key = `${line.stopSource ?? stopId}::${line.number}`;
              return (
                <BusLineCard
                  key={line.id}
                  line={line}
                  isRemoving={removingFavKey === key}
                />
              );
            })}

            {favorites.length === 0 && (
              <div className="py-28 text-center opacity-20 px-10">
                <p className="font-black text-[12px] uppercase tracking-[0.3em] mb-4">Garagem Vazia</p>
                <p className="text-[10px] leading-relaxed uppercase tracking-widest font-bold">
                  Toque na estrela de uma linha para que ela apareça aqui.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── ABA MAPA ── */}
        {activeTab === 'map' && (
          <div className="page-enter flex flex-col items-center justify-center py-32 text-center px-10">
            <div className="text-8xl mb-10 drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]">📍</div>
            <h3 className="font-black text-2xl mb-4 text-yellow-400 italic skew-x-[-10deg] uppercase tracking-tighter">
              Radar em Obras
            </h3>
            <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-[0.3em] font-black">
              Estamos preparando a visão em mapa para você ver o baú dobrando a esquina em tempo real.
            </p>
          </div>
        )}

      </div>

      {/* ── NAVEGAÇÃO ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 px-10 pb-12 pt-5 flex justify-between items-center shadow-[0_-20px_60px_rgba(0,0,0,1)] z-50">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === 'search' ? 'text-yellow-400 scale-125' : 'text-slate-600'}`}
        >
          <div className="text-2xl leading-none">{activeTab === 'search' ? '🔍' : '🔎'}</div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Busca</span>
        </button>
        <button
          onClick={() => setActiveTab('favs')}
          className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === 'favs' ? 'text-yellow-400 scale-125' : 'text-slate-600'}`}
        >
          <div className="text-2xl leading-none">{activeTab === 'favs' ? '★' : '☆'}</div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Salvos</span>
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === 'map' ? 'text-yellow-400 scale-125' : 'text-slate-600'}`}
        >
          <div className="text-2xl leading-none">📍</div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Mapa</span>
        </button>
      </nav>

    </div>
  );
};

export default App;
