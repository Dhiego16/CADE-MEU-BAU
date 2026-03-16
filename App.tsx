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

// ─── Haptic feedback ──────────────────────────────────────────────────────────
const haptic = (ms: number | number[] = 50) => {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
};

// ─── Web Share ────────────────────────────────────────────────────────────────
const shareLine = async (stopId: string, lineNumber: string) => {
  const url = `${window.location.origin}?ponto=${stopId}&linha=${lineNumber}`;
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Cadê meu Baú?',
        text: `🚍 Linha ${lineNumber} — Ponto ${stopId}`,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copiado!');
    }
  } catch { /* cancelado pelo usuário */ }
};

// ─── Skeleton Card ────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="bg-slate-900 border border-white/10 p-5 rounded-[2.5rem] flex flex-col gap-4 shadow-xl animate-pulse">
    <div className="flex items-center gap-4">
      <div className="w-24 h-10 bg-slate-800 rounded-2xl" />
      <div className="flex flex-col gap-2 flex-1">
        <div className="h-3 bg-slate-800 rounded-full w-16" />
        <div className="h-4 bg-slate-800 rounded-full w-40" />
        <div className="h-3 bg-slate-800 rounded-full w-20" />
      </div>
    </div>
    <div className="flex gap-2">
      <div className="flex-1 h-24 bg-slate-800 rounded-[1.5rem]" />
      <div className="flex-1 h-24 bg-slate-800/60 rounded-[1.5rem]" />
    </div>
  </div>
);

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
  const [staleData, setStaleData] = useState(false);
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [lightTheme, setLightTheme] = useState(() => {
    try { return localStorage.getItem('cade_meu_bau_theme') === 'light'; } catch { return false; }
  });

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSearchingRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTabRef = useRef<string>('');

  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try {
      const saved = localStorage.getItem('cade_meu_bau_app_favs');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cade_meu_bau_search_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const baseUrl = 'https://bot-onibus.vercel.app/api/ponto';

  // ─── Deep link ao abrir ───────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ponto = params.get('ponto');
    const linha = params.get('linha');
    if (ponto) {
      setStopId(ponto);
      if (linha) setLineFilter(linha);
    }
  }, []);

  // ─── PWA Install ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Já instalado como PWA, não mostra nada
    if (isInstalled) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const dismissed = localStorage.getItem('cade_meu_bau_install_dismissed');

    // iOS Safari: não tem evento beforeinstallprompt, mostra instruções manuais
    if (isIos && isSafari && !dismissed) {
      setTimeout(() => setShowInstallBanner(true), 3000);
      return;
    }

    // Android Chrome: captura o evento nativo
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      if (!dismissed) setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
    });

    // Se o evento nunca disparar (Chrome throttle), mostra banner manual após 4s
    const fallbackTimer = setTimeout(() => {
      if (!dismissed) setShowInstallBanner(true);
    }, 4000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(fallbackTimer);
    };
  }, [isInstalled]);

  // ─── Splash ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setIsSplash(false);
      if (favorites.length > 0) setActiveTab('favs');
    }, SPLASH_DURATION);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  // ─── Troca de aba — carrega favoritos ────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'favs' && prevTabRef.current !== 'favs' && favorites.length > 0) {
      loadFavoritesSchedules();
    }
    prevTabRef.current = activeTab;
  }, [activeTab]); // eslint-disable-line

  // ─── Tema ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('cade_meu_bau_theme', lightTheme ? 'light' : 'dark');
  }, [lightTheme]);

  const normalizeTime = (time: unknown): string => {
    if (time === null || time === undefined) return 'SEM PREVISÃO';
    const t = String(time).trim();
    if (!t || /^[-.]+$/.test(t) || t === 'SEM PREVISÃO' || t === '....') return 'SEM PREVISÃO';
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
    if (isSearchingRef.current) return;
    isSearchingRef.current = true;
    setIsLoading(true);
    setErrorMsg(null);
    setStaleData(false);
    try {
      const results = await performSearch(idToSearch, forcedFilter ?? lineFilter);
      setBusLines(results);
      if (results.length === 0) setErrorMsg('Sem Baú na Rua Agora Ou Número do Ponto/Linha Errado!');
      addToHistory(idToSearch);
    } catch {
      setStaleData(true);
    } finally {
      setIsLoading(false);
      setCountdown(REFRESH_INTERVAL);
      isSearchingRef.current = false;
    }
  }, [stopId, lineFilter, performSearch, addToHistory]);

  const loadFavoritesSchedules = useCallback(async () => {
    if (favorites.length === 0) return;
    setIsFavoritesLoading(true);
    setStaleData(false);
    try {
      const results = await Promise.all(favorites.map(fav => performSearch(fav.stopId, fav.lineNumber)));
      setFavoriteBusLines(results.flat());
    } catch {
      setStaleData(true);
    } finally {
      setIsFavoritesLoading(false);
      setCountdown(REFRESH_INTERVAL);
    }
  }, [favorites, performSearch]);

  // ─── Timer único centralizado ─────────────────────────────────────────────
  useEffect(() => {
    const shouldRun =
      (activeTab === 'search' && busLines.length > 0 && !isLoading) ||
      (activeTab === 'favs' && favoriteBusLines.length > 0 && !isFavoritesLoading);

    if (timerRef.current) clearInterval(timerRef.current);
    if (!shouldRun) return;

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

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTab, busLines.length, favoriteBusLines.length, isLoading, isFavoritesLoading]);

  // ─── Favoritos ────────────────────────────────────────────────────────────
  const toggleFavorite = useCallback((line: BusLine) => {
    haptic(50);
    const sId = line.stopSource ?? stopId;
    const key = `${sId}::${line.number}`;
    const isFav = favorites.some(f => f.stopId === sId && f.lineNumber === line.number);
    if (isFav) {
      setRemovingFavKey(key);
      setTimeout(() => {
        setFavorites(prev => prev.filter(f => !(f.stopId === sId && f.lineNumber === line.number)));
        setFavoriteBusLines(prev => prev.filter(l => !(l.stopSource === sId && l.number === line.number)));
        setRemovingFavKey(null);
      }, 350);
    } else {
      haptic([50, 30, 80]);
      setFavorites(prev => [...prev, { stopId: sId, lineNumber: line.number, destination: line.destination }]);
    }
  }, [favorites, stopId]);

  useEffect(() => {
    localStorage.setItem('cade_meu_bau_app_favs', JSON.stringify(favorites));
  }, [favorites]);

  // ─── Nickname (toque longo) ───────────────────────────────────────────────
  const startLongPress = (key: string, currentNickname?: string) => {
    longPressTimer.current = setTimeout(() => {
      haptic(100);
      setEditingNickname(key);
      setNicknameInput(currentNickname ?? '');
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const saveNickname = () => {
    if (!editingNickname) return;
    const [sId, lineNumber] = editingNickname.split('::');
    setFavorites(prev => prev.map(f =>
      f.stopId === sId && f.lineNumber === lineNumber
        ? { ...f, nickname: nicknameInput.trim() || undefined }
        : f
    ));
    setEditingNickname(null);
    haptic(40);
  };

  // ─── Instalar PWA ─────────────────────────────────────────────────────────
  const handleInstall = async () => {
    haptic(50);
    if (deferredInstallPrompt) {
      // Android: dispara o prompt nativo
      (deferredInstallPrompt as unknown as { prompt: () => void }).prompt();
      setShowInstallBanner(false);
    } else {
      // iOS ou Chrome sem prompt: mostra instruções
      setShowIosInstructions(true);
    }
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('cade_meu_bau_install_dismissed', 'true');
    haptic(30);
  };

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
        <span className="text-[7px] font-black uppercase tracking-widest mt-0.5 opacity-80">MINUTO(S)</span>
        {isApprox && (
          <span className="text-[6px] font-black uppercase tracking-widest mt-1 opacity-80 text-center">
            IMPOSSÍVEL RASTREAR O BAÚ AGORA, MOSTRANDO TEMPO ESPECULADO!
          </span>
        )}
      </div>
    );
  };

  // ─── Agrupamento de favoritos por ponto ───────────────────────────────────
  const groupedFavLines = favoriteBusLines.reduce<Record<string, BusLine[]>>((acc, line) => {
    const key = line.stopSource ?? 'desconhecido';
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {});

  // ─── Contagem de favoritos ────────────────────────────────────────────────
  const favCount = favorites.length;

  // ─── Tema classes ─────────────────────────────────────────────────────────
  const t = {
    bg: lightTheme ? 'bg-gray-100' : 'bg-black',
    text: lightTheme ? 'text-gray-900' : 'text-white',
    card: lightTheme ? 'bg-white border-gray-200' : 'bg-slate-900 border-white/10',
    header: lightTheme ? 'bg-white/90 border-gray-200' : 'bg-slate-900/90 border-white/10',
    nav: lightTheme ? 'bg-white border-gray-200 shadow-[0_-20px_60px_rgba(0,0,0,0.1)]' : 'bg-slate-900 border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,1)]',
    input: lightTheme ? 'bg-gray-100 border-gray-300 text-gray-900' : 'bg-black border-white/10 text-yellow-400',
    inputWrap: lightTheme ? 'bg-white border-gray-200' : 'bg-slate-900 border-white/5',
    subtext: lightTheme ? 'text-gray-500' : 'text-slate-500',
    skeleton: lightTheme ? 'bg-gray-200' : 'bg-slate-800',
    inactiveNav: lightTheme ? 'text-gray-400' : 'text-slate-600',
    timeCardBg: lightTheme ? 'bg-gray-100 border-gray-200' : 'bg-black/60 border-white/5',
    timeCardBg2: lightTheme ? 'bg-gray-50 border-gray-200' : 'bg-black/30 border-white/5',
    destText: lightTheme ? 'text-gray-900' : 'text-white',
    stopBadge: lightTheme ? 'text-gray-400' : 'text-slate-600',
  };

  // ─── BusLineCard ──────────────────────────────────────────────────────────
  const BusLineCard = ({
    line,
    showFavoriteButton = true,
    isRemoving = false,
    staggerIndex = 0,
  }: {
    line: BusLine;
    showFavoriteButton?: boolean;
    isRemoving?: boolean;
    staggerIndex?: number;
  }) => {
    const sId = line.stopSource ?? stopId;
    const key = `${sId}::${line.number}`;
    const isFav = favorites.some(f => f.stopId === sId && f.lineNumber === line.number);
    const favItem = favorites.find(f => f.stopId === sId && f.lineNumber === line.number);

    return (
      <div
        className={`${t.card} border p-5 rounded-[2.5rem] flex flex-col gap-4 shadow-xl active:scale-[0.98] transition-all duration-300`}
        style={{
          opacity: isRemoving ? 0 : 1,
          transform: isRemoving ? 'scale(0.92) translateY(-8px)' : undefined,
          transition: `opacity 0.35s ease, transform 0.35s ease, box-shadow 0.2s ease`,
          animationDelay: `${staggerIndex * 60}ms`,
        }}
        onTouchStart={() => showFavoriteButton && isFav && startLongPress(key, favItem?.nickname)}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onMouseDown={() => showFavoriteButton && isFav && startLongPress(key, favItem?.nickname)}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="text-4xl font-black text-yellow-400 italic w-24 shrink-0 text-center leading-none tracking-tighter drop-shadow-[0_2px_10px_rgba(251,191,36,0.2)]">
              {line.number}
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              {/* Nickname se existir */}
              {favItem?.nickname && (
                <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-0.5">
                  ✏️ {favItem.nickname}
                </span>
              )}
              <div className="mb-1 pr-2 min-w-0 flex flex-col">
                <span className={`text-[9px] font-bold ${t.subtext} uppercase tracking-widest`}>INDO PARA:</span>
                <span className={`font-black text-[13px] uppercase ${t.destText} leading-tight break-words`}>
                  {line.destination}
                </span>
              </div>
              {line.stopSource && (
                <div className={`text-[8px] font-bold ${t.stopBadge} uppercase tracking-widest mb-1`}>
                  📍 PONTO {line.stopSource}
                </div>
              )}
              <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${line.nextArrival?.toLowerCase().includes('aprox') ? 'bg-red-500' : 'bg-emerald-500'}`} />
                <span className={t.subtext}>
                  {line.nextArrival?.toLowerCase().includes('aprox') ? 'Offline' : 'Online agora'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 shrink-0">
            {showFavoriteButton && (
              <button
                onClick={e => { e.stopPropagation(); toggleFavorite(line); }}
                className={`text-3xl transition-all duration-200 active:scale-150 p-2 ${isFav ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : t.inactiveNav}`}
                aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              >
                {isFav ? '★' : '☆'}
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); shareLine(line.stopSource ?? stopId, line.number); haptic(30); }}
              className={`text-lg p-1.5 transition-all active:scale-125 ${t.subtext}`}
              aria-label="Compartilhar linha"
            >
              🔗
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <div className={`flex-1 ${t.timeCardBg} rounded-[1.5rem] p-4 border flex flex-col items-center justify-center min-h-[95px]`}>
            <span className={`block text-[8px] font-black ${t.subtext} uppercase tracking-widest mb-2`}>Chega em:</span>
            {renderTimeDisplay(line.nextArrival ?? 'SEM PREVISÃO', true)}
          </div>
          <div className={`flex-1 ${t.timeCardBg2} rounded-[1.5rem] p-4 border flex flex-col items-center justify-center min-h-[95px] opacity-90`}>
            <span className={`block text-[8px] font-black ${t.subtext} uppercase tracking-widest mb-2`}>Próximo em:</span>
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

  // ─── Banner de instalação ─────────────────────────────────────────────────
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const InstallBanner = () => (
    <div
      className="mx-4 mb-2 stagger-card"
      style={{ animation: 'slideUp 0.4s ease-out' }}
    >
      <div className="bg-yellow-400 rounded-[2rem] p-4 flex items-center gap-3 shadow-[0_8px_30px_rgba(251,191,36,0.4)]">
        <div className="text-3xl shrink-0">📲</div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-black text-[11px] uppercase tracking-wider leading-tight">
            Instale o app!
          </p>
          <p className="text-black/60 text-[9px] font-bold uppercase tracking-widest leading-tight mt-0.5">
            Acesso rápido • Funciona offline
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleInstall}
            className="bg-black text-yellow-400 font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform"
          >
            Instalar
          </button>
          <button
            onClick={dismissInstallBanner}
            className="text-black/40 font-black text-lg px-1 active:scale-95 transition-transform"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Modal de instruções iOS / fallback Android ───────────────────────────
  const InstallInstructionsModal = () => (
    <div
      className="fixed inset-0 bg-black/90 z-[100] flex items-end justify-center p-4"
      onClick={() => setShowIosInstructions(false)}
    >
      <div
        className={`${t.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-5`}
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400">
            📲 Como instalar
          </p>
          <button
            onClick={() => setShowIosInstructions(false)}
            className={`${t.subtext} text-xl font-black`}
          >
            ✕
          </button>
        </div>

        {isIos ? (
          // Instruções iOS Safari
          <div className="space-y-4">
            <div className={`flex items-start gap-3 ${t.card} border rounded-2xl p-3`}>
              <span className="text-2xl shrink-0">1️⃣</span>
              <div>
                <p className="font-black text-[11px] uppercase tracking-wide">Toque no botão compartilhar</p>
                <p className={`text-[9px] ${t.subtext} font-bold mt-0.5`}>
                  O ícone de caixa com seta ↑ na barra inferior do Safari
                </p>
              </div>
            </div>
            <div className={`flex items-start gap-3 ${t.card} border rounded-2xl p-3`}>
              <span className="text-2xl shrink-0">2️⃣</span>
              <div>
                <p className="font-black text-[11px] uppercase tracking-wide">Role para baixo</p>
                <p className={`text-[9px] ${t.subtext} font-bold mt-0.5`}>
                  Procure a opção <span className="text-yellow-400">"Adicionar à Tela de Início"</span>
                </p>
              </div>
            </div>
            <div className={`flex items-start gap-3 ${t.card} border rounded-2xl p-3`}>
              <span className="text-2xl shrink-0">3️⃣</span>
              <div>
                <p className="font-black text-[11px] uppercase tracking-wide">Toque em "Adicionar"</p>
                <p className={`text-[9px] ${t.subtext} font-bold mt-0.5`}>
                  O app aparecerá na sua tela inicial como um app nativo!
                </p>
              </div>
            </div>
          </div>
        ) : (
          // Instruções Android (quando o Chrome ainda não liberou o prompt)
          <div className="space-y-4">
            <div className={`flex items-start gap-3 ${t.card} border rounded-2xl p-3`}>
              <span className="text-2xl shrink-0">1️⃣</span>
              <div>
                <p className="font-black text-[11px] uppercase tracking-wide">Toque no menu do Chrome</p>
                <p className={`text-[9px] ${t.subtext} font-bold mt-0.5`}>
                  Os três pontinhos <span className="text-yellow-400">⋮</span> no canto superior direito
                </p>
              </div>
            </div>
            <div className={`flex items-start gap-3 ${t.card} border rounded-2xl p-3`}>
              <span className="text-2xl shrink-0">2️⃣</span>
              <div>
                <p className="font-black text-[11px] uppercase tracking-wide">Selecione a opção</p>
                <p className={`text-[9px] ${t.subtext} font-bold mt-0.5`}>
                  <span className="text-yellow-400">"Adicionar à tela inicial"</span> ou{' '}
                  <span className="text-yellow-400">"Instalar app"</span>
                </p>
              </div>
            </div>
            <div className={`flex items-start gap-3 ${t.card} border rounded-2xl p-3`}>
              <span className="text-2xl shrink-0">3️⃣</span>
              <div>
                <p className="font-black text-[11px] uppercase tracking-wide">Confirme a instalação</p>
                <p className={`text-[9px] ${t.subtext} font-bold mt-0.5`}>
                  Pronto! O ícone aparece na sua tela inicial 🎉
                </p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => { setShowIosInstructions(false); dismissInstallBanner(); }}
          className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
        >
          Entendi!
        </button>
      </div>
    </div>
  );

  // ─── Modal de nickname ────────────────────────────────────────────────────
  // Foca o input apenas uma vez quando o modal abre
  useEffect(() => {
    if (!editingNickname) return;
    const timer = setTimeout(() => {
      const el = document.getElementById('nickname-input');
      if (el) (el as HTMLInputElement).focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [editingNickname]);

  const NicknameModal = () => (
    <div
      className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center p-4"
      onClick={() => setEditingNickname(null)}
    >
      <div
        className={`${t.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-4`}
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.25s ease-out' }}
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">
          ✏️ Apelido da Linha
        </p>
        <input
          id="nickname-input"
          type="text"
          placeholder="Ex: Meu trabalho, Casa da mãe..."
          value={nicknameInput}
          onChange={e => setNicknameInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveNickname()}
          maxLength={30}
          className={`w-full ${t.input} border rounded-2xl px-4 py-4 font-black outline-none focus:border-yellow-400 transition-all text-base`}
        />
        <div className="flex gap-3">
          <button
            onClick={() => { setNicknameInput(''); saveNickname(); }}
            className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border ${t.subtext} ${lightTheme ? 'border-gray-300' : 'border-white/10'}`}
          >
            Remover apelido
          </button>
          <button
            onClick={saveNickname}
            className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );

  // ─── App ──────────────────────────────────────────────────────────────────
  return (
    <div className={`h-screen w-screen ${t.bg} ${t.text} flex flex-col relative overflow-hidden transition-colors duration-300`}>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes staggerIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .stagger-card { animation: staggerIn 0.3s ease-out both; }
      `}</style>

      {editingNickname && <NicknameModal />}
      {showIosInstructions && <InstallInstructionsModal />}

      {/* Header */}
      <header className={`pt-[env(safe-area-inset-top)] ${t.header} border-b p-4 flex justify-between items-center shrink-0 z-50`}>
        <div className="font-black italic text-yellow-400 text-xl tracking-tighter skew-x-[-10deg]">
          CADÊ MEU BAÚ?
        </div>
        <div className="flex items-center gap-3">
          {/* Aviso de dados desatualizados */}
          {staleData && (
            <div className="text-[8px] font-black uppercase tracking-widest text-red-400 animate-pulse border border-red-500/30 px-2 py-1 rounded-xl">
              ⚠️ Sem internet
            </div>
          )}

          {((activeTab === 'search' && busLines.length > 0 && !isLoading) ||
            (activeTab === 'favs' && favoriteBusLines.length > 0 && !isFavoritesLoading)) && (
            <div className="text-right flex flex-col items-end">
              <span className={`text-[7px] font-black ${t.subtext} uppercase leading-none mb-0.5`}>Auto-Refresh</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-black text-yellow-400 tabular-nums leading-none">{countdown}s</span>
              </div>
            </div>
          )}

          {(isLoading || isFavoritesLoading) && (
            <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          )}

          {/* Toggle tema */}
          <button
            onClick={() => { setLightTheme(p => !p); haptic(30); }}
            className={`text-xl p-1.5 transition-all active:scale-110 ${t.subtext}`}
            aria-label="Alternar tema"
          >
            {lightTheme ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="flex-grow overflow-y-auto app-container px-4 pt-4 pb-32 space-y-5">

        {/* Banner de instalação */}
        {showInstallBanner && !isInstalled && <InstallBanner />}

        {/* ── ABA BUSCA ── */}
        {activeTab === 'search' && (
          <div className="page-enter space-y-5">
            <div className={`${t.inputWrap} border p-5 rounded-[2.5rem] shadow-2xl space-y-4`}>
              <div className="flex gap-2">
                <div className="flex-[3] relative">
                  <span className={`absolute left-4 top-2 text-[8px] font-black ${t.subtext} uppercase pointer-events-none`}>
                    Número do Ponto
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ex: 31700"
                    value={stopId}
                    onChange={e => setStopId(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`w-full ${t.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-xl`}
                  />
                </div>
                <div className="flex-[2] relative">
                  <span className={`absolute left-0 top-2 text-[8px] font-black ${t.subtext} uppercase text-center w-full pointer-events-none`}>
                    Linha (OPCIONAL)
                  </span>
                  <input
                    type="text"
                    placeholder="Ex: 327"
                    value={lineFilter}
                    onChange={e => setLineFilter(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`w-full ${t.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-xl text-center`}
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

              {/* Histórico */}
              {searchHistory.length > 0 && busLines.length === 0 && !isLoading && (
                <div>
                  <p className={`text-[8px] font-black ${t.subtext} uppercase tracking-widest mb-2 px-1`}>
                    Buscas Recentes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.map(h => (
                      <button
                        key={h}
                        onClick={() => { setStopId(h); handleSearch(h); haptic(30); }}
                        className={`${lightTheme ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-slate-800 border-white/10 text-yellow-400'} border text-xs font-black px-3 py-2 rounded-xl active:scale-95 transition-transform tracking-wider`}
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

            {/* Skeleton loading */}
            {isLoading && [0, 1, 2].map(i => (
              <div key={i} style={{ animationDelay: `${i * 80}ms` }} className="stagger-card">
                <SkeletonCard />
              </div>
            ))}

            {!isLoading && (
              <div className="space-y-4">
                {busLines.map((line, i) => (
                  <div key={line.id} className="stagger-card" style={{ animationDelay: `${i * 60}ms` }}>
                    <BusLineCard line={line} staggerIndex={i} />
                  </div>
                ))}
                {busLines.length === 0 && !errorMsg && (
                  <div className="py-20 text-center opacity-10 flex flex-col items-center">
                    <div className="text-9xl mb-6">🚍</div>
                    <p className={`font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed ${t.subtext}`}>
                      Aguardando número do ponto...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ABA FAVORITOS ── */}
        {activeTab === 'favs' && (
          <div className="page-enter space-y-4">
            <div className="flex items-center justify-between px-2 mb-4">
              <h2 className={`text-[10px] font-black uppercase tracking-[0.5em] ${t.subtext} flex items-center gap-2`}>
                <span className="text-yellow-400 text-lg">★</span> Minha Garagem
              </h2>
              {favorites.length > 0 && !isFavoritesLoading && (
                <button
                  onClick={() => { loadFavoritesSchedules(); haptic(30); }}
                  className={`text-[8px] font-black uppercase tracking-widest ${t.subtext} border ${lightTheme ? 'border-gray-300' : 'border-white/10'} px-3 py-2 rounded-xl active:scale-95 transition-transform`}
                >
                  🔄 Atualizar
                </button>
              )}
            </div>

            {/* Hint de toque longo */}
            {favorites.length > 0 && !isFavoritesLoading && (
              <p className={`text-[8px] font-black ${t.subtext} uppercase tracking-widest px-2 opacity-50`}>
                ✏️ Toque longo em um card para dar apelido
              </p>
            )}

            {/* Skeleton loading favoritos */}
            {isFavoritesLoading && favorites.length > 0 && (
              <div className="space-y-4">
                {favorites.slice(0, 3).map((_, i) => (
                  <div key={i} style={{ animationDelay: `${i * 80}ms` }} className="stagger-card">
                    <SkeletonCard />
                  </div>
                ))}
              </div>
            )}

            {/* Agrupado por ponto */}
            {!isFavoritesLoading && Object.entries(groupedFavLines).map(([pontoId, lines]) => (
              <div key={pontoId} className="space-y-3">
                <div className="flex items-center gap-2 px-1 pt-2">
                  <span className="text-yellow-400 text-sm">📍</span>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${t.subtext}`}>
                    Ponto {pontoId}
                  </span>
                  <div className={`flex-1 h-px ${lightTheme ? 'bg-gray-200' : 'bg-white/5'}`} />
                </div>
                {lines.map((line, i) => {
                  const key = `${line.stopSource ?? stopId}::${line.number}`;
                  return (
                    <div key={line.id} className="stagger-card" style={{ animationDelay: `${i * 60}ms` }}>
                      <BusLineCard
                        line={line}
                        isRemoving={removingFavKey === key}
                        staggerIndex={i}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

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
            <p className={`text-[10px] ${t.subtext} leading-relaxed uppercase tracking-[0.3em] font-black`}>
              Estamos preparando a visão em mapa para você ver o baú dobrando a esquina em tempo real.
            </p>
          </div>
        )}

      </div>

      {/* Nav */}
      <nav className={`fixed bottom-0 left-0 right-0 ${t.nav} border-t px-10 pb-12 pt-5 flex justify-between items-center z-50`}>
        <button
          onClick={() => { setActiveTab('search'); haptic(30); }}
          className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === 'search' ? 'text-yellow-400 scale-125' : t.inactiveNav}`}
        >
          <div className="text-2xl leading-none">{activeTab === 'search' ? '🔍' : '🔎'}</div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Busca</span>
        </button>

        <button
          onClick={() => { setActiveTab('favs'); haptic(30); }}
          className={`flex flex-col items-center gap-2 transition-all duration-300 relative ${activeTab === 'favs' ? 'text-yellow-400 scale-125' : t.inactiveNav}`}
        >
          <div className="text-2xl leading-none relative">
            {activeTab === 'favs' ? '★' : '☆'}
            {/* Badge contador */}
            {favCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-yellow-400 text-black text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {favCount > 9 ? '9+' : favCount}
              </span>
            )}
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Salvos</span>
        </button>

        <button
          onClick={() => { setActiveTab('map'); haptic(30); }}
          className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === 'map' ? 'text-yellow-400 scale-125' : t.inactiveNav}`}
        >
          <div className="text-2xl leading-none">📍</div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Mapa</span>
        </button>
      </nav>

    </div>
  );
};

export default App;
