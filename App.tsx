import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BusLine } from './types';

interface FavoriteItem {
  stopId: string;
  lineNumber: string;
  destination: string;
  nickname?: string;
}

const REFRESH_INTERVAL = 25;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'favs' | 'map'>('search');
  const [isSplash, setIsSplash] = useState(true);
  const [busLines, setBusLines] = useState<BusLine[]>([]);
  const [stopId, setStopId] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  
  const timerRef = useRef<any>(null);

  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    const saved = localStorage.getItem('cade_meu_bau_app_favs');
    return saved ? JSON.parse(saved) : [];
  });

  const baseUrl = 'https://bot-onibus.vercel.app/api/ponto';

  useEffect(() => {
    const splashTimer = setTimeout(() => setIsSplash(false), 2500);
    return () => clearTimeout(splashTimer);
  }, []);

  /**
   * Normaliza os horários vindos da API.
   * Transforma "--", "---", nulo ou vazio em "SEM PREVISÃO".
   * Remove sufixos como "min" para limpeza visual.
   */
  const normalizeTime = (time: any): string => {
    if (time === null || time === undefined) return 'SEM PREVISÃO';
    let t = time.toString().trim();
    
    // Verifica se é vazio, contém apenas traços, pontos ou a string "---"
    if (!t || /^[-.]+$/.test(t) || t === 'SEM PREVISÃO' || t === '....') {
      return 'SEM PREVISÃO';
    }

    // Remove "min", "Min", "MIN" etc para tratar o dado puro
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
        return data.horarios.map((item: any, index: number) => {
          const rawLinha = (item.linha || '').toString().trim();
          const formattedLinha = rawLinha.length === 1 ? `NS${rawLinha}` : rawLinha;

          return {
            id: `api-${sId}-${item.linha}-${index}`,
            number: formattedLinha,
            name: formattedLinha,
            origin: '',
            destination: item.destino || 'Destino não informado',
            schedules: [],
            frequencyMinutes: 0,
            status: 'Normal',
            nextArrival: normalizeTime(item.proximo || item.previsao), 
            subsequentArrival: normalizeTime(item.seguinte),
            stopSource: sId
          };
        });
      }
      return [];
    } catch (err) {
      console.error("Erro na busca:", err);
      return [];
    }
  }, []);

  const handleSearch = async (forcedId?: string) => {
    const idToSearch = forcedId || stopId;
    if (!idToSearch) return;
    setIsLoading(true);
    setErrorMsg(null);
    const results = await performSearch(idToSearch, lineFilter);
    setBusLines(results);
    if (results.length === 0) setErrorMsg("Nenhum ônibus encontrado para este ponto.");
    setIsLoading(false);
    setCountdown(REFRESH_INTERVAL);
  };

  useEffect(() => {
    if (activeTab === 'search' && busLines.length > 0 && !isLoading) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            handleSearch();
            return REFRESH_INTERVAL;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeTab, busLines.length, isLoading, stopId, lineFilter]);

  const toggleFavorite = (line: BusLine) => {
    const sId = line.stopSource || stopId;
    const isFav = favorites.some(f => f.stopId === sId && f.lineNumber === line.number);
    if (isFav) {
      setFavorites(favorites.filter(f => !(f.stopId === sId && f.lineNumber === line.number)));
    } else {
      setFavorites([...favorites, { 
        stopId: sId, 
        lineNumber: line.number, 
        destination: line.destination 
      }]);
    }
  };

  useEffect(() => {
    localStorage.setItem('cade_meu_bau_app_favs', JSON.stringify(favorites));
  }, [favorites]);

  const getUrgencyColor = (timeStr: string) => {
  if (!timeStr || timeStr === 'SEM PREVISÃO') {
    return 'bg-slate-800 text-slate-500';
  }

  const cleanTime = timeStr.toLowerCase();

  if (cleanTime.includes('agora') || cleanTime === '0') {
    return 'bg-red-600 text-white';
  }

  if (cleanTime.includes('aprox')) {
    return 'bg-blue-500 text-white';
  }

  // Extrai números da string (por exemplo: "5 min" -> 5)
  const mins = parseInt(timeStr.replace(/\D/g, '')) || 0;

  if (mins <= 3) return 'bg-red-600 text-white';
  if (mins <= 8) return 'bg-yellow-500 text-black';

  // Padrão: verde
  return 'bg-emerald-500 text-white';
};


  // Helper para renderizar o tempo com o rótulo "MINUTO(S)" embaixo
  const renderTimeDisplay = (timeStr: string, isNext: boolean) => {
  const isNoPrev = timeStr === 'SEM PREVISÃO';
  const urgencyClasses = getUrgencyColor(timeStr);
  const isApprox = timeStr.toLowerCase().includes('aprox');

  if (isNoPrev) {
    return (
      <div
        className={`px-2 py-3 rounded-2xl ${urgencyClasses} font-black uppercase tracking-tighter w-full text-center text-[9px] opacity-40`}
      >
        {timeStr}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center w-full rounded-2xl py-2 ${urgencyClasses} ${
        !isNext ? 'opacity-90' : ''
      }`}
    >
      <span
        className={`font-black leading-none tracking-tighter ${
          isNext ? 'text-2xl' : 'text-xl'
        }`}
      >
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


  if (isSplash) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-10 overflow-hidden text-center">
        <div className="relative mb-8 flex flex-col items-center scale-110">
           <div className="w-40 h-40 bg-yellow-400 rounded-[3rem] flex items-center justify-center text-8xl shadow-[0_0_50px_rgba(251,191,36,0.4)] mb-8 transform rotate-[-5deg]">
             🚍
           </div>
          <div className="bg-yellow-400 text-black px-6 py-2 font-black italic text-2xl skew-x-[-12deg] shadow-[8px_8px_0px_rgba(251,191,36,0.3)] uppercase tracking-tighter">
            Cadê meu Baú?
          </div>
        </div>
        <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full bg-yellow-400 w-1/2 animate-[loading_1.5s_infinite_linear]"></div>
        </div>
        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.5em] text-slate-500 animate-pulse">Rastreando Linhas...</p>
        <style>{`@keyframes loading { from { left: -50%; } to { left: 100%; } }`}</style>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col relative overflow-hidden">
      
      <header className="pt-[env(safe-area-inset-top)] bg-slate-900/90 border-b border-white/10 p-4 flex justify-between items-center shrink-0 z-50">
        <div className="font-black italic text-yellow-400 text-xl tracking-tighter skew-x-[-10deg]">CADÊ MEU BAÚ?</div>
        
        <div className="flex items-center gap-3">
          {busLines.length > 0 && !isLoading && (
            <div className="text-right flex flex-col items-end">
              <span className="text-[7px] font-black text-slate-500 uppercase leading-none mb-0.5">Auto-Refresh</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-sm font-black text-yellow-400 tabular-nums leading-none">{countdown}s</span>
              </div>
            </div>
          )}
          {isLoading && <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>}
        </div>
      </header>

      <div className="flex-grow overflow-y-auto app-container px-4 pt-4 pb-32 space-y-5">
        
        {activeTab === 'search' && (
          <div className="page-enter space-y-5">
            <div className="bg-slate-900 p-5 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-4">
              <div className="flex gap-2">
                <div className="flex-[3] relative">
                  <span className="absolute left-4 top-2 text-[8px] font-black text-slate-500 uppercase pointer-events-none">Número do Ponto</span>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    placeholder="Ex: 31700"
                    value={stopId}
                    onChange={e => setStopId(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-2xl px-4 pt-6 pb-3 font-black text-yellow-400 outline-none focus:border-yellow-400 transition-all placeholder:text-slate-800 text-xl"
                  />
                </div>
                <div className="flex-[2] relative">
                  <span className="absolute left-0 top-2 text-[8px] font-black text-slate-500 uppercase text-center w-full pointer-events-none">Num. Onibus(OPCIONAL)</span>
                  <input 
                    type="text" 
                    placeholder="Ex: 327"
                    value={lineFilter}
                    onChange={e => setLineFilter(e.target.value)}
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
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl text-center text-red-500 font-bold text-[10px] uppercase tracking-widest animate-pulse">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              {busLines.map(line => {
                const isFav = favorites.some(f => f.stopId === (line.stopSource || stopId) && f.lineNumber === line.number);
                
                return (
                  <div key={line.id} className="bg-slate-900 border border-white/10 p-5 rounded-[2.5rem] flex flex-col gap-4 shadow-xl active:scale-[0.98] transition-transform">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="text-4xl font-black text-yellow-400 italic w-24 shrink-0 text-center leading-none tracking-tighter drop-shadow-[0_2px_10px_rgba(251,191,36,0.2)]">
                          {line.number}
                        </div>
                        <div className="min-w-0 flex flex-col justify-center">
                          <div className="font-black text-[13px] uppercase truncate text-white leading-tight mb-1 pr-2">{line.destination}</div>
                          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online agora
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(line); }}
                        className={`text-3xl transition-all active:scale-150 p-2 ${isFav ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-slate-800'}`}
                      >
                        {isFav ? '★' : '☆'}
                      </button>
                    </div>

                    <div className="flex gap-2">
                       <div className="flex-1 bg-black/60 rounded-[1.5rem] p-4 border border-white/5 flex flex-col items-center justify-center min-h-[95px]">
                          <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Chega em:</span>
                          {renderTimeDisplay(line.nextArrival || 'SEM PREVISÃO', true)}
                       </div>
                       <div className="flex-1 bg-black/30 rounded-[1.5rem] p-4 border border-white/5 flex flex-col items-center justify-center min-h-[95px] opacity-90">
                          <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Próximo em:</span>
                          {renderTimeDisplay(line.subsequentArrival || 'SEM PREVISÃO', false)}
                       </div>
                    </div>
                  </div>
                );
              })}

              {busLines.length === 0 && !isLoading && (
                <div className="py-20 text-center opacity-10 flex flex-col items-center">
                  <div className="text-9xl mb-6">🚍</div>
                  <p className="font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed text-slate-500">Aguardando número do ponto...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'favs' && (
          <div className="page-enter space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mb-8 px-2 flex items-center gap-2">
              <span className="text-yellow-400 text-lg">★</span> Minha Garagem
            </h2>
            {favorites.map((fav, i) => (
              <div key={i} className="bg-slate-900 p-5 rounded-[2.5rem] border border-white/10 flex items-center justify-between shadow-lg active:bg-slate-800 transition-colors"
                onClick={() => { setActiveTab('search'); setStopId(fav.stopId); handleSearch(fav.stopId); }}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                   <div className="text-4xl font-black text-yellow-400 italic w-24 shrink-0 text-center tracking-tighter">{fav.lineNumber}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-[12px] uppercase truncate text-white mb-0.5">{fav.destination}</div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">PONTO: {fav.stopId}</div>
                  </div>
                </div>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setFavorites(favorites.filter(f => !(f.stopId === fav.stopId && f.lineNumber === fav.lineNumber)));
                  }}
                  className="text-yellow-400 text-3xl p-4 -mr-2"
                >
                  ★
                </button>
              </div>
            ))}
            {favorites.length === 0 && (
              <div className="py-28 text-center opacity-20 px-10">
                <p className="font-black text-[12px] uppercase tracking-[0.3em] mb-4">Garagem Vazia</p>
                <p className="text-[10px] leading-relaxed uppercase tracking-widest font-bold">Toque na estrela de uma linha para que ela apareça aqui.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <div className="page-enter flex flex-col items-center justify-center py-32 text-center px-10">
            <div className="text-8xl mb-10 drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]">📍</div>
            <h3 className="font-black text-2xl mb-4 text-yellow-400 italic skew-x-[-10deg] uppercase tracking-tighter">Radar em Obras</h3>
            <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-[0.3em] font-black">Estamos preparando a visão em mapa para você ver o baú dobrando a esquina em tempo real.</p>
          </div>
        )}

      </div>

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
