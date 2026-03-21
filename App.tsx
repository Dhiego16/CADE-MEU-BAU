import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PONTOS_DATA from './pontos.json';
import { BusLine, ActiveTab, LeafletMap, LeafletMarker, LeafletLib, PontoDataWithMarker } from './types';
import { haptic, shareLine, REFRESH_INTERVAL, SPLASH_DURATION } from './utils';
import { buildTheme } from './utils/theme';
import { useBusSearch } from './hooks/useBusSearch';
import { useFavorites } from './hooks/useFavorites';
import { useNotifications } from './hooks/useNotifications';
import { useSitpass } from './hooks/useSitpass';
import BusLineCard from './components/BusLineCard';
import SkeletonCard from './components/SkeletonCard';
import MiniMap from './components/MiniMap';

interface MiniMapConfig {
  key: string;
  lineNumber: string;
  stopLat: number;
  stopLng: number;
  stopNome: string;
  destination: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [isSplash, setIsSplash] = useState(true);
  const [lightTheme, setLightTheme] = useState(() => {
    try { return localStorage.getItem('cade_meu_bau_theme') === 'light'; } catch { return false; }
  });
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // MiniMap ao vivo — um de cada vez, compartilhado entre abas
  const [activeMiniMap, setActiveMiniMap] = useState<MiniMapConfig | null>(null);
  const toggleMiniMap = useCallback((config: MiniMapConfig) => {
    setActiveMiniMap(prev => prev?.key === config.key ? null : config);
  }, []);

  // Mapa
  const [mapReady, setMapReady] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [selectedStop, setSelectedStop] = useState<{id: string; nome: string} | null>(null);
  const [stopLines, setStopLines] = useState<BusLine[]>([]);
  const [stopLinesLoading, setStopLinesLoading] = useState(false);
  const [stopLinesError, setStopLinesError] = useState<string | null>(null);
  const [stopLiveLinesMap, setStopLiveLinesMap] = useState<Record<string, boolean>>({});
  const [mapRefreshCountdown, setMapRefreshCountdown] = useState(15);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const pontosDataRef = useRef<PontoDataWithMarker[]>([]);
  const leafletLoadingRef = useRef(false);
  const filtrarMarkersPorRaioRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const userLocationRef = useRef<{lat: number; lng: number} | null>(null);
  const mapRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedStopRef = useRef<{id: string; nome: string} | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTabRef = useRef<string>('');

  const notifications = useNotifications();
  const sitpass = useSitpass();

  const {
    busLines, setBusLines,
    favoriteBusLines, setFavoriteBusLines,
    stopId, setStopId,
    lineFilter, setLineFilter,
    isLoading, isFavoritesLoading,
    errorMsg, setErrorMsg,
    countdown, setCountdown,
    staleData,
    searchHistory,
    liveLineMap,
    mergeLines,
    handleSearch,
    loadFavoritesSchedules,
  } = useBusSearch();

  const favoritesHook = useFavorites(stopId);
  const {
    favorites, setFavorites,
    removingFavKey,
    editingNickname, setEditingNickname,
    nicknameInput, setNicknameInput,
    startLongPress, cancelLongPress,
    saveNickname,
  } = favoritesHook;

  const toggleFavorite = useCallback((line: BusLine) => {
    favoritesHook.toggleFavorite(line, setFavoriteBusLines);
  }, [favoritesHook, setFavoriteBusLines]);

  const loadFavoritesWithCurrentFavs = useCallback(() => {
    loadFavoritesSchedules(favorites);
  }, [loadFavoritesSchedules, favorites]);

  const theme = useMemo(() => buildTheme(lightTheme), [lightTheme]);

  const cardProps = useMemo(() => ({
    stopId, favorites,
    activeAlerts: notifications.activeAlerts,
    lightTheme, theme,
    onToggleFavorite: toggleFavorite,
    onStartLongPress: startLongPress,
    onCancelLongPress: cancelLongPress,
    onRemoveAlert: notifications.removeAlert,
    onShowAlertModal: notifications.setShowAlertModal,
    onShare: shareLine,
  }), [stopId, favorites, notifications.activeAlerts, lightTheme, theme, toggleFavorite, startLongPress, cancelLongPress, notifications.removeAlert, notifications.setShowAlertModal]);

  // Busca horários do ponto no mapa + verifica ao vivo em background
  const buscarLinhasPontoInterno = useCallback(async (pontoId: string) => {
    if (!pontoId) return;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`/api/ponto?ponto=${pontoId}`, { signal: controller.signal });
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
          name: raw, origin: '',
          destination: String(item.destino ?? 'Destino não informado'),
          schedules: [], frequencyMinutes: 0, status: 'Normal' as const,
          nextArrival: norm(item.proximo ?? item.previsao),
          subsequentArrival: norm(item.seguinte),
          stopSource: pontoId,
        };
      });

      setStopLines(prev => prev.length === 0 ? lines : mergeLines(prev, lines));
      setStopLinesLoading(false);

      // Verifica linhas ao vivo em background
      const linhasUnicas = [...new Set(lines.map(l => l.number))];
      const liveMap: Record<string, boolean> = {};
      await Promise.all(linhasUnicas.map(async num => {
        try {
          const r = await fetch(`/api/realtimebus?linha=${num}`);
          if (!r.ok) return;
          const d = await r.json();
          if (Array.isArray(d) && d.length > 0) liveMap[num] = true;
        } catch { /* ignora */ }
      }));
      setStopLiveLinesMap(liveMap);
    } catch { setStopLinesError('offline'); setStopLinesLoading(false); }
  }, [mergeLines]);

  // Encontra coordenadas de um ponto pelo ID
  const getStopCoords = useCallback((stopSource: string) => {
    return pontosDataRef.current.find(p => p.id === stopSource)
      ?? { lat: -16.7200, lng: -49.0900, nome: `Ponto ${stopSource}`, id: stopSource, marker: null as unknown as LeafletMarker };
  }, []);

  // PWA
  const applyUpdate = () => {
    const reg = swRegistrationRef.current;
    if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    setShowUpdateBanner(false);
  };
  const handleInstall = async () => {
    haptic(50);
    if (deferredInstallPrompt) { (deferredInstallPrompt as unknown as { prompt: () => void }).prompt(); setShowInstallBanner(false); }
    else setShowIosInstructions(true);
  };
  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('cade_meu_bau_install_dismissed', 'true');
    haptic(30);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const groupedFavLines = favoriteBusLines.reduce<Record<string, BusLine[]>>((acc, line) => {
    const key = line.stopSource ?? 'desconhecido';
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {});

  const favCount = favorites.length;
  const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);

  // Effects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ponto = params.get('ponto');
    const linha = params.get('linha');
    if (ponto) { setStopId(ponto); if (linha) setLineFilter(linha); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setIsSplash(false);
      if (favorites.length > 0) setActiveTab('favs');
      else if (!localStorage.getItem('cade_meu_bau_onboarding_done')) setShowOnboarding(true);
    }, SPLASH_DURATION);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  useEffect(() => { localStorage.setItem('cade_meu_bau_theme', lightTheme ? 'light' : 'dark'); }, [lightTheme]);

  useEffect(() => {
    if (isInstalled) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const dismissed = localStorage.getItem('cade_meu_bau_install_dismissed');
    if (isIos && isSafari && !dismissed) { const t = setTimeout(() => setShowInstallBanner(true), 3000); return () => clearTimeout(t); }
    const handler = (e: Event) => { e.preventDefault(); setDeferredInstallPrompt(e); if (!dismissed) setShowInstallBanner(true); };
    const installed = () => { setIsInstalled(true); setShowInstallBanner(false); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    const fb = setTimeout(() => { if (!dismissed) setShowInstallBanner(true); }, 4000);
    return () => { window.removeEventListener('beforeinstallprompt', handler); window.removeEventListener('appinstalled', installed); clearTimeout(fb); };
  }, [isInstalled]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      swRegistrationRef.current = reg;
      if (reg.waiting) setShowUpdateBanner(true);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) setShowUpdateBanner(true); });
      });
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!refreshing) { refreshing = true; window.location.reload(); } });
  }, []);

  useEffect(() => {
    if (!editingNickname) return;
    const t = setTimeout(() => { const el = document.getElementById('nickname-input'); if (el) (el as HTMLInputElement).focus(); }, 350);
    return () => clearTimeout(t);
  }, [editingNickname]);

  useEffect(() => { localStorage.setItem('cade_meu_bau_app_favs', JSON.stringify(favorites)); }, [favorites]);

  useEffect(() => {
    if (activeTab === 'favs' && prevTabRef.current !== 'favs' && favorites.length > 0) loadFavoritesSchedules(favorites);
    prevTabRef.current = activeTab;
  }, [activeTab, favorites, loadFavoritesSchedules]);

  const handleSearchRef = useRef(handleSearch);
  const loadFavoritesRef = useRef(loadFavoritesWithCurrentFavs);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { handleSearchRef.current = handleSearch; }, [handleSearch]);
  useEffect(() => { loadFavoritesRef.current = loadFavoritesWithCurrentFavs; }, [loadFavoritesWithCurrentFavs]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  useEffect(() => {
    const shouldRun = (activeTab === 'search' && busLines.length > 0 && !isLoading) || (activeTab === 'favs' && favoriteBusLines.length > 0 && !isFavoritesLoading);
    if (timerRef.current) clearInterval(timerRef.current);
    if (!shouldRun) { setCountdown(REFRESH_INTERVAL); return; }
    setCountdown(REFRESH_INTERVAL);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { if (activeTabRef.current === 'search') handleSearchRef.current(); else loadFavoritesRef.current(); return REFRESH_INTERVAL; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTab, busLines.length, favoriteBusLines.length, isLoading, isFavoritesLoading]);

  useEffect(() => { if (busLines.length > 0) notifications.checkAlerts(busLines); }, [busLines, notifications.checkAlerts]);
  useEffect(() => { if (favoriteBusLines.length > 0) notifications.checkAlerts(favoriteBusLines); }, [favoriteBusLines, notifications.checkAlerts]);

  useEffect(() => {
    if (activeTab !== 'map' || !leafletMapRef.current) return;
    const t = setTimeout(() => leafletMapRef.current!.invalidateSize(), 50);
    return () => clearTimeout(t);
  }, [activeTab]);

  useEffect(() => { selectedStopRef.current = selectedStop; }, [selectedStop]);

  useEffect(() => {
    if (!selectedStop) { if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current); setMapRefreshCountdown(15); return; }
    setMapRefreshCountdown(15);
    if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current);
    mapRefreshTimerRef.current = setInterval(() => {
      setMapRefreshCountdown(prev => { if (prev <= 1) { const s = selectedStopRef.current; if (s) buscarLinhasPontoInterno(s.id); return 15; } return prev - 1; });
    }, 1000);
    return () => { if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current); };
  }, [selectedStop, buscarLinhasPontoInterno]);

  // Leaflet init
  useEffect(() => {
    if (activeTab !== 'map' || leafletMapRef.current || leafletLoadingRef.current) return;
    leafletLoadingRef.current = true;

    const seenIds = new Set<string>();
    const PONTOS = (PONTOS_DATA as Array<{id:string;lat:number;lng:number;nome:string}>).filter(p => { if (seenIds.has(p.id)) return false; seenIds.add(p.id); return true; });

    const loadLeaflet = () => new Promise<void>((resolve, reject) => {
      if ((window as { L?: unknown }).L) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar Leaflet'));
      document.head.appendChild(script);
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    });

    let moveEndHandler: (() => void) | null = null;
    let zoomEndHandler: (() => void) | null = null;

    loadLeaflet().then(() => {
      if (!mapRef.current || leafletMapRef.current) { leafletLoadingRef.current = false; return; }
      const L = (window as unknown as { L: LeafletLib }).L;

      const map = L.map(mapRef.current, { center: [-16.7200, -49.0900], zoom: 14, zoomControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const pontoIcon = L.icon({ iconUrl: '/ponto.png', iconSize: [36,36], iconAnchor: [18,36], popupAnchor: [0,-36] });

      const calcDist = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371000; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
        const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
        return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      };

      const filtrarMarkersPorRaio = (userLat: number, userLng: number) => {
        pontosDataRef.current.forEach(p => { const d = calcDist(userLat, userLng, p.lat, p.lng); p.marker.setOpacity(d <= 500 ? 1 : 0); });
      };
      filtrarMarkersPorRaioRef.current = filtrarMarkersPorRaio;

      PONTOS.forEach(ponto => {
        const marker = L.marker([ponto.lat, ponto.lng], { icon: pontoIcon, opacity: 0 }).addTo(map).on('click', () => {
          const loc = userLocationRef.current;
          if (loc) filtrarMarkersPorRaio(loc.lat, loc.lng);
          setSelectedStop({ id: ponto.id, nome: ponto.nome });
          setStopLines([]); setStopLiveLinesMap({}); setStopLinesError(null); setStopLinesLoading(true);
          setActiveMiniMap(null);
          buscarLinhasPontoInterno(ponto.id);
          haptic(40);
        });
        markersRef.current.push(marker);
        pontosDataRef.current.push({ ...ponto, marker });
      });

      moveEndHandler = () => { const c = map.getCenter(); filtrarMarkersPorRaio(c.lat, c.lng); };
      zoomEndHandler = moveEndHandler;
      map.on('moveend', moveEndHandler); map.on('zoomend', zoomEndHandler);
      leafletMapRef.current = map;
      setMapReady(true);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          const { latitude, longitude } = pos.coords;
          userLocationRef.current = { lat: latitude, lng: longitude };
          const userIcon = L.divIcon({ html: `<div style="width:20px;height:20px;background:#3b82f6;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(59,130,246,0.4);"></div>`, className: '', iconSize: [20,20], iconAnchor: [10,10] });
          L.marker([latitude, longitude], { icon: userIcon }).addTo(map).bindPopup('Você está aqui');
          map.setView([latitude, longitude], 15);
        }, () => { setLocationError(true); pontosDataRef.current.forEach(p => p.marker.setOpacity(1)); }, { timeout: 8000, enableHighAccuracy: true });
      } else { pontosDataRef.current.forEach(p => p.marker.setOpacity(1)); }
    }).catch(() => { leafletLoadingRef.current = false; });

    return () => {
      if (leafletMapRef.current && moveEndHandler) { leafletMapRef.current.off('moveend', moveEndHandler); leafletMapRef.current.off('zoomend', zoomEndHandler!); }
    };
  }, [activeTab, buscarLinhasPontoInterno]);

  // Splash
  if (isSplash) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-10 overflow-hidden text-center">
        <div className="relative mb-8 flex flex-col items-center scale-110">
          <div className="w-40 h-40 bg-yellow-400 rounded-[3rem] flex items-center justify-center shadow-[0_0_50px_rgba(251,191,36,0.4)] mb-8 transform rotate-[-5deg] overflow-hidden">
            <img src="/logo.png" alt="Cadê meu Baú" className="w-32 h-32 object-contain" onError={e => { e.currentTarget.style.display='none'; e.currentTarget.parentElement!.innerHTML='<span class="text-8xl">🚍</span>'; }} />
          </div>
          <div className="bg-yellow-400 text-black px-6 py-2 font-black italic text-2xl skew-x-[-12deg] shadow-[8px_8px_0px_rgba(251,191,36,0.3)] uppercase tracking-tighter">Cadê meu Baú?</div>
        </div>
        <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full bg-yellow-400 w-1/2 animate-[loading_1.5s_infinite_linear]" />
        </div>
        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.5em] text-slate-500 animate-pulse">Rastreando Linhas...</p>
        <style>{`@keyframes loading { from { left: -50%; } to { left: 100%; } }`}</style>
      </div>
    );
  }

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
          { icon: '/localizacao.png', title: 'Bem-vindo ao Cadê meu Baú!', desc: 'Consulte em segundos quando o seu ônibus chega em qualquer ponto de Goiânia.', tip: null },
          { icon: '/informacao.png', title: 'Encontre o número do ponto', desc: 'O número está na plaquinha fixada no poste do ponto de ônibus.', tip: 'Geralmente tem 5 dígitos. Ex: 31700, 42150' },
          { icon: '/buscar.png', title: 'Digite e busque', desc: 'Cole o número no campo "Número do Ponto" e toque em Localizar Baú.', tip: 'Os dados atualizam sozinhos a cada 20 segundos!' },
          { icon: '/favorito.png', title: 'Salve seus favoritos', desc: 'Toque na estrela de uma linha para salvá-la. Na próxima vez ela já aparece atualizada.', tip: 'Segure o dedo num card salvo para dar um apelido a ele.' },
        ];
        const step = steps[onboardingStep]; const isLast = onboardingStep === steps.length - 1;
        return (
          <div className="fixed inset-0 bg-black/90 z-[200] flex items-end justify-center p-4" style={{ animation: 'slideUp 0.3s ease-out' }}>
            <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-5`}>
              <div className="flex justify-center gap-2">{steps.map((_,i) => <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i===onboardingStep?'w-6 bg-yellow-400':'w-1.5 bg-white/20'}`} />)}</div>
              <div className="text-center space-y-3">
                <img src={step.icon} alt="" className="mx-auto" style={{width:64,height:64,objectFit:"contain"}} />
                <p className="font-black text-lg uppercase tracking-tight text-white leading-tight">{step.title}</p>
                <p className={`text-sm ${theme.subtext} leading-relaxed`}>{step.desc}</p>
                {step.tip && <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl px-4 py-3"><p className="text-[11px] font-bold text-yellow-400 leading-relaxed">{step.tip}</p></div>}
              </div>
              <div className="flex gap-3">
                {onboardingStep > 0 && <button onClick={() => setOnboardingStep(p=>p-1)} className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border ${theme.subtext} ${lightTheme?'border-gray-300':'border-white/10'}`}>Voltar</button>}
                <button onClick={() => { if(isLast){localStorage.setItem('cade_meu_bau_onboarding_done','true');setShowOnboarding(false);haptic(50);}else{setOnboardingStep(p=>p+1);haptic(30);} }} className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform">
                  {isLast ? 'Vamos lá!' : 'Próximo →'}
                </button>
              </div>
              {!isLast && <button onClick={() => {localStorage.setItem('cade_meu_bau_onboarding_done','true');setShowOnboarding(false);}} className={`w-full text-center text-[9px] font-black uppercase tracking-widest ${theme.subtext} opacity-40`}>Pular tutorial</button>}
            </div>
          </div>
        );
      })()}

      {/* Modal alerta */}
      {notifications.showAlertModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center p-4" onClick={() => notifications.setShowAlertModal(null)}>
          <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-4`} onClick={e=>e.stopPropagation()} style={{animation:'slideUp 0.25s ease-out'}}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400"><img src="/alert_on.png" alt="" style={{width:16,height:16,objectFit:"contain",display:"inline",marginRight:6}}/>Alertar quando chegar</p>
              <button onClick={() => notifications.setShowAlertModal(null)} className="p-1 active:scale-95"><img src="/fechar.png" alt="" style={{width:20,height:20,objectFit:"contain"}}/></button>
            </div>
            <p className={`text-[9px] font-bold ${theme.subtext} uppercase tracking-widest`}>Notificar quando o baú estiver a:</p>
            <div className="grid grid-cols-2 gap-3">
              {[2,5,10,15].map(min => (
                <button key={min} onClick={() => notifications.setAlert(notifications.showAlertModal!, min)} className={`${theme.card} border rounded-2xl py-4 font-black text-center active:scale-95 transition-transform hover:border-yellow-400`}>
                  <span className="block text-2xl font-black text-yellow-400">{min}</span>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>minutos</span>
                </button>
              ))}
            </div>
            {notifications.notifPermission === 'denied' && <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest text-center">Notificações bloqueadas. Ative nas configurações do navegador.</p>}
          </div>
        </div>
      )}

      {/* Modal nickname */}
      {editingNickname && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center p-4" onClick={() => setEditingNickname(null)}>
          <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-4`} onClick={e=>e.stopPropagation()} style={{animation:'slideUp 0.25s ease-out'}}>
            <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400"><img src="/editar.png" alt="" style={{width:18,height:18,objectFit:"contain"}}/> Apelido da Linha</p>
            <input id="nickname-input" type="text" placeholder="Ex: Meu trabalho, Casa da mãe..." value={nicknameInput} onChange={e=>setNicknameInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveNickname()} maxLength={30}
              className={`w-full ${theme.input} border rounded-2xl px-4 py-4 font-black outline-none focus:border-yellow-400 transition-all text-base`}/>
            <div className="flex gap-3">
              <button onClick={() => {setNicknameInput('');saveNickname();}} className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border ${theme.subtext} ${lightTheme?'border-gray-300':'border-white/10'}`}>Remover apelido</button>
              <button onClick={saveNickname} className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal iOS */}
      {showIosInstructions && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-end justify-center p-4" onClick={() => setShowIosInstructions(false)}>
          <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-5`} onClick={e=>e.stopPropagation()} style={{animation:'slideUp 0.3s ease-out'}}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400">Como instalar</p>
              <button onClick={() => setShowIosInstructions(false)} className="p-1 active:scale-95"><img src="/fechar.png" alt="" style={{width:20,height:20,objectFit:"contain"}}/></button>
            </div>
            <div className="space-y-3">
              {(isIosDevice ? [
                {icon:'1️⃣',title:'Toque no botão compartilhar',desc:'O ícone ↑ na barra inferior do Safari'},
                {icon:'2️⃣',title:'Role para baixo',desc:'Procure "Adicionar à Tela de Início"'},
                {icon:'3️⃣',title:'Toque em "Adicionar"',desc:'O app aparecerá na sua tela inicial!'},
              ]:[
                {icon:'1️⃣',title:'Toque no menu do Chrome',desc:'Os três pontinhos ⋮ no canto superior direito'},
                {icon:'2️⃣',title:'Selecione a opção',desc:'"Adicionar à tela inicial" ou "Instalar app"'},
                {icon:'3️⃣',title:'Confirme a instalação',desc:'Pronto! O ícone aparece na sua tela inicial!'},
              ]).map(step => (
                <div key={step.icon} className={`flex items-start gap-3 ${theme.card} border rounded-2xl p-3`}>
                  <span className="text-2xl shrink-0">{step.icon}</span>
                  <div><p className="font-black text-[11px] uppercase tracking-wide">{step.title}</p><p className={`text-[9px] ${theme.subtext} font-bold mt-0.5`}>{step.desc}</p></div>
                </div>
              ))}
            </div>
            <button onClick={() => {setShowIosInstructions(false);dismissInstallBanner();}} className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest">Entendi!</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`pt-[env(safe-area-inset-top)] ${theme.header} border-b p-4 flex justify-between items-center shrink-0 z-50`}>
        <div className="font-black italic text-yellow-400 text-xl tracking-tighter skew-x-[-10deg]">CADÊ MEU BAÚ?</div>
        <div className="flex items-center gap-3">
          {staleData && <div className="text-[8px] font-black uppercase tracking-widest text-red-400 animate-pulse border border-red-500/30 px-2 py-1 rounded-xl">Sem internet</div>}
          {((activeTab==='search'&&busLines.length>0&&!isLoading)||(activeTab==='favs'&&favoriteBusLines.length>0&&!isFavoritesLoading)) && (
            <div className="text-right flex flex-col items-end">
              <span className={`text-[7px] font-black ${theme.subtext} uppercase leading-none mb-0.5`}>Auto-Refresh</span>
              <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/><span className="text-sm font-black text-yellow-400 tabular-nums leading-none">{countdown}s</span></div>
            </div>
          )}
          {(isLoading||isFavoritesLoading) && <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"/>}
          <button onClick={() => {setLightTheme(p=>!p);haptic(30);}} className={`text-xl p-1.5 transition-all active:scale-110 ${theme.subtext}`}>{lightTheme?'🌙':'☀️'}</button>
        </div>
      </header>

      <div className="flex-grow overflow-y-auto app-container px-4 pt-4 pb-32 space-y-5">

        {showUpdateBanner && (
          <div style={{animation:'slideUp 0.4s ease-out'}}>
            <div className="bg-emerald-500 rounded-[2rem] p-4 flex items-center gap-3 shadow-[0_8px_30px_rgba(16,185,129,0.4)]">
              <img src="/alert_on.png" alt="" style={{width:32,height:32,objectFit:"contain",flexShrink:0}}/>
              <div className="flex-1 min-w-0"><p className="font-black text-white text-[11px] uppercase tracking-wider leading-tight">Nova versão disponível!</p><p className="text-white/70 text-[9px] font-bold uppercase tracking-widest leading-tight mt-0.5">Toque para atualizar agora</p></div>
              <button onClick={() => {applyUpdate();haptic(50);}} className="bg-white text-emerald-600 font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 shrink-0">Atualizar</button>
            </div>
          </div>
        )}

        {showInstallBanner && !isInstalled && (
          <div style={{animation:'slideUp 0.4s ease-out'}}>
            <div className="bg-yellow-400 rounded-[2rem] p-4 flex items-center gap-3 shadow-[0_8px_30px_rgba(251,191,36,0.4)]">
              <img src="/buscar.png" alt="" style={{width:32,height:32,objectFit:"contain",flexShrink:0}}/>
              <div className="flex-1 min-w-0"><p className="font-black text-black text-[11px] uppercase tracking-wider leading-tight">Instale o app!</p><p className="text-black/60 text-[9px] font-bold uppercase tracking-widest leading-tight mt-0.5">Acesso rápido • Funciona offline</p></div>
              <div className="flex gap-2 shrink-0">
                <button onClick={handleInstall} className="bg-black text-yellow-400 font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95">Instalar</button>
                <button onClick={dismissInstallBanner} className="p-1"><img src="/fechar.png" alt="" style={{width:20,height:20,objectFit:"contain",opacity:0.5}}/></button>
              </div>
            </div>
          </div>
        )}

        {/* ABA BUSCA */}
        {activeTab === 'search' && (
          <div className="page-enter space-y-5">
            <div className={`${theme.inputWrap} border p-5 rounded-[2.5rem] shadow-2xl space-y-4`}>
              <div className="flex gap-2">
                <div className="flex-[3] relative">
                  <span className={`absolute left-4 top-2 text-[8px] font-black ${theme.subtext} uppercase pointer-events-none`}>Número do Ponto</span>
                  <input type="text" inputMode="numeric" placeholder="Ex: 31700" value={stopId} onChange={e=>setStopId(e.target.value)} onKeyDown={handleKeyDown}
                    className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-xl`}/>
                </div>
                <div className="flex-[2] relative">
                  <span className={`absolute left-0 top-2 text-[8px] font-black ${theme.subtext} uppercase text-center w-full pointer-events-none`}>Linha (OPCIONAL)</span>
                  <input type="text" placeholder="Ex: 327" value={lineFilter} onChange={e=>setLineFilter(e.target.value)} onKeyDown={handleKeyDown}
                    className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-xl text-center`}/>
                </div>
              </div>
              <button onClick={() => handleSearch()} disabled={isLoading} className="w-full bg-yellow-400 text-black py-5 rounded-2xl font-black btn-active uppercase text-sm tracking-[0.2em] shadow-[0_10px_30px_rgba(251,191,36,0.3)] disabled:opacity-50 transition-all">
                {isLoading ? 'Rastreando...' : 'Localizar Baú'}
              </button>
              {searchHistory.length > 0 && busLines.length === 0 && !isLoading && (
                <div>
                  <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2 px-1`}>Buscas Recentes</p>
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.map(h => (
                      <button key={h} onClick={() => {setStopId(h);handleSearch(h);haptic(30);}} className={`${theme.historyBtn} border text-xs font-black px-3 py-2 rounded-xl active:scale-95 transition-transform tracking-wider`}>📍 {h}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (() => {
              const errors: Record<string,{icon:string;title:string;desc:string;color:string}> = {
                offline:      {icon:'/informacao.png',title:'Sem conexão',desc:'Verifique sua internet e tente novamente.',color:'border-slate-500/30 text-slate-400 bg-slate-500/10'},
                not_found:    {icon:'📍',title:'Ponto não encontrado',desc:`O ponto "${stopId}" não existe ou está inativo.`,color:'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'},
                no_lines:     {icon:'/onibus_realtime.png',title:'Linha não opera aqui',desc:`A linha "${lineFilter}" não para neste ponto agora.`,color:'border-orange-500/30 text-orange-400 bg-orange-500/10'},
                invalid_stop: {icon:'/alerta.png',title:'Número inválido',desc:'Digite um número de ponto válido. Ex: 31700',color:'border-red-500/30 text-red-400 bg-red-500/10'},
              };
              const e = errors[errorMsg] ?? errors['offline'];
              return (
                <div className={`border p-4 rounded-2xl flex items-start gap-3 ${e.color}`}>
                  {e.icon.startsWith('/') ? <img src={e.icon} alt="" style={{width:28,height:28,objectFit:"contain",flexShrink:0}}/> : <span style={{fontSize:24,flexShrink:0,lineHeight:1}}>{e.icon}</span>}
                  <div>
                    <p className="font-black text-[11px] uppercase tracking-widest">{e.title}</p>
                    <p className="text-[9px] font-bold mt-1 opacity-80 leading-relaxed">{e.desc}</p>
                    {errorMsg==='offline' && <button onClick={() => handleSearch()} className="mt-2 text-[9px] font-black uppercase tracking-widest underline opacity-70">Tentar novamente →</button>}
                  </div>
                </div>
              );
            })()}

            {isLoading && [0,1,2].map(i => <div key={i} className="stagger-card" style={{animationDelay:`${i*80}ms`}}><SkeletonCard light={lightTheme}/></div>)}

            {!isLoading && (
              <div className="space-y-3">
                {busLines.map((line, i) => {
                  const sId = line.stopSource ?? stopId;
                  const miniKey = `${line.number}-${sId}`;
                  const stopCoords = getStopCoords(sId);
                  const isActive = activeMiniMap?.key === miniKey;
                  return (
                    <div key={line.id} className="stagger-card" style={{animationDelay:`${i*60}ms`}}>
                      <BusLineCard line={line} staggerIndex={i} {...cardProps}/>
                      {liveLineMap[line.number] && (
                        <button
                          onClick={() => { haptic(40); toggleMiniMap({ key: miniKey, lineNumber: line.number, stopLat: stopCoords.lat, stopLng: stopCoords.lng, stopNome: stopCoords.nome ?? `Ponto ${sId}`, destination: line.destination }); }}
                          className={`w-full mt-1 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all ${isActive ? 'bg-blue-700 text-white' : 'bg-blue-600/15 text-blue-400 border border-blue-500/30'}`}>
                          <img src="/onibus_realtime.png" alt="" style={{width:16,height:16,objectFit:'contain'}}/>
                          {isActive ? 'Fechar mapa ao vivo' : `Ver linha ${line.number} ao vivo`}
                          {!isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>}
                        </button>
                      )}
                      {isActive && activeMiniMap && (
                        <MiniMap stopLat={activeMiniMap.stopLat} stopLng={activeMiniMap.stopLng} stopNome={activeMiniMap.stopNome} lineNumber={activeMiniMap.lineNumber} destination={activeMiniMap.destination} onClose={() => setActiveMiniMap(null)} theme={theme} lightTheme={lightTheme}/>
                      )}
                    </div>
                  );
                })}
                {busLines.length === 0 && !errorMsg && (
                  <div className="py-20 text-center opacity-10 flex flex-col items-center">
                    <img src="/onibus_realtime.png" alt="" className="mb-6" style={{width:90,height:90,objectFit:"contain",opacity:0.15}}/>
                    <p className={`font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed ${theme.subtext}`}>Aguardando número do ponto...</p>
                  </div>
                )}
              </div>
            )}
            <a href="https://forms.gle/JwtHNRw7pjaZtfV19" target="_blank" rel="noopener noreferrer" onClick={() => haptic(30)} className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border ${lightTheme?'border-gray-200 text-gray-400':'border-white/5 text-slate-600'} transition-all font-black text-[10px] uppercase tracking-widest`}>
              💬 Algo errado? Me avisa
            </a>
          </div>
        )}

        {/* ABA FAVORITOS */}
        {activeTab === 'favs' && (
          <div className="page-enter space-y-4">
            <div className="flex items-center justify-between px-2 mb-2">
              <h2 className={`text-[10px] font-black uppercase tracking-[0.5em] ${theme.subtext} flex items-center gap-2`}>
                <img src="/favorito.png" alt="" style={{width:18,height:18,objectFit:"contain"}}/> Minha Garagem
              </h2>
              {favorites.length > 0 && !isFavoritesLoading && (
                <button onClick={() => {loadFavoritesSchedules(favorites);haptic(30);}} className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} border ${lightTheme?'border-gray-300':'border-white/10'} px-3 py-2 rounded-xl active:scale-95 transition-transform`}>Atualizar</button>
              )}
            </div>
            {favorites.length > 0 && !isFavoritesLoading && <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest px-2 opacity-50`}><img src="/editar.png" alt="" style={{width:14,height:14,objectFit:"contain"}}/> Segure o dedo em um card para dar apelido</p>}
            {isFavoritesLoading && favorites.slice(0,3).map((_,i) => <div key={i} className="stagger-card" style={{animationDelay:`${i*80}ms`}}><SkeletonCard light={lightTheme}/></div>)}
            {!isFavoritesLoading && Object.entries(groupedFavLines).map(([pontoId, lines]) => (
              <div key={pontoId} className="space-y-3">
                <div className="flex items-center gap-2 px-1 pt-2">
                  📍<span className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>Ponto {pontoId}</span>
                  <div className={`flex-1 h-px ${theme.divider}`}/>
                </div>
                {lines.map((line, i) => {
                  const key = `${line.stopSource ?? stopId}::${line.number}`;
                  return (
                    <div key={line.id} className="stagger-card" style={{animationDelay:`${i*60}ms`}}>
                      <BusLineCard line={line} isRemoving={removingFavKey===key} staggerIndex={i} {...cardProps}/>
                    </div>
                  );
                })}
              </div>
            ))}
            {favorites.length === 0 && <div className="py-28 text-center opacity-20 px-10"><p className="font-black text-[12px] uppercase tracking-[0.3em] mb-4">Garagem Vazia</p><p className="text-[10px] leading-relaxed uppercase tracking-widest font-bold">Toque na estrela de uma linha para que ela apareça aqui.</p></div>}
            {!isFavoritesLoading && favorites.length > 0 && favoriteBusLines.length === 0 && (
              <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-2xl px-4 py-4 flex items-start gap-3">
                <img src="/alerta.png" alt="" style={{width:24,height:24,objectFit:"contain",flexShrink:0,marginTop:2}}/>
                <div>
                  <p className="font-black text-[11px] text-yellow-400 uppercase tracking-widest">Sem horários disponíveis</p>
                  <p className={`text-[9px] font-bold mt-1 ${theme.subtext} leading-relaxed`}>Os pontos salvos podem estar sem operação agora. Tente atualizar.</p>
                  <button onClick={() => {loadFavoritesSchedules(favorites);haptic(30);}} className="mt-2 text-[9px] font-black uppercase tracking-widest text-yellow-400 underline">Tentar novamente →</button>
                </div>
              </div>
            )}
            <a href="https://forms.gle/JwtHNRw7pjaZtfV19" target="_blank" rel="noopener noreferrer" onClick={() => haptic(30)} className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border ${lightTheme?'border-gray-200 text-gray-400':'border-white/5 text-slate-600'} transition-all font-black text-[10px] uppercase tracking-widest`}>
              💬 Algo errado? Me avisa
            </a>
          </div>
        )}

        {/* ABA SITPASS */}
        {activeTab === 'sitpass' && (
          <div className="page-enter space-y-5">
            <div className={`${theme.inputWrap} border p-5 rounded-[2.5rem] shadow-2xl space-y-4`}>
              <div className="relative">
                <span className={`absolute left-4 top-2 text-[8px] font-black ${theme.subtext} uppercase pointer-events-none`}>CPF</span>
                <input type="text" inputMode="numeric" placeholder="000.000.000-00" value={sitpass.cpfSitpass} onChange={sitpass.handleCpfChange} onKeyDown={e=>e.key==='Enter'&&sitpass.consultarSaldo()} maxLength={14}
                  className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none transition-all placeholder:text-slate-700 text-xl ${sitpass.cpfError?'border-red-500':'focus:border-yellow-400'}`}/>
                {sitpass.cpfError && <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mt-2 px-1">{sitpass.cpfError}</p>}
              </div>
              <button onClick={sitpass.consultarSaldo} disabled={sitpass.saldoLoading} className="w-full bg-yellow-400 text-black py-5 rounded-2xl font-black btn-active uppercase text-sm tracking-[0.2em] shadow-[0_10px_30px_rgba(251,191,36,0.3)] disabled:opacity-50 transition-all">
                {sitpass.saldoLoading ? 'Consultando...' : 'Consultar Saldo'}
              </button>
            </div>
            {sitpass.saldoErro && <div className="border border-red-500/30 bg-red-500/10 text-red-400 p-4 rounded-2xl flex items-start gap-3"><img src="/alerta.png" alt="" style={{width:24,height:24,objectFit:"contain",flexShrink:0}}/><div><p className="font-black text-[11px] uppercase tracking-widest">Erro</p><p className="text-[9px] font-bold mt-1 opacity-80">{sitpass.saldoErro}</p></div></div>}
            {sitpass.saldoData && (
              <div className="border border-yellow-400/20 bg-yellow-400/5 rounded-[2.5rem] p-6 space-y-4" style={{animation:'slideUp 0.3s ease-out'}}>
                <div className="flex items-center gap-3">
                  <img src="/sitpass.png" alt="" style={{width:48,height:48,objectFit:'contain',borderRadius:8}}/>
                  <div>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>Bilhete Único</p>
                    <p className={`font-black text-sm uppercase ${theme.saldoText}`}>{sitpass.saldoData.cartaoDescricao}</p>
                    <p className={`text-[9px] font-bold ${theme.subtext}`}>Nº {sitpass.saldoData.cartaoNumero}</p>
                  </div>
                </div>
                <div className={`${theme.divider} h-px w-full`}/>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Saldo disponível</span>
                  <span className="text-4xl font-black text-yellow-400">{sitpass.saldoData.saldo_formatado}</span>
                </div>
                {(() => {
                  const n = parseFloat(sitpass.saldoData.saldo.replace('.','').replace(',','.'));
                  if (n < 2.15) return <div className="border border-red-500/30 bg-red-500/10 rounded-2xl px-4 py-3 flex items-start gap-2"><img src="/alerta.png" alt="" style={{width:20,height:20,objectFit:"contain",flexShrink:0,marginTop:2}}/><p className="text-[9px] font-bold leading-relaxed text-red-400">Saldo insuficiente para qualquer passagem (nem meia tarifa de R$ 2,15). Recarregue antes de embarcar.</p></div>;
                  if (n < 4.30) return <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-2xl px-4 py-3 flex items-start gap-2"><img src="/alerta.png" alt="" style={{width:20,height:20,objectFit:"contain",flexShrink:0,marginTop:2}}/><p className="text-[9px] font-bold leading-relaxed text-yellow-400">Saldo insuficiente para a tarifa inteira (R$ 4,30). Recarregue antes de embarcar.</p></div>;
                  return null;
                })()}
                <div className={`border ${lightTheme?'border-gray-200 bg-gray-50':'border-white/5 bg-black/20'} rounded-2xl px-4 py-3 flex items-start gap-2`}>
                  <img src="/informacao.png" alt="" style={{width:20,height:20,objectFit:"contain",flexShrink:0,marginTop:2}}/>
                  <p className={`text-[9px] font-bold leading-relaxed ${theme.subtext}`}>O saldo não é em tempo real — é o último valor registrado no sistema do SitPass.</p>
                </div>
              </div>
            )}
            {!sitpass.saldoData && !sitpass.saldoErro && !sitpass.saldoLoading && (
              <div className="space-y-4">
                {sitpass.saldoHistorico && (
                  <div className={`border ${lightTheme?'border-gray-200 bg-white':'border-white/5 bg-slate-900'} rounded-[2rem] p-5 space-y-3`} style={{animation:'slideUp 0.3s ease-out'}}>
                    <div className="flex items-center justify-between">
                      <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>Última consulta</p>
                      <p className={`text-[8px] font-bold ${theme.subtext}`}>{sitpass.saldoHistorico.data} às {sitpass.saldoHistorico.hora}</p>
                    </div>
                    <div className={`${theme.divider} h-px w-full`}/>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3"><img src="/sitpass.png" alt="" style={{width:36,height:36,objectFit:'contain',borderRadius:6}}/><div><p className={`text-[9px] font-bold ${theme.subtext}`}>{sitpass.saldoHistorico.cartaoDescricao}</p><p className={`text-[8px] ${theme.subtext} opacity-50`}>Valor pode estar desatualizado</p></div></div>
                      <span className="text-2xl font-black text-yellow-400 shrink-0">{sitpass.saldoHistorico.saldo_formatado}</span>
                    </div>
                  </div>
                )}
                <div className="py-16 text-center opacity-10 flex flex-col items-center">
                  <img src="/sitpass.png" alt="" className="mb-6" style={{width:100,height:100,objectFit:'contain',opacity:0.2,borderRadius:12}}/>
                  <p className={`font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed ${theme.subtext}`}>Digite seu CPF para consultar o saldo</p>
                </div>
              </div>
            )}
            <a href="https://forms.gle/JwtHNRw7pjaZtfV19" target="_blank" rel="noopener noreferrer" onClick={() => haptic(30)} className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border ${lightTheme?'border-gray-200 text-gray-400':'border-white/5 text-slate-600'} transition-all font-black text-[10px] uppercase tracking-widest`}>
              💬 Algo errado? Me avisa
            </a>
          </div>
        )}
      </div>

      {/* ABA MAPA */}
      <div style={{position:'fixed',top:'64px',left:0,right:0,bottom:'90px',zIndex:40,display:activeTab==='map'?'block':'none'}}>
        <div ref={mapRef} style={{width:'100%',height:'100%'}}/>

        {locationError && (
          <div className={`absolute top-3 left-3 right-3 z-[1000] border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest`} style={{backdropFilter:'blur(8px)'}}>
            📍 Localização negada — mostrando Senador Canedo
          </div>
        )}

        {selectedStop && (
          <div
            className={`absolute left-0 right-0 z-[1000] ${theme.card} border-t rounded-t-[2rem]`}
            style={{bottom:0,animation:'slideUp 0.3s ease-out',maxHeight:'75%',display:'flex',flexDirection:'column'}}
            onTouchStart={(e) => {
              const startY = e.touches[0].clientY; const el = e.currentTarget; let lastY = startY;
              const onMove = (ev: TouchEvent) => { const dy=ev.touches[0].clientY-startY; lastY=ev.touches[0].clientY; if(dy>0) el.style.transform=`translateY(${dy}px)`; };
              const onEnd = () => { const dy=lastY-startY; el.style.transform=''; if(dy>80){setSelectedStop(null);setStopLines([]);setActiveMiniMap(null);} document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onEnd); };
              document.addEventListener('touchmove',onMove,{passive:true}); document.addEventListener('touchend',onEnd);
            }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab"><div className="w-10 h-1 rounded-full bg-white/20"/></div>
            <div className="flex items-start justify-between px-5 pt-2 pb-3 shrink-0">
              <div>
                <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>📍 Ponto selecionado</p>
                <p className="font-black text-base text-yellow-400 mt-1">{selectedStop.nome}</p>
                <p className={`text-[10px] font-bold ${theme.subtext} mt-0.5`}>Nº {selectedStop.id}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {!stopLinesLoading && <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/><span className={`text-[9px] font-black tabular-nums ${theme.subtext}`}>{mapRefreshCountdown}s</span></div>}
                <button onClick={() => {setSelectedStop(null);setStopLines([]);setActiveMiniMap(null);}} className="p-1 active:scale-95"><img src="/fechar.png" alt="" style={{width:20,height:20,objectFit:"contain"}}/></button>
              </div>
            </div>

            <div style={{overflowY:'auto',flex:1,paddingBottom:'12px'}} className="px-5 space-y-2">
              {stopLinesLoading && <div className="flex items-center gap-3 py-2"><div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0"/><p className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Buscando ônibus...</p></div>}
              {stopLinesError && !stopLinesLoading && <div className="border border-red-500/30 bg-red-500/10 rounded-2xl px-4 py-3"><p className="text-[10px] font-black text-red-400 uppercase tracking-widest">{stopLinesError==='offline'?'Sem conexão':'Nenhuma linha encontrada'}</p></div>}

              {!stopLinesLoading && stopLines.map((line) => {
                const getColor = (t: string) => {
                  if (!t||t==='SEM PREVISÃO') return 'bg-slate-800 text-slate-500';
                  if (t.toLowerCase().includes('agora')) return 'bg-red-600 text-white';
                  const m=parseInt(t)||999; if(m<=3) return 'bg-red-600 text-white'; if(m<=8) return 'bg-yellow-500 text-black'; return 'bg-emerald-500 text-white';
                };
                const miniKey = `map-${line.number}-${selectedStop.id}`;
                const isMapMiniActive = activeMiniMap?.key === miniKey;
                const stopCoordsMap = pontosDataRef.current.find(p => p.id === selectedStop.id);
                return (
                  <div key={line.id}>
                    <div className={`${theme.card} border rounded-2xl px-4 py-3 flex items-center gap-3`}>
                      <span className="text-yellow-400 font-black text-xl w-14 text-center shrink-0">{line.number}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>Indo para</p>
                        <p className={`font-black text-[11px] uppercase truncate ${theme.destText}`}>{line.destination}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex gap-1.5">
                          <div className={`${getColor(line.nextArrival??'')} rounded-xl px-2 py-1.5 text-center min-w-[44px]`}><p className="font-black text-sm leading-none">{line.nextArrival==='SEM PREVISÃO'?'—':line.nextArrival}</p><p className="text-[6px] font-black uppercase opacity-70 mt-0.5">min</p></div>
                          <div className={`${getColor(line.subsequentArrival??'')} rounded-xl px-2 py-1.5 text-center min-w-[44px] opacity-80`}><p className="font-black text-sm leading-none">{line.subsequentArrival==='SEM PREVISÃO'?'—':line.subsequentArrival}</p><p className="text-[6px] font-black uppercase opacity-70 mt-0.5">min</p></div>
                        </div>
                        {/* Botão ao vivo pequeno — só aparece se tem ônibus rastreável */}
                        {stopLiveLinesMap[line.number] && stopCoordsMap && (
                          <button
                            onClick={() => { haptic(40); toggleMiniMap({ key: miniKey, lineNumber: line.number, stopLat: stopCoordsMap.lat, stopLng: stopCoordsMap.lng, stopNome: selectedStop.nome, destination: line.destination }); }}
                            className={`rounded-xl p-2 transition-all active:scale-95 border ${isMapMiniActive?'bg-blue-600 border-blue-500':'bg-blue-600/15 border-blue-500/30'}`}
                            title="Ver ao vivo"
                          >
                            <img src="/onibus_realtime.png" alt="Ao vivo" style={{width:18,height:18,objectFit:'contain'}}/>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* MiniMap no bottom sheet do mapa */}
                    {isMapMiniActive && activeMiniMap && stopCoordsMap && (
                      <MiniMap stopLat={stopCoordsMap.lat} stopLng={stopCoordsMap.lng} stopNome={selectedStop.nome} lineNumber={line.number} destination={line.destination} onClose={() => setActiveMiniMap(null)} theme={theme} lightTheme={lightTheme}/>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!mapReady && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 z-[999] ${theme.bg}`}>
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"/>
            <p className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Carregando mapa...</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={`fixed bottom-0 left-0 right-0 ${theme.nav} border-t px-6 pb-12 pt-5 flex justify-between items-center z-50`}>
        {[
          {tab:'search',icon:'/buscar.png',label:'Busca'},
          {tab:'favs',icon:'/salvos.png',label:'Salvos',badge:favCount},
          {tab:'map',icon:'/mapa.png',label:'Mapa'},
          {tab:'sitpass',icon:'/sitpass.png',label:'SitPass'},
        ].map(({tab,icon,label,badge}) => (
          <button key={tab} onClick={() => {setActiveTab(tab as ActiveTab);haptic(30);}} className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab===tab?'scale-125 opacity-100':'opacity-40'}`}>
            <div className="relative" style={{width:28,height:28}}>
              <img src={icon} alt={label} style={{width:28,height:28,objectFit:'contain'}}/>
              {badge!=null && badge>0 && <span className="absolute -top-2 -right-2 bg-yellow-400 text-black text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">{badge>9?'9+':badge}</span>}
            </div>
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${activeTab===tab?'text-yellow-400':theme.inactiveNav}`}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
