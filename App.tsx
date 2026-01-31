
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
      {namingFavorite && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setNamingFavorite(null)}
        >
          <div 
            className="bg-slate-900 border-4 border-yellow-400 p-8 rounded-[2rem] max-w-md w-full shadow-[0_0_50px_rgba(251,191,36,0.3)] animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2 text-yellow-400">Novo Favorito</h2>
            <p className="text-slate-400 text-sm font-bold uppercase mb-6">Como você quer chamar a linha {namingFavorite.line.number}?</p>
            
            <input 
              autoFocus
              type="text" 
              placeholder="Ex: Trabalho, Faculdade, Casa..."
              value={tempNickname}
              onChange={e => setTempNickname(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmFavorite()}
              className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-6 py-4 text-white font-black text-xl outline-none focus:border-yellow-400 transition-all mb-8 placeholder:text-slate-600"
            />

            <div className="flex gap-4">
              <button 
                onClick={() => setNamingFavorite(null)}
                className="flex-1 bg-slate-800 text-slate-400 py-4 rounded-2xl font-black uppercase hover:text-white transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmFavorite}
                className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black uppercase hover:bg-white transition-all shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] active:scale-95"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-slate-900 border-b-4 border-yellow-400 p-8 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-6">
          <div className="relative">
            <div className="bg-yellow-400 text-black px-6 py-2 font-black italic text-3xl md:text-4xl skew-x-[-10deg] shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] uppercase">
              CADÊ MEU BAÚ?
            </div>
            {isLoading && (
              <div className="absolute -right-12 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <div className="w-6 h-6 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          
          <div className="w-full flex flex-col md:flex-row gap-3">
            <div className="flex-[2] flex bg-slate-800 rounded-2xl p-1 border-2 border-slate-700 shadow-inner group focus-within:border-yellow-400 transition-all relative">
              <input 
                type="text" 
                placeholder="NÚMERO DO PONTO"
                value={stopId}
                onChange={e => setStopId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                className="bg-transparent px-6 py-3 outline-none font-black text-yellow-400 w-full text-lg placeholder:text-slate-700 uppercase"
              />
            </div>
            <div className="flex-1 flex bg-slate-800 rounded-2xl p-1 border-2 border-slate-700 shadow-inner focus-within:border-yellow-400 transition-all">
              <input 
                type="text" 
                placeholder="LINHA"
                value={lineFilter}
                onChange={e => setLineFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                className="bg-transparent px-6 py-3 outline-none font-black text-white w-full text-lg placeholder:text-slate-700 text-center uppercase"
              />
            </div>
            <button 
              onClick={() => handleManualSearch()}
              disabled={isLoading}
              className="bg-yellow-400 text-black px-10 py-4 rounded-2xl font-black hover:bg-white transition-all active:scale-95 uppercase text-lg shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
            >
              {isLoading ? '...' : 'BUSCAR'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8">
        {favorites.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-600 flex items-center gap-2">
                <span className="text-yellow-400 animate-pulse">★</span> MEUS FAVORITOS
              </h2>
              <button 
                onClick={() => { setSearchMode('favorites'); fetchAllFavorites(); }} 
                className="text-[10px] font-black bg-slate-900 border border-slate-800 px-4 py-2 rounded-full text-slate-400 hover:text-yellow-400 hover:border-yellow-400 transition-all uppercase tracking-tighter"
              >
                Sincronizar Tudo
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {favorites.map((fav, i) => (
                <div key={i} className="flex items-center bg-slate-900 border-2 border-slate-800 rounded-2xl overflow-hidden hover:border-yellow-400 transition-all shadow-xl hover:-translate-y-1">
                  <button
                    onClick={() => { setStopId(fav.stopId); setLineFilter(fav.lineNumber); handleManualSearch(fav.stopId); }}
                    className="px-6 py-3 flex flex-col items-start leading-tight text-left"
                  >
                    {fav.nickname && <span className="text-[10px] font-black text-slate-500 uppercase truncate max-w-[140px] tracking-widest">{fav.nickname}</span>}
                    <div className="flex items-center gap-2">
                      <span className="font-black text-yellow-400 text-xl italic">{fav.lineNumber || 'TUDO'}</span>
                      <span className="text-[9px] font-black text-slate-700 bg-black/30 px-2 py-0.5 rounded uppercase tracking-tighter">Ponto {fav.stopId}</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => setFavorites(prev => prev.filter((_, idx) => idx !== i))}
                    className="bg-red-900/10 px-4 py-6 text-red-500 hover:bg-red-600 hover:text-white transition-all border-l border-slate-800 group"
                    title="Remover Favorito"
                  >
                    <span className="group-hover:scale-125 transition-transform block">✕</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {busLines.length > 0 && (
          <div className="flex items-center justify-between mb-8 bg-slate-900/30 px-6 py-3 rounded-2xl border border-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-ping"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Próxima atualização em <span className="text-yellow-400 tabular-nums">{countdown}s</span>
              </span>
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{busLines.length} Linhas Encontradas</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-8 p-8 bg-red-900/20 border-4 border-red-600 text-red-500 rounded-[2rem] font-black text-center uppercase italic tracking-tighter shadow-2xl animate-in shake duration-500">
            {errorMsg}
          </div>
        )}

        <div className="space-y-6">
          {busLines.length > 0 ? (
            busLines.map(line => {
              const urgency = getUrgency(line.nextArrival || '');
              const currentPoint = (line as any).stopSource || stopId;
              const isFav = favorites.some(f => f.stopId === currentPoint && f.lineNumber === line.number);
              
              return (
                <div key={line.id} className="bg-slate-900 border-2 border-slate-800 p-8 flex flex-col md:flex-row items-center justify-between gap-8 transition-all hover:border-yellow-400 rounded-[2.5rem] group shadow-2xl relative overflow-hidden active:scale-[0.98]">
                  <div className="flex items-center gap-8 w-full md:w-auto">
                    <div className="text-7xl font-black text-yellow-400 tabular-nums w-32 text-center drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] italic skew-x-[-4deg]">
                      {line.number}
                    </div>
                    <div className="flex-grow">
                      <h3 className="font-black text-3xl uppercase tracking-tighter leading-tight group-hover:text-yellow-400 transition-colors mb-3">
                        {line.destination}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                         <span className="text-xs font-black bg-slate-800 border-2 border-slate-700 px-4 py-2 rounded-xl uppercase tracking-widest text-slate-300">
                           {line.nextArrival ? `${line.nextArrival} MINUTOS` : 'INDISPONÍVEL'}
                         </span>
                         {line.subsequentArrival && (
                           <span className="text-[10px] font-black bg-black/40 px-4 py-2 rounded-xl uppercase tracking-widest text-slate-600">
                             SEGUINTE: {line.subsequentArrival} MIN
                           </span>
                         )}
                         {(line as any).stopSource && (
                            <span className="text-[10px] font-black bg-yellow-400/10 text-yellow-400/40 px-4 py-2 rounded-xl uppercase tracking-tighter">
                              PONTO {(line as any).stopSource}
                            </span>
                         )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                    <button 
                      onClick={() => openNamingModal(line, currentPoint)}
                      className={`p-5 rounded-[1.5rem] border-2 transition-all flex items-center justify-center text-3xl shadow-xl active:scale-90 ${isFav ? 'bg-red-600/10 border-red-600 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-700 hover:text-red-400 hover:border-red-400'}`}
                    >
                      {isFav ? '❤️' : '🤍'}
                    </button>
                    
                    <div className={`px-10 py-5 rounded-[1.5rem] ${urgency.color} ${urgency.text} font-black text-3xl italic tracking-tighter shadow-2xl min-w-[180px] text-center uppercase ${urgency.pulse ? 'animate-pulse' : ''}`}>
                      {urgency.label}
                    </div>
                  </div>
                </div>
              );
            })
          ) : !isLoading && (
            <div className="flex flex-col items-center justify-center py-40 opacity-20">
              <div className="text-[10rem] mb-8 grayscale animate-bounce duration-1000">🚍</div>
              <h2 className="text-4xl font-black uppercase italic tracking-[0.3em]">CADÊ O BAÚ?</h2>
              <p className="font-black mt-6 italic uppercase tracking-widest text-sm bg-yellow-400 text-black px-4 py-1">DIGITE O NÚMERO DO PONTO</p>
            </div>
          )}
        </div>
      </main>

      <footer className="text-center p-16 opacity-10 text-[10px] font-black uppercase tracking-[1.5em]">
        RMTC GOIÂNIA • TEMPO REAL • MADE FOR SPEED
      </footer>
    </div>
  );
};

export default App;
