import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
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

const haptic = (ms: number | number[] = 50) => {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
};

const shareLine = async (stopId: string, lineNumber: string) => {
  const url = `${window.location.origin}?ponto=${stopId}&linha=${lineNumber}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Cadê meu Baú?', text: `🚍 Linha ${lineNumber} — Ponto ${stopId}`, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copiado!');
    }
  } catch { /* cancelado */ }
};

// ─── Formata CPF enquanto digita ─────────────────────────────────────────────
const formatCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

// ─── Valida CPF com dígitos verificadores ─────────────────────────────────────
const isValidCpf = (cpf: string): boolean => {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 || r === 11 ? 0 : r;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
};

const SkeletonCard = ({ light }: { light: boolean }) => (
  <div className={`${light ? 'bg-white border-gray-200' : 'bg-slate-900 border-white/10'} border p-5 rounded-[2.5rem] flex flex-col gap-4 shadow-xl animate-pulse`}>
    <div className="flex items-center gap-4">
      <div className={`w-24 h-10 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-2xl`} />
      <div className="flex flex-col gap-2 flex-1">
        <div className={`h-3 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-full w-16`} />
        <div className={`h-4 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-full w-40`} />
        <div className={`h-3 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-full w-20`} />
      </div>
    </div>
    <div className="flex gap-2">
      <div className={`flex-1 h-24 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-[1.5rem]`} />
      <div className={`flex-1 h-24 ${light ? 'bg-gray-100' : 'bg-slate-800/60'} rounded-[1.5rem]`} />
    </div>
  </div>
);

// ─── Utilitários de tempo/urgência (fora do componente) ───────────────────────
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
      <span className={`font-black leading-none tracking-tighter ${isNext ? 'text-2xl' : 'text-xl'}`}>{timeStr}</span>
      <span className="text-[7px] font-black uppercase tracking-widest mt-0.5 opacity-80">MINUTO(S)</span>
      {isApprox && (
        <span className="text-[6px] font-black uppercase tracking-widest mt-1 opacity-80 text-center">
          IMPOSSÍVEL RASTREAR O BAÚ AGORA, MOSTRANDO TEMPO ESPECULADO!
        </span>
      )}
    </div>
  );
};

// ─── BusLineCard movido para FORA do App (evita remount a cada render) ────────
interface BusLineCardProps {
  line: BusLine;
  isRemoving?: boolean;
  staggerIndex?: number;
  stopId: string;
  favorites: FavoriteItem[];
  activeAlerts: Record<string, number>;
  lightTheme: boolean;
  theme: Record<string, string>;
  onToggleFavorite: (line: BusLine) => void;
  onStartLongPress: (key: string, nickname?: string) => void;
  onCancelLongPress: () => void;
  onRemoveAlert: (key: string) => void;
  onShowAlertModal: (key: string) => void;
  onShare: (stopId: string, lineNumber: string) => void;
}

const BusLineCard = memo(({
  line, isRemoving = false, staggerIndex = 0,
  stopId, favorites, activeAlerts, lightTheme, theme,
  onToggleFavorite, onStartLongPress, onCancelLongPress,
  onRemoveAlert, onShowAlertModal, onShare,
}: BusLineCardProps) => {
  const sId = line.stopSource ?? stopId;
  const key = `${sId}::${line.number}`;
  const isFav = favorites.some(f => f.stopId === sId && f.lineNumber === line.number);
  const favItem = favorites.find(f => f.stopId === sId && f.lineNumber === line.number);

  return (
    <div
      className={`${theme.card} border p-5 rounded-[2.5rem] flex flex-col gap-4 shadow-xl active:scale-[0.98]`}
      style={{
        opacity: isRemoving ? 0 : 1,
        transform: isRemoving ? 'scale(0.92) translateY(-8px)' : undefined,
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        animationDelay: `${staggerIndex * 60}ms`,
      }}
      onTouchStart={() => isFav && onStartLongPress(key, favItem?.nickname)}
      onTouchEnd={onCancelLongPress}
      onTouchMove={onCancelLongPress}
      onMouseDown={() => isFav && onStartLongPress(key, favItem?.nickname)}
      onMouseUp={onCancelLongPress}
      onMouseLeave={onCancelLongPress}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="text-4xl font-black text-yellow-400 italic w-24 shrink-0 text-center leading-none tracking-tighter drop-shadow-[0_2px_10px_rgba(251,191,36,0.2)]">
            {line.number}
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            {favItem?.nickname && (
              <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-0.5">✏️ {favItem.nickname}</span>
            )}
            <div className="mb-1 pr-2 min-w-0 flex flex-col">
              <span className={`text-[9px] font-bold ${theme.subtext} uppercase tracking-widest`}>INDO PARA:</span>
              <span className={`font-black text-[13px] uppercase ${theme.destText} leading-tight break-words`}>{line.destination}</span>
            </div>
            {line.stopSource && (
              <div className={`text-[8px] font-bold ${theme.stopBadge} uppercase tracking-widest mb-1`}>📍 PONTO {line.stopSource}</div>
            )}
            <div className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${theme.subtext}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${line.nextArrival?.toLowerCase().includes('aprox') ? 'bg-red-500' : 'bg-emerald-500'}`} />
              {line.nextArrival?.toLowerCase().includes('aprox') ? 'Offline' : 'Online agora'}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 shrink-0">
          <button onClick={e => { e.stopPropagation(); onToggleFavorite(line); }}
            className={`text-3xl transition-all duration-200 active:scale-150 p-2 ${isFav ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : theme.inactiveNav}`}>
            {isFav ? '★' : '☆'}
          </button>
          <button onClick={e => {
              e.stopPropagation();
              if (activeAlerts[key]) { onRemoveAlert(key); }
              else { onShowAlertModal(key); }
              haptic(30);
            }}
            className={`text-lg p-1.5 transition-all active:scale-125 ${activeAlerts[key] ? 'text-yellow-400' : theme.subtext}`}
            title={activeAlerts[key] ? `Alerta: ${activeAlerts[key]} min — toque para remover` : 'Criar alerta'}>
            {activeAlerts[key] ? '🔔' : '🔕'}
          </button>
          <button onClick={e => { e.stopPropagation(); onShare(sId, line.number); haptic(30); }}
            className={`text-lg p-1.5 transition-all active:scale-125 ${theme.subtext}`}>
            🔗
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <div className={`flex-1 ${theme.timeCard1} rounded-[1.5rem] p-4 border flex flex-col items-center justify-center min-h-[95px]`}>
          <span className={`block text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2`}>Chega em:</span>
          {renderTimeDisplay(line.nextArrival ?? 'SEM PREVISÃO', true)}
        </div>
        <div className={`flex-1 ${theme.timeCard2} rounded-[1.5rem] p-4 border flex flex-col items-center justify-center min-h-[95px] opacity-90`}>
          <span className={`block text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2`}>Próximo em:</span>
          {renderTimeDisplay(line.subsequentArrival ?? 'SEM PREVISÃO', false)}
        </div>
      </div>
    </div>
  );
});

// ─── App principal ────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'favs' | 'sitpass' | 'map'>('search');
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

  // ─── FIX: bug de tema claro no SitPass ───────────────────────────────────
  const [lightTheme, setLightTheme] = useState(() => {
    try { return localStorage.getItem('cade_meu_bau_theme') === 'light'; } catch { return false; }
  });

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches
  );
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_app_favs') || '[]'); } catch { return []; }
  });
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_search_history') || '[]'); } catch { return []; }
  });
  const [activeAlerts, setActiveAlerts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_alerts') || '{}'); } catch { return {}; }
  });
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    () => ('Notification' in window ? Notification.permission : 'denied')
  );
  const [showAlertModal, setShowAlertModal] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // ─── SitPass: CPF com máscara e validação ────────────────────────────────
  const [cpfSitpass, setCpfSitpass] = useState('');
  const [saldoHistorico, setSaldoHistorico] = useState<{
    saldo_formatado: string;
    cartaoDescricao: string;
    data: string;
    hora: string;
  } | null>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_saldo_historico') || 'null'); } catch { return null; }
  });
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [saldoData, setSaldoData] = useState<{
    cartaoNumero: string;
    cartaoDescricao: string;
    saldo: string;
    saldo_formatado: string;
  } | null>(null);
  const [saldoLoading, setSaldoLoading] = useState(false);
  const [saldoErro, setSaldoErro] = useState<string | null>(null);

  // ─── Favoritos com pontos inativos ───────────────────────────────────────
  const [inactiveStops, setInactiveStops] = useState<Set<string>>(new Set());

  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // ─── Mapa ─────────────────────────────────────────────────────────────────
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [selectedStop, setSelectedStop] = useState<{id: string; nome: string} | null>(null);
  const [stopLines, setStopLines] = useState<BusLine[]>([]);
  const [stopLinesLoading, setStopLinesLoading] = useState(false);
  const [stopLinesError, setStopLinesError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const busMarkersRef = useRef<any[]>([]);
  const [mapRefreshCountdown, setMapRefreshCountdown] = useState(15);
  const mapRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedStopRef = useRef<{id: string; nome: string} | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSearchingRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTabRef = useRef<string>('');

  // Refs estáveis para usar dentro de callbacks/intervals sem stale closure
  const activeAlertsRef = useRef(activeAlerts);
  useEffect(() => { activeAlertsRef.current = activeAlerts; }, [activeAlerts]);

  const baseUrl = '/api/ponto';

  const theme = {
    bg:          lightTheme ? 'bg-gray-100'            : 'bg-black',
    text:        lightTheme ? 'text-gray-900'           : 'text-white',
    card:        lightTheme ? 'bg-white border-gray-200'          : 'bg-slate-900 border-white/10',
    header:      lightTheme ? 'bg-white/90 border-gray-200'       : 'bg-slate-900/90 border-white/10',
    nav:         lightTheme ? 'bg-white border-gray-200 shadow-[0_-20px_60px_rgba(0,0,0,0.1)]' : 'bg-slate-900 border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,1)]',
    input:       lightTheme ? 'bg-gray-100 border-gray-300 text-gray-900' : 'bg-black border-white/10 text-yellow-400',
    inputWrap:   lightTheme ? 'bg-white border-gray-200'          : 'bg-slate-900 border-white/5',
    subtext:     lightTheme ? 'text-gray-500'           : 'text-slate-500',
    divider:     lightTheme ? 'bg-gray-200'             : 'bg-white/5',
    inactiveNav: lightTheme ? 'text-gray-400'           : 'text-slate-600',
    timeCard1:   lightTheme ? 'bg-gray-100 border-gray-200'       : 'bg-black/60 border-white/5',
    timeCard2:   lightTheme ? 'bg-gray-50 border-gray-200'        : 'bg-black/30 border-white/5',
    destText:    lightTheme ? 'text-gray-900'           : 'text-white',
    stopBadge:   lightTheme ? 'text-gray-400'           : 'text-slate-600',
    historyBtn:  lightTheme ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-slate-800 border-white/10 text-yellow-400',
    // FIX: saldo text usa variável de tema em vez de text-white fixo
    saldoText:   lightTheme ? 'text-gray-900'           : 'text-white',
  };

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ponto = params.get('ponto');
    const linha = params.get('linha');
    if (ponto) { setStopId(ponto); if (linha) setLineFilter(linha); }
  }, []);

  useEffect(() => {
    if (isInstalled) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const dismissed = localStorage.getItem('cade_meu_bau_install_dismissed');
    if (isIos && isSafari && !dismissed) {
      const timer = setTimeout(() => setShowInstallBanner(true), 3000);
      return () => clearTimeout(timer);
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      if (!dismissed) setShowInstallBanner(true);
    };
    const installedHandler = () => { setIsInstalled(true); setShowInstallBanner(false); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    const fallback = setTimeout(() => { if (!dismissed) setShowInstallBanner(true); }, 4000);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      clearTimeout(fallback);
    };
  }, [isInstalled]);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setIsSplash(false);
      if (favorites.length > 0) {
        setActiveTab('favs');
      } else {
        const seen = localStorage.getItem('cade_meu_bau_onboarding_done');
        if (!seen) setShowOnboarding(true);
      }
    }, SPLASH_DURATION);
    return () => clearTimeout(splashTimer);
  }, []); // eslint-disable-line

  useEffect(() => {
    localStorage.setItem('cade_meu_bau_theme', lightTheme ? 'light' : 'dark');
  }, [lightTheme]);

  // ─── Detecção de atualização do Service Worker ────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      swRegistrationRef.current = reg;

      // Verifica se já há um SW aguardando (update pendente ao abrir o app)
      if (reg.waiting) {
        setShowUpdateBanner(true);
      }

      // Escuta novas atualizações enquanto o app está aberto
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setShowUpdateBanner(true);
          }
        });
      });
    });

    // Quando o SW muda (após skipWaiting), recarrega a página
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const applyUpdate = () => {
    const reg = swRegistrationRef.current;
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdateBanner(false);
  };

  useEffect(() => {
    if (!editingNickname) return;
    const focusTimer = setTimeout(() => {
      const el = document.getElementById('nickname-input');
      if (el) (el as HTMLInputElement).focus();
    }, 350);
    return () => clearTimeout(focusTimer);
  }, [editingNickname]);

  // ─── Lógica de busca ──────────────────────────────────────────────────────

  const normalizeTime = (time: unknown): string => {
    if (time === null || time === undefined) return 'SEM PREVISÃO';
    const str = String(time).trim();
    if (!str || /^[-.]+$/.test(str) || str === 'SEM PREVISÃO' || str === '....') return 'SEM PREVISÃO';
    return str.replace(/\s*min(utos?)?/gi, '');
  };

  type SearchResult = { lines: BusLine[]; error?: 'offline' | 'not_found' | 'no_lines' | 'invalid_stop' | 'inactive_stop' };

  const performSearch = useCallback(async (sId: string, lFilter: string): Promise<SearchResult> => {
    if (!sId) return { lines: [], error: 'invalid_stop' };
    try {
      let url = `${baseUrl}?ponto=${sId.trim()}`;
      if (lFilter.trim()) url += `&linha=${lFilter.trim()}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      // FIX: distingue ponto inativo (404) de genérico not_found
      if (res.status === 404) return { lines: [], error: 'not_found' };
      if (!res.ok) return { lines: [], error: 'offline' };

      const data = await res.json();

      if (data?.horarios && Array.isArray(data.horarios)) {
        if (data.horarios.length === 0) return { lines: [], error: lFilter ? 'no_lines' : 'not_found' };
        return {
          lines: data.horarios.map((item: Record<string, unknown>, index: number) => {
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
          })
        };
      }
      return { lines: [], error: 'not_found' };
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return { lines: [], error: isAbort ? 'offline' : 'offline' };
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

  // FIX: merge inteligente — só substitui objetos cujos horários mudaram
  // Preserva a referência dos cards inalterados → memo() funciona → sem re-render visual
  const mergeLines = useCallback((prev: BusLine[], next: BusLine[]): BusLine[] => {
    if (prev.length !== next.length) return next;
    let changed = false;
    const merged = prev.map((oldLine, i) => {
      const newLine = next[i];
      if (!newLine) return oldLine;
      if (
        oldLine.nextArrival === newLine.nextArrival &&
        oldLine.subsequentArrival === newLine.subsequentArrival &&
        oldLine.destination === newLine.destination
      ) {
        return oldLine; // mesma referência → memo bloqueia re-render
      }
      changed = true;
      return { ...oldLine, nextArrival: newLine.nextArrival, subsequentArrival: newLine.subsequentArrival };
    });
    return changed ? merged : prev;
  }, []);

  const handleSearch = useCallback(async (forcedId?: string, forcedFilter?: string) => {
    const idToSearch = forcedId ?? stopId;
    if (!idToSearch || isSearchingRef.current) return;
    isSearchingRef.current = true;
    // Só exibe skeleton na primeira busca (sem cards ainda)
    setBusLines(prev => { if (prev.length === 0) setIsLoading(true); return prev; });
    setErrorMsg(null);
    setStaleData(false);
    try {
      const { lines, error } = await performSearch(idToSearch, forcedFilter ?? lineFilter);
      // FIX: merge inteligente — só muda objetos cujos horários realmente mudaram
      // Cards sem alteração mantêm a mesma referência → memo() bloqueia re-render
      setBusLines(prev => prev.length === 0 ? lines : mergeLines(prev, lines));
      if (error === 'offline') { setStaleData(true); setErrorMsg('offline'); }
      else if (error === 'not_found') setErrorMsg('not_found');
      else if (error === 'no_lines') setErrorMsg('no_lines');
      else if (error === 'invalid_stop') setErrorMsg('invalid_stop');
      if (lines.length > 0) addToHistory(idToSearch);
    } catch { setStaleData(true); setErrorMsg('offline'); }
    finally { setIsLoading(false); setCountdown(REFRESH_INTERVAL); isSearchingRef.current = false; }
  }, [stopId, lineFilter, performSearch, addToHistory, mergeLines]);

  // FIX: loadFavoritesSchedules agora identifica pontos inativos e avisa o usuário
  const loadFavoritesSchedules = useCallback(async () => {
    if (favorites.length === 0) return;
    // Só exibe skeleton na primeira carga (sem cards ainda)
    setFavoriteBusLines(prev => { if (prev.length === 0) setIsFavoritesLoading(true); return prev; });
    setStaleData(false);
    try {
      const results = await Promise.all(favorites.map(fav => performSearch(fav.stopId, fav.lineNumber)));
      const allLines = results.flatMap(r => r.lines);
      const hasOffline = results.some(r => r.error === 'offline');

      // Detecta pontos que retornaram not_found (possivelmente desativados)
      const newInactive = new Set<string>();
      results.forEach((r, i) => {
        if (r.error === 'not_found' || r.error === 'inactive_stop') {
          newInactive.add(favorites[i].stopId);
        }
      });
      setInactiveStops(newInactive);

      // FIX: merge inteligente nos favoritos também
      setFavoriteBusLines(prev => prev.length === 0 ? allLines : mergeLines(prev, allLines));
      if (hasOffline) setStaleData(true);
    } catch { setStaleData(true); }
    finally { setIsFavoritesLoading(false); setCountdown(REFRESH_INTERVAL); }
  }, [favorites, performSearch, mergeLines]);

  useEffect(() => {
    if (activeTab === 'favs' && prevTabRef.current !== 'favs' && favorites.length > 0) {
      loadFavoritesSchedules();
    }
    prevTabRef.current = activeTab;
  }, [activeTab]); // eslint-disable-line

  // FIX: refs estáveis para callbacks e aba atual — evita closure stale no interval
  const handleSearchRef = useRef(handleSearch);
  const loadFavoritesRef = useRef(loadFavoritesSchedules);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { handleSearchRef.current = handleSearch; }, [handleSearch]);
  useEffect(() => { loadFavoritesRef.current = loadFavoritesSchedules; }, [loadFavoritesSchedules]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  useEffect(() => {
    const shouldRun =
      (activeTab === 'search' && busLines.length > 0 && !isLoading) ||
      (activeTab === 'favs' && favoriteBusLines.length > 0 && !isFavoritesLoading);

    if (timerRef.current) clearInterval(timerRef.current);
    if (!shouldRun) { setCountdown(REFRESH_INTERVAL); return; }

    // Reinicia o countdown ao trocar de aba ou ao receber novos dados
    setCountdown(REFRESH_INTERVAL);

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Lê a aba atual via ref — nunca stale
          if (activeTabRef.current === 'search') handleSearchRef.current();
          else loadFavoritesRef.current();
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

  // FIX: long press cancela também ao scroll
  const startLongPress = useCallback((key: string, currentNickname?: string) => {
    longPressTimerRef.current = setTimeout(() => {
      haptic(100);
      setEditingNickname(key);
      setNicknameInput(currentNickname ?? '');
    }, 600);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

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

  // ─── Notificações ─────────────────────────────────────────────────────────

  const requestNotifPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    return result === 'granted';
  };

  const sendNotification = async (title: string, body: string) => {
    if (Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: 'cade-meu-bau',
          renotify: true,
          vibrate: [200, 100, 200],
        } as NotificationOptions & { renotify: boolean; vibrate: number[] });
      } else {
        new Notification(title, { body, icon: '/icons/icon-192x192.png' });
      }
    } catch (err) {
      console.warn('Notificação falhou:', err);
      try { new Notification(title, { body }); } catch { /* ignore */ }
    }
  };

  // FIX: removeAlert estável via ref para não causar stale closure no checkAlerts
  const removeAlert = useCallback((lineKey: string) => {
    haptic(40);
    setActiveAlerts(prev => {
      const next = { ...prev };
      delete next[lineKey];
      localStorage.setItem('cade_meu_bau_alerts', JSON.stringify(next));
      return next;
    });
  }, []);

  const setAlert = async (lineKey: string, minutes: number) => {
    const granted = await requestNotifPermission();
    if (!granted) {
      alert('Permissão de notificação negada. Ative nas configurações do navegador.');
      return;
    }
    haptic([40, 30, 60]);
    setActiveAlerts(prev => {
      const next = { ...prev, [lineKey]: minutes };
      localStorage.setItem('cade_meu_bau_alerts', JSON.stringify(next));
      return next;
    });
    setShowAlertModal(null);
    await sendNotification('🚍 Alerta configurado!', `Você será avisado quando o baú estiver a ${minutes} min.`);
  };

  // FIX: checkAlerts usa activeAlertsRef (ref estável) em vez de closure stale
  const checkAlerts = useCallback(async (lines: BusLine[]) => {
    const alerts = activeAlertsRef.current;
    if (Object.keys(alerts).length === 0) return;
    for (const line of lines) {
      const key = `${line.stopSource ?? ''}::${line.number}`;
      const alertMinutes = alerts[key];
      if (alertMinutes === undefined) continue;
      const nextStr = line.nextArrival ?? '';
      if (nextStr === 'SEM PREVISÃO') continue;
      const isNow = nextStr.toLowerCase().includes('agora');
      const mins = isNow ? 0 : parseInt(nextStr.replace(/\D/g, '')) || 999;
      if (mins <= alertMinutes) {
        const msg = isNow
          ? `O baú ${line.number} está chegando AGORA no ponto ${line.stopSource}!`
          : `O baú ${line.number} chega em ${mins} min no ponto ${line.stopSource}!`;
        await sendNotification('🚍 Baú chegando!', msg);
        haptic([100, 50, 100]);
        removeAlert(key);
      }
    }
  }, [removeAlert]); // removeAlert é estável (useCallback sem deps)

  useEffect(() => {
    if (busLines.length > 0) checkAlerts(busLines);
  }, [busLines, checkAlerts]);

  useEffect(() => {
    if (favoriteBusLines.length > 0) checkAlerts(favoriteBusLines);
  }, [favoriteBusLines, checkAlerts]);

  // ─── SitPass com validação de CPF ─────────────────────────────────────────
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCpf(e.target.value);
    setCpfSitpass(formatted);
    setCpfError(null);
  };

  const consultarSaldo = async () => {
    const cpfLimpo = cpfSitpass.replace(/\D/g, '');
    if (!cpfLimpo) { setCpfError('Digite seu CPF.'); return; }
    if (cpfLimpo.length !== 11) { setCpfError('CPF incompleto.'); return; }
    if (!isValidCpf(cpfLimpo)) { setCpfError('CPF inválido. Verifique os dígitos.'); return; }

    setSaldoLoading(true);
    setSaldoErro(null);
    setSaldoData(null);
    setCpfError(null);

    // FIX: timeout na chamada SitPass
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch(`https://sitpass.cj22233333.workers.dev/saldo?cpf=${cpfLimpo}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.ok) {
        setSaldoData(data);
        // Salva última consulta no histórico
        const agora = new Date();
        const historico = {
          saldo_formatado: data.saldo_formatado,
          cartaoDescricao: data.cartaoDescricao,
          data: agora.toLocaleDateString('pt-BR'),
          hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        };
        setSaldoHistorico(historico);
        localStorage.setItem('cade_meu_bau_saldo_historico', JSON.stringify(historico));
      }
      else setSaldoErro(data.erro ?? 'Erro ao consultar saldo.');
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setSaldoErro(isAbort ? 'Tempo esgotado. Tente novamente.' : 'Sem conexão. Tente novamente.');
    } finally {
      setSaldoLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleInstall = async () => {
    haptic(50);
    if (deferredInstallPrompt) {
      (deferredInstallPrompt as unknown as { prompt: () => void }).prompt();
      setShowInstallBanner(false);
    } else {
      setShowIosInstructions(true);
    }
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('cade_meu_bau_install_dismissed', 'true');
    haptic(30);
  };

  const groupedFavLines = favoriteBusLines.reduce<Record<string, BusLine[]>>((acc, line) => {
    const key = line.stopSource ?? 'desconhecido';
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {});

  const favCount = favorites.length;
  const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);

  // FIX: useMemo garante que o objeto só muda quando as dependências realmente mudam
  // sem isso, o memo() no BusLineCard nunca funciona (objeto novo = referência nova)
  const cardProps = useMemo(() => ({
    stopId,
    favorites,
    activeAlerts,
    lightTheme,
    theme,
    onToggleFavorite: toggleFavorite,
    onStartLongPress: startLongPress,
    onCancelLongPress: cancelLongPress,
    onRemoveAlert: removeAlert,
    onShowAlertModal: setShowAlertModal,
    onShare: shareLine,
  }), [stopId, favorites, activeAlerts, lightTheme, theme, toggleFavorite, startLongPress, cancelLongPress, removeAlert]);


  // ─── Busca linhas do ponto e markers de ônibus em tempo real ──────────────
  const buscarLinhasPonto = useCallback(async (pontoId: string) => {
    if (!pontoId) return;
    setStopLinesLoading(true);
    setStopLinesError(null);
    setStopLines([]);

    // Remove markers de ônibus anteriores
    busMarkersRef.current.forEach(m => m.remove());
    busMarkersRef.current = [];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`https://bot-onibus.vercel.app/api/ponto?ponto=${pontoId}`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) { setStopLinesError('offline'); setStopLinesLoading(false); return; }
      const data = await res.json();
      if (!data?.horarios?.length) { setStopLinesError('not_found'); setStopLinesLoading(false); return; }

      const norm = (t: unknown) => {
        if (!t) return 'SEM PREVISÃO';
        const s = String(t).trim();
        return (!s || s === '....' || /^[-.\s]+$/.test(s)) ? 'SEM PREVISÃO' : s.replace(/\s*min(utos?)?/gi, '');
      };

      const lines: BusLine[] = data.horarios.map((item: Record<string, unknown>, i: number) => {
        const raw = String(item.linha ?? '').trim();
        return {
          id: `map-${pontoId}-${item.linha}-${i}`,
          number: raw.length === 1 ? `NS${raw}` : raw,
          name: raw,
          origin: '',
          destination: String(item.destino ?? 'Destino não informado'),
          schedules: [],
          frequencyMinutes: 0,
          status: 'Normal' as const,
          nextArrival: norm(item.proximo ?? item.previsao),
          subsequentArrival: norm(item.seguinte),
          stopSource: pontoId,
        };
      });

      setStopLines(lines);
      setStopLinesLoading(false);

      // Busca posição dos ônibus em tempo real para cada linha
      if (!leafletMapRef.current) return;
      const L = (window as any).L;
      if (!L) return;

      const linhasUnicas = [...new Set(lines.map(l => l.number))];

      await Promise.all(linhasUnicas.map(async (numLinha) => {
        try {
          console.log(`[Mapa] Buscando ônibus em tempo real — linha ${numLinha}`);
          const r = await fetch(`/api/realtimebus?linha=${numLinha}`);
          console.log(`[Mapa] Status da resposta linha ${numLinha}:`, r.status);
          if (!r.ok) { console.warn(`[Mapa] Erro na linha ${numLinha}:`, r.status); return; }
          const onibus = await r.json();
          console.log(`[Mapa] Ônibus retornados linha ${numLinha}:`, onibus);
          if (!Array.isArray(onibus)) { console.warn(`[Mapa] Resposta não é array:`, onibus); return; }
          if (onibus.length === 0) { console.log(`[Mapa] Nenhum ônibus em operação na linha ${numLinha}`); return; }

          onibus.forEach((bus: { lat: number; lng: number; destino: string; numero: string }) => {
            console.log(`[Mapa] Ônibus ${bus.numero} — lat:${bus.lat} lng:${bus.lng} destino:${bus.destino}`);
            if (!bus.lat || !bus.lng) { console.warn(`[Mapa] Ônibus sem coordenadas:`, bus); return; }
            const busIcon = L.divIcon({
              html: `<div style="position:relative;width:36px;height:36px;background:#000;border-radius:8px;border:2px solid #fbbf24;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5);font-size:18px;">🚍<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #fbbf24;"></div></div>`,
              className: '',
              iconSize: [36, 42],
              iconAnchor: [18, 42],
            });
            const marker = L.marker([bus.lat, bus.lng], { icon: busIcon })
              .addTo(leafletMapRef.current)
              .bindPopup(`<b>Linha ${numLinha}</b><br>${bus.destino || 'N/A'}`);
            busMarkersRef.current.push(marker);
          });
          console.log(`[Mapa] ${busMarkersRef.current.length} markers de ônibus no mapa`);
        } catch (err) { console.error(`[Mapa] Erro na linha ${numLinha}:`, err); }
      }));

    } catch {
      setStopLinesError('offline');
      setStopLinesLoading(false);
    }
  }, []);

  // ─── Recalcula tamanho do mapa ao voltar para a aba ───────────────────────
  useEffect(() => {
    if (activeTab !== 'map') return;
    if (!leafletMapRef.current) return;
    // Pequeno delay para o display:block ter efeito antes do invalidateSize
    const t = setTimeout(() => {
      leafletMapRef.current.invalidateSize();
    }, 50);
    return () => clearTimeout(t);
  }, [activeTab]);

  // ─── Auto-refresh do tempo real no mapa ────────────────────────────────────
  useEffect(() => { selectedStopRef.current = selectedStop; }, [selectedStop]);

  useEffect(() => {
    if (!selectedStop) {
      // Limpa timer ao fechar o bottom sheet
      if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current);
      setMapRefreshCountdown(15);
      return;
    }

    setMapRefreshCountdown(15);
    if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current);

    mapRefreshTimerRef.current = setInterval(() => {
      setMapRefreshCountdown(prev => {
        if (prev <= 1) {
          // Só atualiza posição dos ônibus, não os horários
          const stop = selectedStopRef.current;
          if (stop) buscarLinhasPonto(stop.id);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current); };
  }, [selectedStop, buscarLinhasPonto]);

  // ─── Inicializa o mapa Leaflet ───────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'map') return;
    if (leafletMapRef.current) return; // já inicializado

    const PONTOS: Array<{id:string; lat:number; lng:number; nome:string}> = [{"id":"05946","lat":-16.7049489,"lng":-49.0957447,"nome":"Av. Dom Emanuel (05946)"},{"id":"05369","lat":-16.70231,"lng":-49.09807,"nome":"Av. Dom Emanuel (05369)"},{"id":"04733","lat":-16.70058,"lng":-49.10065,"nome":"Av. Progresso (04733)"},{"id":"04734","lat":-16.70166,"lng":-49.10321,"nome":"Av. Progresso (04734)"},{"id":"07662","lat":-16.70736,"lng":-49.08962,"nome":"Rua 5 (07662)"},{"id":"09615","lat":-16.70412,"lng":-49.08969,"nome":"Rua Gumercindo Nascimento (09615)"},{"id":"07663","lat":-16.70435,"lng":-49.08793,"nome":"Av. Perimetral (07663)"},{"id":"09643","lat":-16.70399,"lng":-49.08935,"nome":"Rua Sebastiao Lobo (09643)"},{"id":"07363","lat":-16.74004,"lng":-49.07166,"nome":"Av. Juca Ferreira (07363)"},{"id":"07364","lat":-16.73797,"lng":-49.07032,"nome":"Rua Francisco Tavares (07364)"},{"id":"07365","lat":-16.73608,"lng":-49.07079,"nome":"Rua Arlindo F. dos Santos (07365)"},{"id":"07713","lat":-16.73999,"lng":-49.07444,"nome":"Rua Jose Ferreira Filho (07713)"},{"id":"07360","lat":-16.73661,"lng":-49.07404,"nome":"Rua Arlindo F. dos Santos (07360)"},{"id":"07361","lat":-16.73654,"lng":-49.07392,"nome":"Rua Arlindo F. dos Santos (07361)"},{"id":"09170","lat":-16.73652,"lng":-49.07754,"nome":"Rua Tiradentes (09170)"},{"id":"07358","lat":-16.73622,"lng":-49.0808,"nome":"Rua 1 (07358)"},{"id":"09172","lat":-16.73336,"lng":-49.0777,"nome":"Rua 18 (09172)"},{"id":"09173","lat":-16.7322026,"lng":-49.0786252,"nome":"Rua Rr-7 (09173)"},{"id":"08423","lat":-16.7330106,"lng":-49.0822882,"nome":"Rua Rr-07 (08423)"},{"id":"09169","lat":-16.73631,"lng":-49.08415,"nome":"Rua Tiradentes (09169)"},{"id":"06915","lat":-16.73744,"lng":-49.08645,"nome":"Rua Rl-1 (06915)"},{"id":"08531","lat":-16.7375581,"lng":-49.0872059,"nome":"Rua Rl-1 (08531)"},{"id":"06916","lat":-16.73584,"lng":-49.08444,"nome":"Rua Monteiro Lobato (06916)"},{"id":"08530","lat":-16.73525,"lng":-49.08457,"nome":"Rua Monteiro Lobato (08530)"},{"id":"08529","lat":-16.73214,"lng":-49.08512,"nome":"Rua Monteiro Lobato (08529)"},{"id":"06428","lat":-16.73216,"lng":-49.08501,"nome":"Rua Monteiro Lobato (06428)"},{"id":"06426","lat":-16.7344,"lng":-49.08847,"nome":"Av. Goias (06426)"},{"id":"09417","lat":-16.73383,"lng":-49.08915,"nome":"Estrada Sc-05 (09417)"},{"id":"09421","lat":-16.7339,"lng":-49.08903,"nome":"Estrada Sc-05 (09421)"},{"id":"05401","lat":-16.7317921,"lng":-49.0890118,"nome":"Rua Dormever J. Ferreira (05401)"},{"id":"08533","lat":-16.73174,"lng":-49.08935,"nome":"Av. Pedro Miranda (08533)"},{"id":"08544","lat":-16.73182,"lng":-49.0896,"nome":"Av. Pedro Miranda (08544)"},{"id":"06429","lat":-16.72931,"lng":-49.08503,"nome":"Rua Santo Antonio (06429)"},{"id":"06430","lat":-16.72903,"lng":-49.0877,"nome":"Av. Castro Alves (06430)"},{"id":"08527","lat":-16.72896,"lng":-49.08783,"nome":"Av. Castro Alves (08527)"},{"id":"08836","lat":-16.72374,"lng":-49.08467,"nome":"Av. Pres. Vargas (08836)"},{"id":"08837","lat":-16.72014,"lng":-49.08488,"nome":"Av. Pres. Vargas (08837)"},{"id":"08838","lat":-16.71712,"lng":-49.08506,"nome":"Av. Pres. Vargas (08838)"},{"id":"08839","lat":-16.71459,"lng":-49.08525,"nome":"Av. Pres. Vargas (08839)"},{"id":"08842","lat":-16.71416,"lng":-49.0816,"nome":"Av. dos Eucaliptos (08842)"},{"id":"08843","lat":-16.71203,"lng":-49.08377,"nome":"Av. dos Eucaliptos (08843)"},{"id":"05677","lat":-16.71277,"lng":-49.08728,"nome":"Av. Pres. Alves de Castro (05677)"},{"id":"05412","lat":-16.71399,"lng":-49.088,"nome":"Av. Sen. Canedo (05412)"},{"id":"05413","lat":-16.7138,"lng":-49.08786,"nome":"Av. Sen. Canedo (05413)"},{"id":"05415","lat":-16.71737,"lng":-49.0876,"nome":"Av. Sen. Canedo (05415)"},{"id":"05414","lat":-16.7174,"lng":-49.08776,"nome":"Av. Sen. Canedo (05414)"},{"id":"00300","lat":-16.78569,"lng":-49.27775,"nome":"Av. Escultor Veiga Valle (00300)"}];

    // Carrega Leaflet via script tag
    const loadLeaflet = () => new Promise<void>((resolve) => {
      if ((window as any).L) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    });

    loadLeaflet().then(() => {
      if (!mapRef.current || leafletMapRef.current) return;
      const L = (window as any).L;

      // Centro padrão: Senador Canedo
      const defaultCenter: [number, number] = [-16.7200, -49.0900];

      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: 14,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      // Zoom control no canto direito
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Ícone customizado amarelo
      const busIcon = L.divIcon({
        html: `<div style="
          width:32px; height:32px;
          background:#fbbf24;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:2px solid #000;
          box-shadow:0 2px 8px rgba(0,0,0,0.4);
          display:flex; align-items:center; justify-content:center;
        "><span style="transform:rotate(45deg); font-size:14px; display:block; text-align:center; line-height:28px;">🚌</span></div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      // Adiciona markers de todos os pontos
      PONTOS.forEach(ponto => {
        const marker = L.marker([ponto.lat, ponto.lng], { icon: busIcon })
          .addTo(map)
          .on('click', () => {
            setSelectedStop({ id: ponto.id, nome: ponto.nome });
            buscarLinhasPonto(ponto.id);
            haptic(40);
          });
        markersRef.current.push(marker);
      });

      leafletMapRef.current = map;
      setMapReady(true);

      // Tenta pegar localização do usuário
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            setUserLocation({ lat: latitude, lng: longitude });

            // Marker do usuário
            const userIcon = L.divIcon({
              html: `<div style="
                width:20px; height:20px;
                background:#3b82f6;
                border-radius:50%;
                border:3px solid #fff;
                box-shadow:0 0 0 3px rgba(59,130,246,0.4);
              "></div>`,
              className: '',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });

            L.marker([latitude, longitude], { icon: userIcon })
              .addTo(map)
              .bindPopup('Você está aqui');

            // Centraliza no usuário e ajusta zoom
            map.setView([latitude, longitude], 15);
          },
          () => {
            setLocationError(true);
          },
          { timeout: 8000, enableHighAccuracy: true }
        );
      }
    });

    return () => {
      // Não destroi o mapa ao trocar de aba — preserva estado
    };
  }, [activeTab]);

  // ─── Splash ───────────────────────────────────────────────────────────────

  if (isSplash) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-10 overflow-hidden text-center">
        <div className="relative mb-8 flex flex-col items-center scale-110">
          <div className="w-40 h-40 bg-yellow-400 rounded-[3rem] flex items-center justify-center shadow-[0_0_50px_rgba(251,191,36,0.4)] mb-8 transform rotate-[-5deg] overflow-hidden">
            <img src="/logo.png" alt="Cadê meu Baú" className="w-32 h-32 object-contain"
              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-8xl">🚍</span>'; }} />
          </div>
          <div className="bg-yellow-400 text-black px-6 py-2 font-black italic text-2xl skew-x-[-12deg] shadow-[8px_8px_0px_rgba(251,191,36,0.3)] uppercase tracking-tighter">
            Cadê meu Baú?
          </div>
        </div>
        <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full bg-yellow-400 w-1/2 animate-[loading_1.5s_infinite_linear]" />
        </div>
        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.5em] text-slate-500 animate-pulse">Rastreando Linhas...</p>
        <style>{`@keyframes loading { from { left: -50%; } to { left: 100%; } }`}</style>
      </div>
    );
  }

  // ─── Render principal ─────────────────────────────────────────────────────

  return (
    <div className={`h-screen w-screen ${theme.bg} ${theme.text} flex flex-col relative overflow-hidden transition-colors duration-300`}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes staggerIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .stagger-card { animation: staggerIn 0.3s ease-out both; }
        .page-enter { animation: staggerIn 0.3s ease-out both; }
        .btn-active:active { transform: scale(0.95); opacity: 0.8; }
        ::-webkit-scrollbar { display: none; }
        .app-container { -webkit-overflow-scrolling: touch; }
      `}</style>

      {/* Onboarding */}
      {showOnboarding && (() => {
        const steps = [
          { icon: '📍', title: 'Bem-vindo ao Cadê meu Baú!', desc: 'Consulte em segundos quando o seu ônibus chega em qualquer ponto de Goiânia.', tip: null },
          { icon: '🔢', title: 'Encontre o número do ponto', desc: 'O número está na plaquinha fixada no poste do ponto de ônibus.', tip: '💡 Geralmente tem 5 dígitos. Ex: 31700, 42150' },
          { icon: '🔍', title: 'Digite e busque', desc: 'Cole o número no campo "Número do Ponto" e toque em Localizar Baú. Pode filtrar também pelo número da linha.', tip: '💡 Os dados atualizam sozinhos a cada 20 segundos!' },
          { icon: '★', title: 'Salve seus favoritos', desc: 'Toque na estrela de uma linha para salvá-la. Na próxima vez ela já aparece atualizada automaticamente.', tip: '💡 Segure o dedo num card salvo para dar um apelido a ele.' },
        ];
        const step = steps[onboardingStep];
        const isLast = onboardingStep === steps.length - 1;
        return (
          <div className="fixed inset-0 bg-black/90 z-[200] flex items-end justify-center p-4" style={{ animation: 'slideUp 0.3s ease-out' }}>
            <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-5`} style={{ animation: 'slideUp 0.3s ease-out' }}>
              <div className="flex justify-center gap-2">
                {steps.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === onboardingStep ? 'w-6 bg-yellow-400' : 'w-1.5 bg-white/20'}`} />
                ))}
              </div>
              <div className="text-center space-y-3">
                <div className="text-6xl">{step.icon}</div>
                <p className="font-black text-lg uppercase tracking-tight text-white leading-tight">{step.title}</p>
                <p className={`text-sm ${theme.subtext} leading-relaxed`}>{step.desc}</p>
                {step.tip && (
                  <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl px-4 py-3">
                    <p className="text-[11px] font-bold text-yellow-400 leading-relaxed">{step.tip}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                {onboardingStep > 0 && (
                  <button onClick={() => setOnboardingStep(p => p - 1)}
                    className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border ${theme.subtext} ${lightTheme ? 'border-gray-300' : 'border-white/10'}`}>
                    Voltar
                  </button>
                )}
                <button onClick={() => {
                    if (isLast) { localStorage.setItem('cade_meu_bau_onboarding_done', 'true'); setShowOnboarding(false); haptic(50); }
                    else { setOnboardingStep(p => p + 1); haptic(30); }
                  }}
                  className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform">
                  {isLast ? '🚍 Vamos lá!' : 'Próximo →'}
                </button>
              </div>
              {!isLast && (
                <button onClick={() => { localStorage.setItem('cade_meu_bau_onboarding_done', 'true'); setShowOnboarding(false); }}
                  className={`w-full text-center text-[9px] font-black uppercase tracking-widest ${theme.subtext} opacity-40`}>
                  Pular tutorial
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal alerta */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center p-4" onClick={() => setShowAlertModal(null)}>
          <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-4`} onClick={e => e.stopPropagation()} style={{ animation: 'slideUp 0.25s ease-out' }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400">🔔 Alertar quando chegar</p>
              <button onClick={() => setShowAlertModal(null)} className={`${theme.subtext} text-xl font-black`}>✕</button>
            </div>
            <p className={`text-[9px] font-bold ${theme.subtext} uppercase tracking-widest`}>Notificar quando o baú estiver a:</p>
            <div className="grid grid-cols-2 gap-3">
              {[2, 5, 10, 15].map(min => (
                <button key={min} onClick={() => setAlert(showAlertModal, min)}
                  className={`${theme.card} border rounded-2xl py-4 font-black text-center active:scale-95 transition-transform hover:border-yellow-400`}>
                  <span className="block text-2xl font-black text-yellow-400">{min}</span>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>minutos</span>
                </button>
              ))}
            </div>
            {notifPermission === 'denied' && (
              <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest text-center">
                ⚠️ Notificações bloqueadas. Ative nas configurações do navegador.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal nickname */}
      {editingNickname && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center p-4" onClick={() => setEditingNickname(null)}>
          <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-4`} onClick={e => e.stopPropagation()} style={{ animation: 'slideUp 0.25s ease-out' }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">✏️ Apelido da Linha</p>
            <input id="nickname-input" type="text" placeholder="Ex: Meu trabalho, Casa da mãe..."
              value={nicknameInput} onChange={e => setNicknameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveNickname()} maxLength={30}
              className={`w-full ${theme.input} border rounded-2xl px-4 py-4 font-black outline-none focus:border-yellow-400 transition-all text-base`} />
            <div className="flex gap-3">
              <button onClick={() => { setNicknameInput(''); saveNickname(); }}
                className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border ${theme.subtext} ${lightTheme ? 'border-gray-300' : 'border-white/10'}`}>
                Remover apelido
              </button>
              <button onClick={saveNickname} className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal instalação iOS */}
      {showIosInstructions && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-end justify-center p-4" onClick={() => setShowIosInstructions(false)}>
          <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-5`} onClick={e => e.stopPropagation()} style={{ animation: 'slideUp 0.3s ease-out' }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400">📲 Como instalar</p>
              <button onClick={() => setShowIosInstructions(false)} className={`${theme.subtext} text-xl font-black`}>✕</button>
            </div>
            <div className="space-y-3">
              {(isIosDevice ? [
                { icon: '1️⃣', title: 'Toque no botão compartilhar', desc: 'O ícone ↑ na barra inferior do Safari' },
                { icon: '2️⃣', title: 'Role para baixo', desc: 'Procure "Adicionar à Tela de Início"' },
                { icon: '3️⃣', title: 'Toque em "Adicionar"', desc: 'O app aparecerá na sua tela inicial!' },
              ] : [
                { icon: '1️⃣', title: 'Toque no menu do Chrome', desc: 'Os três pontinhos ⋮ no canto superior direito' },
                { icon: '2️⃣', title: 'Selecione a opção', desc: '"Adicionar à tela inicial" ou "Instalar app"' },
                { icon: '3️⃣', title: 'Confirme a instalação', desc: 'Pronto! O ícone aparece na sua tela inicial 🎉' },
              ]).map(step => (
                <div key={step.icon} className={`flex items-start gap-3 ${theme.card} border rounded-2xl p-3`}>
                  <span className="text-2xl shrink-0">{step.icon}</span>
                  <div>
                    <p className="font-black text-[11px] uppercase tracking-wide">{step.title}</p>
                    <p className={`text-[9px] ${theme.subtext} font-bold mt-0.5`}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { setShowIosInstructions(false); dismissInstallBanner(); }}
              className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest">
              Entendi!
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`pt-[env(safe-area-inset-top)] ${theme.header} border-b p-4 flex justify-between items-center shrink-0 z-50`}>
        <div className="font-black italic text-yellow-400 text-xl tracking-tighter skew-x-[-10deg]">CADÊ MEU BAÚ?</div>
        <div className="flex items-center gap-3">
          {staleData && (
            <div className="text-[8px] font-black uppercase tracking-widest text-red-400 animate-pulse border border-red-500/30 px-2 py-1 rounded-xl">
              ⚠️ Sem internet
            </div>
          )}
          {((activeTab === 'search' && busLines.length > 0 && !isLoading) ||
            (activeTab === 'favs' && favoriteBusLines.length > 0 && !isFavoritesLoading)) && (
            <div className="text-right flex flex-col items-end">
              <span className={`text-[7px] font-black ${theme.subtext} uppercase leading-none mb-0.5`}>Auto-Refresh</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-black text-yellow-400 tabular-nums leading-none">{countdown}s</span>
              </div>
            </div>
          )}
          {/* FIX: spinner aparece mesmo se já existe resultado (double-tap) */}
          {(isLoading || isFavoritesLoading) && (
            <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          )}
          <button onClick={() => { setLightTheme(p => !p); haptic(30); }}
            className={`text-xl p-1.5 transition-all active:scale-110 ${theme.subtext}`}>
            {lightTheme ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="flex-grow overflow-y-auto app-container px-4 pt-4 pb-32 space-y-5">

        {/* Banner de atualização disponível */}
        {showUpdateBanner && (
          <div style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div className="bg-emerald-500 rounded-[2rem] p-4 flex items-center gap-3 shadow-[0_8px_30px_rgba(16,185,129,0.4)]">
              <div className="text-3xl shrink-0">🚀</div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-[11px] uppercase tracking-wider leading-tight">Nova versão disponível!</p>
                <p className="text-white/70 text-[9px] font-bold uppercase tracking-widest leading-tight mt-0.5">Toque para atualizar agora</p>
              </div>
              <button
                onClick={() => { applyUpdate(); haptic(50); }}
                className="bg-white text-emerald-600 font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform shrink-0">
                Atualizar
              </button>
            </div>
          </div>
        )}

        {/* Banner instalação */}
        {showInstallBanner && !isInstalled && (
          <div style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div className="bg-yellow-400 rounded-[2rem] p-4 flex items-center gap-3 shadow-[0_8px_30px_rgba(251,191,36,0.4)]">
              <div className="text-3xl shrink-0">📲</div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-black text-[11px] uppercase tracking-wider leading-tight">Instale o app!</p>
                <p className="text-black/60 text-[9px] font-bold uppercase tracking-widest leading-tight mt-0.5">Acesso rápido • Funciona offline</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={handleInstall} className="bg-black text-yellow-400 font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform">
                  Instalar
                </button>
                <button onClick={dismissInstallBanner} className="text-black/40 font-black text-lg px-1">✕</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── ABA BUSCA ─────────────────────────────────────────────────────── */}
        {activeTab === 'search' && (
          <div className="page-enter space-y-5">
            <div className={`${theme.inputWrap} border p-5 rounded-[2.5rem] shadow-2xl space-y-4`}>
              <div className="flex gap-2">
                <div className="flex-[3] relative">
                  <span className={`absolute left-4 top-2 text-[8px] font-black ${theme.subtext} uppercase pointer-events-none`}>Número do Ponto</span>
                  <input type="text" inputMode="numeric" placeholder="Ex: 31700" value={stopId}
                    onChange={e => setStopId(e.target.value)} onKeyDown={handleKeyDown}
                    className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-xl`} />
                </div>
                <div className="flex-[2] relative">
                  <span className={`absolute left-0 top-2 text-[8px] font-black ${theme.subtext} uppercase text-center w-full pointer-events-none`}>Linha (OPCIONAL)</span>
                  <input type="text" placeholder="Ex: 327" value={lineFilter}
                    onChange={e => setLineFilter(e.target.value)} onKeyDown={handleKeyDown}
                    className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-xl text-center`} />
                </div>
              </div>
              <button onClick={() => handleSearch()} disabled={isLoading}
                className="w-full bg-yellow-400 text-black py-5 rounded-2xl font-black btn-active uppercase text-sm tracking-[0.2em] shadow-[0_10px_30px_rgba(251,191,36,0.3)] disabled:opacity-50 transition-all">
                {isLoading ? 'Rastreando...' : 'Localizar Baú'}
              </button>
              {searchHistory.length > 0 && busLines.length === 0 && !isLoading && (
                <div>
                  <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2 px-1`}>Buscas Recentes</p>
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.map(h => (
                      <button key={h} onClick={() => { setStopId(h); handleSearch(h); haptic(30); }}
                        className={`${theme.historyBtn} border text-xs font-black px-3 py-2 rounded-xl active:scale-95 transition-transform tracking-wider`}>
                        📍 {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (() => {
              const errors: Record<string, { icon: string; title: string; desc: string; color: string }> = {
                offline:      { icon: '📡', title: 'Sem conexão', desc: 'Verifique sua internet e tente novamente.', color: 'border-slate-500/30 text-slate-400 bg-slate-500/10' },
                not_found:    { icon: '🔍', title: 'Ponto não encontrado', desc: `O ponto "${stopId}" não existe ou está inativo. Confira o número na placa do ponto.`, color: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' },
                no_lines:     { icon: '🚌', title: 'Linha não opera aqui', desc: `A linha "${lineFilter}" não para neste ponto ou não está em operação agora.`, color: 'border-orange-500/30 text-orange-400 bg-orange-500/10' },
                invalid_stop: { icon: '⚠️', title: 'Número inválido', desc: 'Digite um número de ponto válido. Ex: 31700', color: 'border-red-500/30 text-red-400 bg-red-500/10' },
              };
              const e = errors[errorMsg] ?? errors['offline'];
              return (
                <div className={`border p-4 rounded-2xl flex items-start gap-3 ${e.color}`}>
                  <span className="text-2xl shrink-0">{e.icon}</span>
                  <div>
                    <p className="font-black text-[11px] uppercase tracking-widest">{e.title}</p>
                    <p className="text-[9px] font-bold mt-1 opacity-80 leading-relaxed">{e.desc}</p>
                    {errorMsg === 'not_found' && (
                      <a href="https://www.rmtcgoiania.com.br" target="_blank" rel="noopener noreferrer"
                        className="inline-block mt-2 text-[9px] font-black uppercase tracking-widest underline opacity-70">
                        Ver mapa de pontos →
                      </a>
                    )}
                    {errorMsg === 'offline' && (
                      <button onClick={() => handleSearch()} className="mt-2 text-[9px] font-black uppercase tracking-widest underline opacity-70">
                        Tentar novamente →
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {isLoading && [0, 1, 2].map(i => (
              <div key={i} className="stagger-card" style={{ animationDelay: `${i * 80}ms` }}>
                <SkeletonCard light={lightTheme} />
              </div>
            ))}

            {!isLoading && (
              <div className="space-y-4">
                {busLines.map((line, i) => (
                  <div key={line.id} className="stagger-card" style={{ animationDelay: `${i * 60}ms` }}>
                    <BusLineCard line={line} staggerIndex={i} {...cardProps} />
                  </div>
                ))}
                {busLines.length === 0 && !errorMsg && (
                  <div className="py-20 text-center opacity-10 flex flex-col items-center">
                    <div className="text-9xl mb-6">🚍</div>
                    <p className={`font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed ${theme.subtext}`}>
                      Aguardando número do ponto...
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Botão de feedback */}
            <a
              href="https://forms.gle/JwtHNRw7pjaZtfV19"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic(30)}
              className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border ${lightTheme ? 'border-gray-200 text-gray-400 hover:border-yellow-400 hover:text-yellow-500' : 'border-white/5 text-slate-600 hover:border-yellow-400/30 hover:text-yellow-400'} transition-all font-black text-[10px] uppercase tracking-widest`}>
              <span>💬</span> Algo errado? Me avisa
            </a>
          </div>
        )}

        {/* ─── ABA FAVORITOS ─────────────────────────────────────────────────── */}
        {activeTab === 'favs' && (
          <div className="page-enter space-y-4">
            <div className="flex items-center justify-between px-2 mb-2">
              <h2 className={`text-[10px] font-black uppercase tracking-[0.5em] ${theme.subtext} flex items-center gap-2`}>
                <span className="text-yellow-400 text-lg">★</span> Minha Garagem
              </h2>
              {favorites.length > 0 && !isFavoritesLoading && (
                <button onClick={() => { loadFavoritesSchedules(); haptic(30); }}
                  className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} border ${lightTheme ? 'border-gray-300' : 'border-white/10'} px-3 py-2 rounded-xl active:scale-95 transition-transform`}>
                  🔄 Atualizar
                </button>
              )}
            </div>

            {favorites.length > 0 && !isFavoritesLoading && (
              <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest px-2 opacity-50`}>
                ✏️ Segure o dedo em um card para dar apelido
              </p>
            )}

            {isFavoritesLoading && (
              <div className="space-y-4">
                {favorites.slice(0, 3).map((_, i) => (
                  <div key={i} className="stagger-card" style={{ animationDelay: `${i * 80}ms` }}>
                    <SkeletonCard light={lightTheme} />
                  </div>
                ))}
              </div>
            )}

            {/* FIX: aviso de pontos inativos */}
            {inactiveStops.size > 0 && !isFavoritesLoading && (
              <div className="border border-orange-500/30 bg-orange-500/10 text-orange-400 p-4 rounded-2xl flex items-start gap-3">
                <span className="text-2xl shrink-0">⚠️</span>
                <div>
                  <p className="font-black text-[11px] uppercase tracking-widest">Pontos sem retorno</p>
                  <p className="text-[9px] font-bold mt-1 opacity-80 leading-relaxed">
                    {Array.from(inactiveStops).map(s => `Ponto ${s}`).join(', ')} não retornaram dados.
                    Podem estar desativados ou sem linhas no momento.
                  </p>
                </div>
              </div>
            )}

            {!isFavoritesLoading && Object.entries(groupedFavLines).map(([pontoId, lines]) => (
              <div key={pontoId} className="space-y-3">
                <div className="flex items-center gap-2 px-1 pt-2">
                  <span className="text-yellow-400 text-sm">📍</span>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>Ponto {pontoId}</span>
                  <div className={`flex-1 h-px ${theme.divider}`} />
                </div>
                {lines.map((line, i) => {
                  const key = `${line.stopSource ?? stopId}::${line.number}`;
                  return (
                    <div key={line.id} className="stagger-card" style={{ animationDelay: `${i * 60}ms` }}>
                      <BusLineCard line={line} isRemoving={removingFavKey === key} staggerIndex={i} {...cardProps} />
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

            {/* Botão de feedback */}
            <a
              href="https://forms.gle/JwtHNRw7pjaZtfV19"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic(30)}
              className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border ${lightTheme ? 'border-gray-200 text-gray-400 hover:border-yellow-400 hover:text-yellow-500' : 'border-white/5 text-slate-600 hover:border-yellow-400/30 hover:text-yellow-400'} transition-all font-black text-[10px] uppercase tracking-widest`}>
              <span>💬</span> Algo errado? Me avisa
            </a>
          </div>
        )}

        {/* ─── ABA SITPASS ───────────────────────────────────────────────────── */}
        {activeTab === 'sitpass' && (
          <div className="page-enter space-y-5">
            <div className={`${theme.inputWrap} border p-5 rounded-[2.5rem] shadow-2xl space-y-4`}>
              <div className="relative">
                <span className={`absolute left-4 top-2 text-[8px] font-black ${theme.subtext} uppercase pointer-events-none`}>
                  CPF
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpfSitpass}
                  onChange={handleCpfChange}
                  onKeyDown={e => e.key === 'Enter' && consultarSaldo()}
                  maxLength={14}
                  className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none transition-all placeholder:text-slate-700 text-xl
                    ${cpfError ? 'border-red-500 focus:border-red-500' : 'focus:border-yellow-400'}`}
                />
                {/* FIX: feedback de validação inline */}
                {cpfError && (
                  <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mt-2 px-1">{cpfError}</p>
                )}
              </div>
              <button
                onClick={consultarSaldo}
                disabled={saldoLoading}
                className="w-full bg-yellow-400 text-black py-5 rounded-2xl font-black btn-active uppercase text-sm tracking-[0.2em] shadow-[0_10px_30px_rgba(251,191,36,0.3)] disabled:opacity-50 transition-all">
                {saldoLoading ? 'Consultando...' : 'Consultar Saldo'}
              </button>
            </div>

            {saldoErro && (
              <div className="border border-red-500/30 bg-red-500/10 text-red-400 p-4 rounded-2xl flex items-start gap-3">
                <span className="text-2xl shrink-0">⚠️</span>
                <div>
                  <p className="font-black text-[11px] uppercase tracking-widest">Erro</p>
                  <p className="text-[9px] font-bold mt-1 opacity-80">{saldoErro}</p>
                </div>
              </div>
            )}

            {/* FIX: saldoText usa variável de tema para funcionar no modo claro */}
            {saldoData && (
              <div className="border border-yellow-400/20 bg-yellow-400/5 rounded-[2.5rem] p-6 space-y-4" style={{ animation: 'slideUp 0.3s ease-out' }}>
                <div className="flex items-center gap-3">
                  <span className="text-4xl">🎫</span>
                  <div>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>Bilhete Único</p>
                    <p className={`font-black text-sm uppercase ${theme.saldoText}`}>{saldoData.cartaoDescricao}</p>
                    <p className={`text-[9px] font-bold ${theme.subtext}`}>🆔 {saldoData.cartaoNumero}</p>
                  </div>
                </div>
                <div className={`${theme.divider} h-px w-full`} />
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Saldo disponível</span>
                  <span className="text-4xl font-black text-yellow-400">{saldoData.saldo_formatado}</span>
                </div>
                {/* Aviso saldo baixo */}
                {(() => {
                  const saldoNum = parseFloat(saldoData.saldo.replace('.', '').replace(',', '.'));
                  const TARIFA_INTEIRA = 4.30;
                  const MEIA_TARIFA = 2.15;

                  if (saldoNum < MEIA_TARIFA) {
                    // Abaixo até da meia tarifa
                    return (
                      <div className="border border-red-500/30 bg-red-500/10 rounded-2xl px-4 py-3 flex items-start gap-2">
                        <span className="text-base shrink-0 mt-0.5">⚠️</span>
                        <p className="text-[9px] font-bold leading-relaxed text-red-400">
                          Saldo insuficiente para qualquer passagem (nem meia tarifa de R$ 2,15). Recarregue seu SitPass antes de embarcar.
                          <span className={`block mt-1 ${theme.subtext} opacity-70`}>
                            Se você já recarregou recentemente, ignore este aviso — o saldo pode não ter atualizado ainda.
                          </span>
                        </p>
                      </div>
                    );
                  }

                  if (saldoNum < TARIFA_INTEIRA) {
                    // Tem meia tarifa mas não tem tarifa inteira
                    return (
                      <div className="space-y-2">
                        <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-2xl px-4 py-3 flex items-start gap-2">
                          <span className="text-base shrink-0 mt-0.5">⚠️</span>
                          <p className="text-[9px] font-bold leading-relaxed text-yellow-400">
                            Saldo insuficiente para a tarifa inteira (R$ 4,30). Recarregue seu SitPass antes de embarcar.
                            <span className={`block mt-1 ${theme.subtext} opacity-70`}>
                              Se você já recarregou recentemente, ignore este aviso — o saldo pode não ter atualizado ainda.
                            </span>
                          </p>
                        </div>
                        <div className="border border-blue-500/30 bg-blue-500/10 rounded-2xl px-4 py-3 flex items-start gap-2">
                          <span className="text-base shrink-0 mt-0.5">ℹ️</span>
                          <p className="text-[9px] font-bold leading-relaxed text-blue-400">
                            Seu saldo cobre a meia tarifa (R$ 2,15), disponível em algumas regiões de Goiás para viagens dentro da cidade.
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}
                {/* Aviso de saldo não real-time — conforme informação oficial do SitPass */}
                <div className={`border ${lightTheme ? 'border-gray-200 bg-gray-50' : 'border-white/5 bg-black/20'} rounded-2xl px-4 py-3 flex items-start gap-2`}>
                  <span className="text-base shrink-0 mt-0.5">ℹ️</span>
                  <p className={`text-[9px] font-bold leading-relaxed ${theme.subtext}`}>
                    O saldo informado aqui não é calculado em tempo real, mas sim o último valor registrado no sistema do SitPass.
                  </p>
                </div>
              </div>
            )}

            {!saldoData && !saldoErro && !saldoLoading && (
              <div className="space-y-4">
                {/* Histórico da última consulta */}
                {saldoHistorico && (
                  <div className={`border ${lightTheme ? 'border-gray-200 bg-white' : 'border-white/5 bg-slate-900'} rounded-[2rem] p-5 space-y-3`}
                    style={{ animation: 'slideUp 0.3s ease-out' }}>
                    <div className="flex items-center justify-between">
                      <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>🕓 Última consulta</p>
                      <p className={`text-[8px] font-bold ${theme.subtext}`}>{saldoHistorico.data} às {saldoHistorico.hora}</p>
                    </div>
                    <div className={`${theme.divider} h-px w-full`} />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-[9px] font-bold ${theme.subtext}`}>{saldoHistorico.cartaoDescricao}</p>
                        <p className={`text-[8px] ${theme.subtext} opacity-50`}>Valor pode estar desatualizado</p>
                      </div>
                      <span className="text-2xl font-black text-yellow-400">{saldoHistorico.saldo_formatado}</span>
                    </div>
                  </div>
                )}
                <div className="py-16 text-center opacity-10 flex flex-col items-center">
                  <div className="text-9xl mb-6">🎫</div>
                  <p className={`font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed ${theme.subtext}`}>
                    Digite seu CPF para consultar o saldo
                  </p>
                </div>
              </div>
            )}

            {/* Botão de feedback */}
            <a
              href="https://forms.gle/JwtHNRw7pjaZtfV19"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic(30)}
              className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border ${lightTheme ? 'border-gray-200 text-gray-400 hover:border-yellow-400 hover:text-yellow-500' : 'border-white/5 text-slate-600 hover:border-yellow-400/30 hover:text-yellow-400'} transition-all font-black text-[10px] uppercase tracking-widest`}>
              <span>💬</span> Algo errado? Me avisa
            </a>
          </div>
        )}

      </div>


        {/* ─── ABA MAPA ─────────────────────────────────────────────────────── */}


      {/* ─── ABA MAPA — sempre no DOM, visível/oculto via display ─── */}
      <div
        style={{
          position: 'fixed',
          top: '64px',
          left: 0,
          right: 0,
          bottom: '90px',
          zIndex: 40,
          display: activeTab === 'map' ? 'block' : 'none',
        }}
      >
          {/* Container do mapa — ocupa 100% do espaço disponível */}
          <div
            ref={mapRef}
            style={{width: '100%', height: '100%'}}
          />

          {/* Erro de localização */}
          {locationError && (
            <div className={`absolute top-3 left-3 right-3 z-[1000] border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest`}
              style={{backdropFilter: 'blur(8px)'}}>
              📍 Localização negada — mostrando Senador Canedo
            </div>
          )}

          {/* Bottom sheet do ponto selecionado */}
          {selectedStop && (
            <div
              className={`absolute left-0 right-0 z-[1000] ${theme.card} border-t rounded-t-[2rem]`}
              style={{bottom: 0, animation: 'slideUp 0.3s ease-out', maxHeight: '60%', display: 'flex', flexDirection: 'column'}}>

              {/* Cabeçalho fixo */}
              <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
                <div>
                  <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>📍 Ponto selecionado</p>
                  <p className="font-black text-base text-yellow-400 mt-1">{selectedStop.nome}</p>
                  <p className={`text-[10px] font-bold ${theme.subtext} mt-0.5`}>Nº {selectedStop.id}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {!stopLinesLoading && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className={`text-[9px] font-black tabular-nums ${theme.subtext}`}>{mapRefreshCountdown}s</span>
                    </div>
                  )}
                  <button onClick={() => {
                    setSelectedStop(null);
                    setStopLines([]);
                    busMarkersRef.current.forEach(m => m.remove());
                    busMarkersRef.current = [];
                  }} className={`${theme.subtext} text-xl font-black p-1`}>✕</button>
                </div>
              </div>

              {/* Área scrollável */}
              <div style={{overflowY: 'auto', flex: 1, paddingBottom: '12px'}} className="px-5 space-y-3">

              {/* Loading */}
              {stopLinesLoading && (
                <div className="flex items-center gap-3 py-2">
                  <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <p className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Buscando ônibus...</p>
                </div>
              )}

              {/* Erro */}
              {stopLinesError && !stopLinesLoading && (
                <div className="border border-red-500/30 bg-red-500/10 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                    {stopLinesError === 'offline' ? '📡 Sem conexão' : '🔍 Nenhuma linha encontrada'}
                  </p>
                </div>
              )}

              {/* Lista de linhas */}
              {!stopLinesLoading && stopLines.length > 0 && (
                <div className="space-y-2">
                  {stopLines.map((line) => {
                    const getColor = (t: string) => {
                      if (!t || t === 'SEM PREVISÃO') return 'bg-slate-800 text-slate-500';
                      if (t.toLowerCase().includes('agora')) return 'bg-red-600 text-white';
                      const m = parseInt(t) || 999;
                      if (m <= 3) return 'bg-red-600 text-white';
                      if (m <= 8) return 'bg-yellow-500 text-black';
                      return 'bg-emerald-500 text-white';
                    };
                    return (
                      <div key={line.id} className={`${theme.card} border rounded-2xl px-4 py-3 flex items-center gap-3`}>
                        <span className="text-yellow-400 font-black text-xl w-14 text-center shrink-0">{line.number}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>Indo para</p>
                          <p className={`font-black text-[11px] uppercase truncate ${theme.destText}`}>{line.destination}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <div className={`${getColor(line.nextArrival ?? '')} rounded-xl px-2 py-1.5 text-center min-w-[44px]`}>
                            <p className="font-black text-sm leading-none">{line.nextArrival === 'SEM PREVISÃO' ? '—' : line.nextArrival}</p>
                            <p className="text-[6px] font-black uppercase opacity-70 mt-0.5">min</p>
                          </div>
                          <div className={`${getColor(line.subsequentArrival ?? '')} rounded-xl px-2 py-1.5 text-center min-w-[44px] opacity-80`}>
                            <p className="font-black text-sm leading-none">{line.subsequentArrival === 'SEM PREVISÃO' ? '—' : line.subsequentArrival}</p>
                            <p className="text-[6px] font-black uppercase opacity-70 mt-0.5">min</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Info markers */}
              {!stopLinesLoading && busMarkersRef.current.length > 0 && (
                <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} text-center pb-1`}>
                  🚍 {busMarkersRef.current.length} ônibus visíveis no mapa
                </p>
              )}

              </div>{/* fim área scrollável */}
            </div>
          )}

          {/* Botão de reposicionar no usuário */}
          {mapReady && (
            <button
              onClick={() => {
                if (!leafletMapRef.current) return;
                haptic(40);
                if (userLocation) {
                  leafletMapRef.current.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
                } else {
                  // Tenta pegar localização novamente
                  navigator.geolocation?.getCurrentPosition(
                    (pos) => {
                      const { latitude, longitude } = pos.coords;
                      setUserLocation({ lat: latitude, lng: longitude });
                      leafletMapRef.current.setView([latitude, longitude], 16, { animate: true });
                    },
                    () => setLocationError(true),
                    { timeout: 6000, enableHighAccuracy: true }
                  );
                }
              }}
              style={{
                position: 'absolute',
                bottom: selectedStop ? '220px' : '72px',
                right: '16px',
                zIndex: 1000,
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#fbbf24',
                border: '2px solid #000',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                cursor: 'pointer',
                transition: 'bottom 0.3s ease',
              }}
              title="Minha localização"
            >
              📍
            </button>
          )}

          {/* Loader inicial */}
          {!mapReady && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 z-[999] ${theme.bg}`}>
              <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              <p className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Carregando mapa...</p>
            </div>
          )}
      </div>

      {/* Nav */}
      <nav className={`fixed bottom-0 left-0 right-0 ${theme.nav} border-t px-6 pb-12 pt-5 flex justify-between items-center z-50`}>
        <button onClick={() => { setActiveTab('search'); haptic(30); }}
          className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === 'search' ? 'text-yellow-400 scale-125' : theme.inactiveNav}`}>
          <div className="text-2xl leading-none">{activeTab === 'search' ? '🔍' : '🔎'}</div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Busca</span>
        </button>
        <button onClick={() => { setActiveTab('favs'); haptic(30); }}
          className={`flex flex-col items-center gap-2 transition-all duration-300 relative ${activeTab === 'favs' ? 'text-yellow-400 scale-125' : theme.inactiveNav}`}>
          <div className="text-2xl leading-none relative">
            {activeTab === 'favs' ? '★' : '☆'}
            {favCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-yellow-400 text-black text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {favCount > 9 ? '9+' : favCount}
              </span>
            )}
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Salvos</span>
        </button>
        <button onClick={() => { setActiveTab('map'); haptic(30); }}
          className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === 'map' ? 'text-yellow-400 scale-125' : theme.inactiveNav}`}>
          <div className="text-2xl leading-none">🗺️</div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Mapa</span>
        </button>
        <button onClick={() => { setActiveTab('sitpass'); haptic(30); }}
          className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === 'sitpass' ? 'text-yellow-400 scale-125' : theme.inactiveNav}`}>
          <div className="text-2xl leading-none">🎫</div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">SitPass</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
