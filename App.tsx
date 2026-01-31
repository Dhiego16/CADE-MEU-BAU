
import React, { useState, useEffect, useCallback } from 'react';
import { BusLine } from './types';

interface FavoriteItem {
  stopId: string;
  lineNumber: string;
  nickname?: string;
}

const REFRESH_INTERVAL = 25; // segundos

const App: React.FC = () => {
  const [busLines, setBusLines] = useState<BusLine[]>([]);
  const [stopId, setStopId] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [searchMode, setSearchMode] = useState<'favorites' | 'manual'>('favorites');
  
  const [namingFavorite, setNamingFavorite] = useState<{line: BusLine, stopId: string} | null>(null);
  const [tempNickname, setTempNickname] = useState('');

  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    const saved = localStorage.getItem('cade_meu_bau_favs_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const baseUrl = 'https://bot-onibus.vercel.app/api/ponto';

  const performSearch = useCallback(async (sId: string, lFilter: string): Promise<BusLine[]> => {
    try {
      let fullUrl = `${baseUrl}?ponto=${sId.trim()}`;
      if (lFilter.trim()) {
        fullUrl += `&linha=${lFilter.trim()}`;
      }
      
      const res = await fetch(fullUrl);
      if (!res.ok) return [];
      
      const data = await res.json();
      if (data && data.horarios && Array.isArray(data.horarios)) {
        return data.horarios.map((item: any, index: number) => ({
          id: `api-${sId}-${item.linha}-${index}`,
          number: item.linha,
          name: item.linha,
          origin: '',
          destination: item.destino,
          schedules: [],
          frequencyMinutes: 0,
          status: 'Normal',
          nextArrival: item.proximo,
          subsequentArrival: item.seguinte,
          stopSource: sId
        }));
      }
      return [];
    } catch (err) {
      console.error("Erro na busca:", err);
      return [];
    }
  }, []);

  const fetchAllFavorites = useCallback(async (silent = false) => {
    if (favorites.length === 0) {
      setBusLines([]);
      return;
    }
    if (!silent) setIsLoading(true);
    setErrorMsg(null);
    const results = await Promise.all(
      favorites.map(fav => performSearch(fav.stopId, fav.lineNumber))
    );
    const flatResults = results.flat();
    setBusLines(flatResults);
    setIsLoading(false);
    setCountdown(REFRESH_INTERVAL);
  }, [favorites, performSearch]);

  useEffect(() => {
    if (favorites.length > 0) {
      setSearchMode('favorites');
      fetchAllFavorites();
    }
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNamingFavorite(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (busLines.length === 0) {
      setCountdown(REFRESH_INTERVAL);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (searchMode === 'favorites') {
            fetchAllFavorites(true);
          } else if (stopId) {
            performSearch(stopId, lineFilter).then(results => {
              if (results.length > 0) setBusLines(results);
            });
          }
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [busLines.length, searchMode, stopId, lineFilter, fetchAllFavorites, performSearch]);

  useEffect(() => {
    localStorage.setItem('cade_meu_bau_favs_v2', JSON.stringify(favorites));
  }, [favorites]);

  const handleManualSearch = async (forcedId?: string) => {
    const idToSearch = forcedId || stopId;
    if (!idToSearch) {
      setErrorMsg("Digite o número do ponto.");
      return;
    }
    setSearchMode('manual');
    setIsLoading(true);
    setErrorMsg(null);
    const results = await performSearch(idToSearch, lineFilter);
    setBusLines(results);
    if (results.length === 0) {
      setErrorMsg("Nenhum baú encontrado para este ponto.");
    }
    setIsLoading(false);
    setCountdown(REFRESH_INTERVAL);
  };

  const openNamingModal = (line: BusLine, currentStop: string) => {
    const isFav = favorites.some(f => f.stopId === currentStop && f.lineNumber === line.number);
    if (isFav) {
      setFavorites(prev => prev.filter(f => !(f.stopId === currentStop && f.lineNumber === line.number)));
    } else {
      setNamingFavorite({ line, stopId: currentStop });
      setTempNickname('');
    }
  };

  const confirmFavorite = () => {
    if (namingFavorite) {
      setFavorites(prev => [...prev, { 
        stopId: namingFavorite.stopId, 
        lineNumber: namingFavorite.line.number, 
        nickname: tempNickname.trim() 
      }]);
      setNamingFavorite(null);
    }
  };

  const getUrgency = (timeStr: string) => {
    if (!timeStr || timeStr.toLowerCase().includes('aprox')) {
       return { label: 'NA ESQUINA', color: 'bg-red-600', text: 'text-white', pulse: true };
    }
    const mins = parseInt(timeStr.replace(/\D/g, '')) || 0;
    if (mins <= 3) return { label: 'CORRE!', color: 'bg-red-600', text: 'text-white', pulse: true };
    if (mins <= 8) return { label: 'DÁ PRA IR', color: 'bg-yellow-400', text: 'text-black', pulse: false };
    return { label: 'RELAXA', color: 'bg-emerald-500', text: 'text-white', pulse: false };
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-yellow-400 selection:text-black pb-20 overflow-x-hidden">
      {/* Modal Customizado de Favoritos */}
      {namingFavorite && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setNamingFavorite(null)}
        >
          <div 
            className="bg-slate-900 border-4 border-yellow-400 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] max-w-md w-full shadow-[0_0_80px_rgba(251,191,36,0.4)] animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4 md:mb-6">
               <div className="bg-yellow-400 p-3 md:p-4 rounded-2xl rotate-3 shadow-lg">
                  <span className="text-3xl md:text-4xl">⭐</span>
               </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter mb-2 text-center text-yellow-400">Novo Favorito</h2>
            <p className="text-slate-500 text-center text-[10px] font-black uppercase mb-6 md:mb-8 tracking-widest">Apelido para a Linha {namingFavorite.line.number}</p>
            
            <input 
              autoFocus
              type="text" 
              placeholder="EX: CASA, TRABALHO..."
              value={tempNickname}
              onChange={e => setTempNickname(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmFavorite()}
              className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-6 py-4 md:py-5 text-white font-black text-xl md:text-2xl outline-none focus:border-yellow-400 transition-all mb-6 md:mb-8 placeholder:text-slate-700 text-center uppercase"
            />

            <div className="flex gap-3 md:gap-4">
              <button 
                onClick={() => setNamingFavorite(null)}
                className="flex-1 bg-slate-800 text-slate-500 py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase hover:text-white transition-all active:scale-95 text-sm md:text-base"
              >
                Voltar
              </button>
              <button 
                onClick={confirmFavorite}
                className="flex-1 bg-yellow-400 text-black py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase hover:bg-white transition-all shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] active:scale-95 text-sm md:text-base"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-slate-900 border-b-4 border-yellow-400 p-4 md:p-8 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-6 md:gap-8">
          
          {/* Header Title Section (Logo Image removed as requested) */}
          <div className="flex items-center gap-3 md:gap-5 group cursor-default">
            <div className="flex flex-col items-center md:items-start text-center md:text-left">
               <div className="bg-yellow-400 text-black px-4 md:px-6 py-1 md:py-1.5 font-black italic text-xl md:text-4xl skew-x-[-12deg] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] uppercase leading-none">
                CADÊ MEU BAÚ?
               </div>
               <span className="text-[8px] md:text-[10px] font-black tracking-[0.3em] md:tracking-[0.4em] text-slate-600 mt-1 md:mt-2 uppercase">Monitor em Tempo Real</span>
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 ml-2 md:ml-4">
                <div className="w-4 h-4 md:w-5 md:h-5 border-3 md:border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          
          {/* Search Controls */}
          <div className="w-full flex flex-col md:flex-row gap-3">
            <div className="flex-[2] flex bg-slate-800 rounded-xl md:rounded-2xl p-0.5 md:p-1 border-2 border-slate-700 shadow-inner group focus-within:border-yellow-400 transition-all relative">
              <input 
                type="text" 
                inputMode="numeric"
                placeholder="NÚMERO DO PONTO"
                value={stopId}
                onChange={e => setStopId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                className="bg-transparent px-4 md:px-6 py-3 md:py-4 outline-none font-black text-yellow-400 w-full text-base md:text-lg placeholder:text-slate-700 uppercase"
              />
            </div>
            <div className="flex-1 flex bg-slate-800 rounded-xl md:rounded-2xl p-0.5 md:p-1 border-2 border-slate-700 shadow-inner focus-within:border-yellow-400 transition-all">
              <input 
                type="text" 
                placeholder="LINHA"
                value={lineFilter}
                onChange={e => setLineFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                className="bg-transparent px-4 md:px-6 py-3 md:py-4 outline-none font-black text-white w-full text-base md:text-lg placeholder:text-slate-700 text-center uppercase"
              />
            </div>
            <button 
              onClick={() => handleManualSearch()}
              disabled={isLoading}
              className="bg-yellow-400 text-black px-6 md:px-12 py-4 rounded-xl md:rounded-2xl font-black hover:bg-white transition-all active:scale-95 uppercase text-lg md:text-xl shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
            >
              {isLoading ? '...' : 'BUSCAR'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 fade-in-up">
        {favorites.length > 0 && (
          <div className="mb-10 md:mb-14">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] md:tracking-[0.5em] text-slate-600 flex items-center gap-2 md:gap-3">
                <span className="text-yellow-400 animate-pulse">⭐</span> MEUS FAVORITOS
              </h2>
              <button 
                onClick={() => { setSearchMode('favorites'); fetchAllFavorites(); }} 
                className="text-[8px] md:text-[10px] font-black bg-slate-900 border border-slate-800 px-3 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-2xl text-slate-500 hover:text-yellow-400 hover:border-yellow-400 transition-all uppercase tracking-tighter active:scale-95"
              >
                Atualizar
              </button>
            </div>
            <div className="flex flex-wrap gap-2 md:gap-4">
              {favorites.map((fav, i) => (
                <div key={i} className="flex items-center bg-slate-900 border-2 border-slate-800 rounded-2xl md:rounded-3xl overflow-hidden hover:border-yellow-400 transition-all shadow-xl hover:-translate-y-1 group">
                  <button
                    onClick={() => { setStopId(fav.stopId); setLineFilter(fav.lineNumber); handleManualSearch(fav.stopId); }}
                    className="px-4 md:px-8 py-3 md:py-4 flex flex-col items-start leading-tight text-left"
                  >
                    {fav.nickname && <span className="text-[7px] md:text-[9px] font-black text-slate-500 uppercase truncate max-w-[100px] md:max-w-[150px] tracking-widest mb-0.5 md:mb-1">{fav.nickname}</span>}
                    <div className="flex items-center gap-2 md:gap-3">
                      <span className="font-black text-yellow-400 text-lg md:text-2xl italic">{fav.lineNumber || 'TUDO'}</span>
                      <span className="text-[7px] md:text-[9px] font-black text-slate-700 bg-black/40 px-1.5 py-0.5 rounded uppercase tracking-tighter">PT {fav.stopId}</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => setFavorites(prev => prev.filter((_, idx) => idx !== i))}
                    className="bg-red-900/10 px-4 md:px-5 py-6 md:py-8 text-red-500 hover:bg-red-600 hover:text-white transition-all border-l border-slate-800"
                  >
                    <span className="block text-xs">✕</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {busLines.length > 0 && (
          <div className="flex items-center justify-between mb-6 md:mb-8 bg-slate-900/40 px-4 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl border border-slate-800/50">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="w-2 md:w-3 h-2 md:h-3 bg-yellow-400 rounded-full animate-ping"></div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-600">
                PROX EM <span className="text-yellow-400 tabular-nums">{countdown}S</span>
              </span>
            </div>
            <span className="text-[8px] md:text-[10px] font-black text-slate-700 uppercase tracking-widest bg-black/40 px-3 py-1 md:py-1.5 rounded-full">{busLines.length} LINHAS</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-8 p-6 md:p-10 bg-red-900/10 border-4 border-red-600 text-red-500 rounded-[2rem] md:rounded-[3rem] font-black text-center uppercase italic tracking-tighter shadow-2xl animate-in shake duration-500">
            <div className="text-2xl md:text-4xl mb-2 md:mb-4">⚠️</div>
            <span className="text-sm md:text-base">{errorMsg}</span>
          </div>
        )}

        <div className="space-y-4 md:space-y-8">
          {busLines.length > 0 ? (
            busLines.map(line => {
              const urgency = getUrgency(line.nextArrival || '');
              const currentPoint = (line as any).stopSource || stopId;
              const isFav = favorites.some(f => f.stopId === currentPoint && f.lineNumber === line.number);
              
              return (
                <div key={line.id} className="bg-slate-900 border-2 border-slate-800 p-5 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-8 transition-all hover:border-yellow-400 rounded-[2rem] md:rounded-[3.5rem] group shadow-2xl relative overflow-hidden active:scale-[0.98]">
                  <div className="flex items-center gap-4 md:gap-10 w-full md:w-auto">
                    <div className="text-5xl md:text-8xl font-black text-yellow-400 tabular-nums w-20 md:w-40 text-center drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] italic md:skew-x-[-6deg]">
                      {line.number}
                    </div>
                    <div className="flex-grow">
                      <h3 className="font-black text-lg md:text-3xl uppercase tracking-tighter leading-tight group-hover:text-yellow-400 transition-colors mb-2 md:mb-4">
                        {line.destination}
                      </h3>
                      <div className="flex flex-wrap gap-2 md:gap-3">
                         <div className="flex flex-col">
                            <span className="text-[7px] md:text-[9px] font-black text-slate-600 mb-0.5 md:mb-1 uppercase tracking-widest">Chegada</span>
                            <span className="text-[10px] md:text-sm font-black bg-slate-800 border-2 border-slate-700 px-3 md:px-5 py-1 md:py-2 rounded-lg md:rounded-2xl uppercase tracking-widest text-slate-300">
                              {line.nextArrival ? `${line.nextArrival} MIN` : 'N/A'}
                            </span>
                         </div>
                         {line.subsequentArrival && (
                           <div className="flex flex-col">
                              <span className="text-[7px] md:text-[9px] font-black text-slate-700 mb-0.5 md:mb-1 uppercase tracking-widest">Depois</span>
                              <span className="text-[9px] md:text-[11px] font-black bg-black/50 px-3 md:px-5 py-1 md:py-2 rounded-lg md:rounded-2xl uppercase tracking-widest text-slate-600">
                                {line.subsequentArrival} MIN
                              </span>
                           </div>
                         )}
                         {(line as any).stopSource && (
                            <div className="flex flex-col">
                              <span className="text-[7px] md:text-[9px] font-black text-slate-700 mb-0.5 md:mb-1 uppercase tracking-widest">Ponto</span>
                              <span className="text-[9px] md:text-[11px] font-black bg-yellow-400/5 text-yellow-400/30 px-3 md:px-5 py-1 md:py-2 rounded-lg md:rounded-2xl uppercase tracking-tighter">
                                #{ (line as any).stopSource }
                              </span>
                            </div>
                         )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 md:gap-6 w-full md:w-auto justify-between md:justify-end border-t border-slate-800/50 md:border-0 pt-4 md:pt-0">
                    <button 
                      onClick={() => openNamingModal(line, currentPoint)}
                      className={`p-4 md:p-6 rounded-2xl md:rounded-[2rem] border-2 transition-all flex items-center justify-center text-2xl md:text-4xl shadow-xl active:scale-90 ${isFav ? 'bg-red-600/10 border-red-600 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-700 hover:text-red-400 hover:border-red-400'}`}
                    >
                      {isFav ? '❤️' : '🤍'}
                    </button>
                    
                    <div className={`flex-grow md:flex-none px-6 md:px-12 py-4 md:py-6 rounded-2xl md:rounded-[2rem] ${urgency.color} ${urgency.text} font-black text-xl md:text-3xl italic tracking-tighter shadow-2xl md:min-w-[200px] text-center uppercase ${urgency.pulse ? 'animate-pulse' : ''}`}>
                      {urgency.label}
                    </div>
                  </div>
                </div>
              );
            })
          ) : !isLoading && (
            <div className="flex flex-col items-center justify-center py-24 md:py-48 opacity-20">
              <div className="text-[8rem] md:text-[12rem] mb-6 md:mb-10 grayscale animate-bounce duration-[2000ms]">🚍</div>
              <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-[0.3em] md:tracking-[0.4em]">CADÊ O BAÚ?</h2>
              <div className="flex items-center gap-2 md:gap-4 mt-6 md:mt-8 px-4 text-center">
                <div className="hidden md:block h-px w-12 bg-yellow-400"></div>
                <p className="font-black italic uppercase tracking-widest text-[10px] md:text-sm bg-yellow-400 text-black px-4 md:px-6 py-2 rounded-sm shadow-xl">Insira o número do ponto acima</p>
                <div className="hidden md:block h-px w-12 bg-yellow-400"></div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="text-center p-12 md:p-20 opacity-10 text-[8px] md:text-[10px] font-black uppercase tracking-[1em] md:tracking-[2em] px-4">
        RMTC GOIÂNIA • REDE METROPOLITANA • REAL-TIME DATA
      </footer>
    </div>
  );
};

export default App;
