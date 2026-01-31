
import React, { useState, useEffect, useCallback } from 'react';
import { BusLine } from './types';

interface FavoriteItem {
  stopId: string;
  lineNumber: string;
  nickname?: string;
}

const REFRESH_INTERVAL = 30;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'favs' | 'map'>('search');
  const [isSplash, setIsSplash] = useState(true);
  const [busLines, setBusLines] = useState<BusLine[]>([]);
  const [stopId, setStopId] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    const saved = localStorage.getItem('cade_meu_bau_app_favs');
    return saved ? JSON.parse(saved) : [];
  });

  const baseUrl = 'https://bot-onibus.vercel.app/api/ponto';

  useEffect(() => {
    // Simula Splash Screen de App Nativo
    const timer = setTimeout(() => setIsSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const performSearch = useCallback(async (sId: string, lFilter: string): Promise<BusLine[]> => {
    try {
      let fullUrl = `${baseUrl}?ponto=${sId.trim()}`;
      if (lFilter.trim()) fullUrl += `&linha=${lFilter.trim()}`;
      
      const res = await fetch(fullUrl);
      if (!res.ok) return [];
      
      const data = await res.json();
      if (data?.horarios && Array.isArray(data.horarios)) {
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
    if (results.length === 0) setErrorMsg("Nenhum ônibus encontrado.");
    setIsLoading(false);
    setCountdown(REFRESH_INTERVAL);
  };

  useEffect(() => {
    localStorage.setItem('cade_meu_bau_app_favs', JSON.stringify(favorites));
  }, [favorites]);

  const getUrgency = (timeStr: string) => {
    if (!timeStr || timeStr.toLowerCase().includes('aprox')) 
      return { label: 'NA ESQUINA', color: 'bg-red-600' };
    const mins = parseInt(timeStr.replace(/\D/g, '')) || 0;
    if (mins <= 3) return { label: 'CORRE!', color: 'bg-red-600' };
    if (mins <= 8) return { label: 'A CAMINHO', color: 'bg-yellow-400', text: 'text-black' };
    return { label: 'TRANQUILO', color: 'bg-emerald-500' };
  };

  if (isSplash) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-10">
        <div className="relative mb-8">
           <img 
            src="./logo.png" 
            alt="Logo" 
            className="w-32 h-32 object-contain animate-pulse"
            onError={(e) => e.currentTarget.style.display = 'none'}
          />
        </div>
        <div className="bg-yellow-400 text-black px-6 py-2 font-black italic text-3xl skew-x-[-12deg] mb-6 shadow-[10px_10px_0px_rgba(251,191,36,0.2)]">
          CADÊ MEU BAÚ?
        </div>
        <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full bg-yellow-400 w-1/2 animate-[loading_1.5s_infinite_linear]"></div>
        </div>
        <style>{`@keyframes loading { from { left: -50%; } to { left: 100%; } }`}</style>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col relative overflow-hidden">
      
      {/* App Header */}
      <header className="pt-[env(safe-area-inset-top)] bg-slate-900 border-b border-white/5 p-4 flex justify-between items-center shrink-0">
        <div className="font-black italic text-yellow-400 text-xl tracking-tighter skew-x-[-10deg]">CADÊ MEU BAÚ?</div>
        {isLoading && <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>}
      </header>

      {/* Main Content Area */}
      <div className="flex-grow overflow-y-auto app-container p-4 space-y-6">
        
        {activeTab === 'search' && (
          <div className="page-enter space-y-6">
            <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 shadow-2xl">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="Nº DO PONTO"
                  value={stopId}
                  onChange={e => setStopId(e.target.value)}
                  className="flex-[2] bg-black border border-white/10 rounded-2xl px-4 py-4 font-bold text-yellow-400 outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700"
                />
                <button 
                  onClick={() => handleSearch()}
                  className="flex-1 bg-yellow-400 text-black rounded-2xl font-black btn-active uppercase text-xs"
                >
                  BUSCAR
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500 p-4 rounded-2xl text-center text-red-500 font-bold text-xs">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              {busLines.map(line => {
                const urgency = getUrgency(line.nextArrival || '');
                return (
                  <div key={line.id} className="bg-slate-900/50 border border-white/5 p-5 rounded-[2.5rem] flex items-center justify-between group active:bg-slate-800 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl font-black text-yellow-400 italic w-14">{line.number}</div>
                      <div>
                        <div className="font-black text-sm uppercase truncate max-w-[150px]">{line.destination}</div>
                        <div className="text-[10px] font-bold text-slate-500 tracking-widest">{line.nextArrival || '--'} MIN</div>
                      </div>
                    </div>
                    <div className={`px-4 py-2 rounded-full ${urgency.color} ${urgency.text || 'text-white'} text-[9px] font-black uppercase tracking-tighter`}>
                      {urgency.label}
                    </div>
                  </div>
                );
              })}

              {busLines.length === 0 && !isLoading && (
                <div className="py-20 text-center opacity-20">
                  <div className="text-6xl mb-4">🚍</div>
                  <p className="font-black text-xs uppercase tracking-[0.3em]">Aguardando Busca</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'favs' && (
          <div className="page-enter space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mb-6 px-2">Meus Favoritos</h2>
            {favorites.map((fav, i) => (
              <div key={i} className="bg-slate-900 p-4 rounded-[2rem] border border-white/5 flex items-center justify-between btn-active"
                onClick={() => { setActiveTab('search'); setStopId(fav.stopId); handleSearch(fav.stopId); }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center text-black font-black">⭐</div>
                  <div>
                    <div className="font-black text-sm">{fav.nickname || 'Linha ' + fav.lineNumber}</div>
                    <div className="text-[10px] font-bold text-slate-500">Ponto: {fav.stopId}</div>
                  </div>
                </div>
                <button className="text-slate-700 text-xl px-2">›</button>
              </div>
            ))}
            {favorites.length === 0 && (
              <div className="py-20 text-center opacity-20">
                <p className="font-black text-xs uppercase tracking-[0.3em]">Nenhum favorito salvo</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <div className="page-enter flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-6">📍</div>
            <h3 className="font-black text-lg mb-2 text-yellow-400">MAPA EM BREVE</h3>
            <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed uppercase tracking-tighter">Estamos trabalhando para trazer a localização dos ônibus no mapa em tempo real.</p>
          </div>
        )}

      </div>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/5 px-6 pb-8 pt-4 flex justify-between items-center shadow-[0_-10px_40px_rgba(0,0,0,0.8)] z-50">
        <button 
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'search' ? 'text-yellow-400 scale-110' : 'text-slate-600'}`}
        >
          <div className="text-xl">🔍</div>
          <span className="text-[8px] font-black uppercase tracking-widest">Busca</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('favs')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'favs' ? 'text-yellow-400 scale-110' : 'text-slate-600'}`}
        >
          <div className="text-xl">⭐</div>
          <span className="text-[8px] font-black uppercase tracking-widest">Favs</span>
        </button>

        <button 
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'map' ? 'text-yellow-400 scale-110' : 'text-slate-600'}`}
        >
          <div className="text-xl">📍</div>
          <span className="text-[8px] font-black uppercase tracking-widest">Mapa</span>
        </button>
      </nav>

    </div>
  );
};

export default App;
