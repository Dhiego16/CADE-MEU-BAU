import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ActiveTab, BusLine, LeafletMap, LeafletMarker, PontoDataWithMarker } from './types';
import { haptic, shareLine, REFRESH_INTERVAL, SPLASH_DURATION } from './utils';
import { buildTheme } from './utils/theme';
import { useBusSearch } from './hooks/useBusSearch';
import { useFavorites } from './hooks/useFavorites';
import { useNotifications } from './hooks/useNotifications';
import { useSitpass } from './hooks/useSitpass';
import { usePWA } from './hooks/usePWA';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useNearbyStops } from './hooks/useNearbyStops';
import { useTripMode } from './hooks/useTripMode';

// Components
import SplashScreen from './components/SplashScreen';
import AppHeader from './components/AppHeader';
import BottomNav from './components/BottomNav';
import PWABanners from './components/PWABanners';
import TripModeOverlay from './components/TripModeOverlay';

// Modals
import OnboardingModal from './components/modals/OnboardingModal';
import AlertModal from './components/modals/AlertModal';
import NicknameModal from './components/modals/NicknameModal';
import IosInstallModal from './components/modals/IosInstallModal';

// Tabs
import SearchTab from './components/tabs/SearchTab';
import FavsTab from './components/tabs/FavsTab';
import SitPassTab from './components/tabs/SitPassTab';
import MapTab from './components/tabs/MapTab';

import PONTOS_DATA from './pontos.json';

interface MiniMapConfig {
  key: string;
  lineNumber: string;
  stopLat: number;
  stopLng: number;
  stopNome: string;
  destination: string;
}

const App: React.FC = () => {
  // ── Theme & tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [isSplash, setIsSplash] = useState(true);
  const [lightTheme, setLightTheme] = useState(() => {
    try { return localStorage.getItem('cade_meu_bau_theme') === 'light'; } catch { return false; }
  });

  // ── Onboarding ─────────────────────────────────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [destFilter, setDestFilter] = useState('');

  // ── MiniMap ────────────────────────────────────────────────────────────────
  const [activeMiniMap, setActiveMiniMap] = useState<MiniMapConfig | null>(null);
  const [miniMapRefreshKey, setMiniMapRefreshKey] = useState(0);

  // ── Map state ──────────────────────────────────────────────────────────────
  const [mapReady, setMapReady] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [showMapOnboarding, setShowMapOnboarding] = useState(() => {
    try { return !localStorage.getItem('cade_meu_bau_map_onboarding_done'); } catch { return true; }
  });
  const [selectedStop, setSelectedStop] = useState<{ id: string; nome: string } | null>(null);
  const [stopLines, setStopLines] = useState<BusLine[]>([]);
  const [stopLinesLoading, setStopLinesLoading] = useState(false);
  const [stopLinesError, setStopLinesError] = useState<string | null>(null);
  const [stopLiveLinesMap, setStopLiveLinesMap] = useState<Record<string, boolean>>({});
  const [mapRefreshCountdown, setMapRefreshCountdown] = useState(15);

  // ── Map refs ───────────────────────────────────────────────────────────────
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const pontosDataRef = useRef<PontoDataWithMarker[]>([]);
  const leafletLoadingRef = useRef(false);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const filtrarMarkersPorRaioRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const selectedStopRef = useRef<{ id: string; nome: string } | null>(null);
  const mapRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTabRef = useRef<string>('');
  const pontoCacheRef = useRef<Map<string, { data: BusLine[]; ts: number }>>(new Map());

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const pwa = usePWA();
  const notifications = useNotifications();
  const sitpass = useSitpass();
  const { nearbyStops, locationStatus, requestLocation } = useNearbyStops();

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

  // ── Trip Mode ──────────────────────────────────────────────────────────────
  const tripMode = useTripMode(notifications.sendNotification);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const parseTime = (t?: string): number => {
    if (!t || t === 'SEM PREVISÃO') return 9999;
    if (t.toLowerCase().includes('agora')) return 0;
    return parseInt(t.replace(/\D/g, '')) || 9999;
  };

  const processLines = useCallback((lines: BusLine[]) => {
    if (!destFilter.trim()) return lines;
    const q = destFilter.trim().toUpperCase();
    return lines.filter(l => l.destination.toUpperCase().includes(q) || l.number.toUpperCase().includes(q));
  }, [destFilter]);

  const displayedBusLines = useMemo(() => processLines(busLines), [busLines, processLines]);
  const displayedFavLines = useMemo(() => processLines(favoriteBusLines), [favoriteBusLines, processLines]);

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
    onStartTrip: (line: BusLine) => {
      const sId = line.stopSource ?? stopId;
      const coords = getStopCoords(sId);
      tripMode.startTrip(line, sId, coords.nome);
    },
  }), [stopId, favorites, notifications.activeAlerts, lightTheme, theme, toggleFavorite, startLongPress, cancelLongPress, notifications.removeAlert, notifications.setShowAlertModal, tripMode.startTrip]);

  const groupedFavLines = displayedFavLines.reduce<Record<string, BusLine[]>>((acc, line) => {
    const key = line.stopSource ?? 'desconhecido';
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {});

  const getStopCoords = useCallback((stopSource: string) => {
    const normalizedId = stopSource.padStart(5, '0');
    const fromRef = pontosDataRef.current.find(p => p.id === normalizedId);
    if (fromRef) return fromRef;
    const fromJson = (PONTOS_DATA as Array<{ id: string; lat: number; lng: number; nome: string }>)
      .find(p => p.id === normalizedId);
    if (fromJson) return { ...fromJson, marker: null as unknown as LeafletMarker };
    return { lat: -16.7200, lng: -49.0900, nome: `Ponto ${stopSource}`, id: stopSource, marker: null as unknown as LeafletMarker };
  }, []);

  const toggleMiniMap = useCallback((config: MiniMapConfig) => {
    setActiveMiniMap(prev => prev?.key === config.key ? null : { ...config });
  }, []);

  const shareStop = useCallback(async (pontoId: string, nomePonto: string) => {
    const url = `${window.location.origin}?ponto=${pontoId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Cadê meu Baú?', text: `🚍 Ponto ${pontoId} — ${nomePonto}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Link copiado!');
      }
    } catch { /* cancelado */ }
    haptic(30);
  }, []);

  const goToSearchWithStop = useCallback((pontoId: string) => {
    setStopId(pontoId);
    setLineFilter('');
    setDestFilter('');
    setActiveTab('search');
    haptic(40);
    setTimeout(() => handleSearch(pontoId, ''), 120);
  }, [setStopId, setLineFilter, handleSearch]);

  // ── Map: buscar linhas do ponto ────────────────────────────────────────────
  const buscarLinhasPontoInterno = useCallback(async (pontoId: string) => {
    if (!pontoId) return;

    const cached = pontoCacheRef.current.get(pontoId);
    if (cached && Date.now() - cached.ts < 15000) {
      setStopLines(prev => prev.length === 0 ? cached.data : mergeLines(prev, cached.data));
      setStopLinesLoading(false);
      return;
    }

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

      pontoCacheRef.current.set(pontoId, { data: lines, ts: Date.now() });
      setStopLines(prev => prev.length === 0 ? lines : mergeLines(prev, lines));
      setStopLinesLoading(false);

      lines.forEach(line => {
        const key = `${pontoId}::${line.number}`;
        const mins = parseTime(line.nextArrival);
        if (mins <= 2 && !notifications.activeAlerts[key]) {
          notifications.sendNotification('🚍 Baú chegando!', `Linha ${line.number} chega em ${mins === 0 ? 'AGORA' : `${mins} min`} no ponto ${pontoId}!`);
        }
      });

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
  }, [mergeLines, notifications]);

  // ── Walking distance ───────────────────────────────────────────────────────
  const walkingMinutes = useMemo(() => {
    if (!selectedStop || !userLocationRef.current) return null;
    const p = pontosDataRef.current.find(pt => pt.id === selectedStop.id);
    if (!p) return null;
    const dLat = p.lat - userLocationRef.current.lat;
    const dLng = p.lng - userLocationRef.current.lng;
    const distM = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
    const mins = Math.round(distM / 80);
    return mins > 0 ? mins : null;
  }, [selectedStop]);

  // ── Pull to refresh ────────────────────────────────────────────────────────
  const pullEnabled = (activeTab === 'search' && busLines.length > 0) || (activeTab === 'favs' && favoriteBusLines.length > 0);
  const onPullRefresh = useCallback(() => {
    if (activeTab === 'search') handleSearch();
    else loadFavoritesWithCurrentFavs();
  }, [activeTab, handleSearch, loadFavoritesWithCurrentFavs]);
  const { pulling, pullDist } = usePullToRefresh(onPullRefresh, pullEnabled);

  // ── Effects ────────────────────────────────────────────────────────────────
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
    const shouldRun =
      (activeTab === 'search' && busLines.length > 0 && !isLoading) ||
      (activeTab === 'favs' && favoriteBusLines.length > 0 && !isFavoritesLoading);
    if (timerRef.current) clearInterval(timerRef.current);
    if (!shouldRun) { setCountdown(REFRESH_INTERVAL); return; }
    setCountdown(REFRESH_INTERVAL);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (activeTabRef.current === 'search') handleSearchRef.current();
          else loadFavoritesRef.current();
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTab, busLines.length, favoriteBusLines.length, isLoading, isFavoritesLoading]);

  useEffect(() => {
    if (busLines.length > 0) {
      notifications.checkAlerts(busLines);
      tripMode.updateFromLines(busLines);
    }
  }, [busLines]); // eslint-disable-line

  useEffect(() => {
    if (busLines.length > 0 && activeMiniMap) setMiniMapRefreshKey(k => k + 1);
  }, [busLines]); // eslint-disable-line

  useEffect(() => {
    if (favoriteBusLines.length > 0) {
      notifications.checkAlerts(favoriteBusLines);
      tripMode.updateFromLines(favoriteBusLines);
    }
  }, [favoriteBusLines]); // eslint-disable-line

  useEffect(() => {
    if (activeTab !== 'map' || !leafletMapRef.current) return;
    const t = setTimeout(() => leafletMapRef.current!.invalidateSize(), 50);
    return () => clearTimeout(t);
  }, [activeTab]);

  useEffect(() => { selectedStopRef.current = selectedStop; }, [selectedStop]);

  useEffect(() => {
    if (!selectedStop) {
      if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current);
      setMapRefreshCountdown(15);
      return;
    }
    setMapRefreshCountdown(15);
    if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current);
    mapRefreshTimerRef.current = setInterval(() => {
      setMapRefreshCountdown(prev => {
        if (prev <= 1) {
          const s = selectedStopRef.current;
          if (s) buscarLinhasPontoInterno(s.id);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current); };
  }, [selectedStop, buscarLinhasPontoInterno]);

  // ── Map: select stop handler ───────────────────────────────────────────────
  const handleSelectStop = useCallback((stop: { id: string; nome: string }) => {
    setSelectedStop(stop);
    setActiveMiniMap(null);
    setStopLines([]);
    setStopLiveLinesMap({});
    setStopLinesError(null);
    setStopLinesLoading(true);
  }, []);

  const handleCloseStop = useCallback(() => {
    setSelectedStop(null);
    setStopLines([]);
    setActiveMiniMap(null);
  }, []);

  // ── Splash ─────────────────────────────────────────────────────────────────
  if (isSplash) return <SplashScreen />;

  // ── Global styles ──────────────────────────────────────────────────────────
  const globalStyles = `
    @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes staggerIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes urgencyPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0.3); } }
    .stagger-card { animation: staggerIn 0.3s ease-out both; }
    .page-enter { animation: staggerIn 0.3s ease-out both; }
    .btn-active:active { transform: scale(0.95); opacity: 0.8; }
    .urgent-card { animation: urgencyPulse 1.5s ease-in-out infinite; border-color: rgba(239,68,68,0.5) !important; }
    ::-webkit-scrollbar { display: none; }
    .app-container { -webkit-overflow-scrolling: touch; }
  `;

  return (
    <div className={`h-screen w-screen ${theme.bg} ${theme.text} flex flex-col relative overflow-hidden transition-colors duration-300`}>
      <style>{globalStyles}</style>

      {/* ── Modo Viagem ─────────────────────────────────────────────────────── */}
      {tripMode.isActive && tripMode.tripTarget && tripMode.secondsRemaining !== null && (
        <TripModeOverlay
          tripTarget={tripMode.tripTarget}
          secondsRemaining={tripMode.secondsRemaining}
          isArriving={tripMode.isArriving}
          theme={theme}
          lightTheme={lightTheme}
          onCancel={tripMode.cancelTrip}
        />
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showOnboarding && (
        <OnboardingModal
          step={onboardingStep}
          lightTheme={lightTheme}
          theme={theme}
          onNext={() => setOnboardingStep(p => p + 1)}
          onBack={() => setOnboardingStep(p => p - 1)}
          onSkip={() => { localStorage.setItem('cade_meu_bau_onboarding_done', 'true'); setShowOnboarding(false); }}
          onFinish={() => { localStorage.setItem('cade_meu_bau_onboarding_done', 'true'); setShowOnboarding(false); }}
        />
      )}

      {notifications.showAlertModal && (
        <AlertModal
          lineKey={notifications.showAlertModal}
          notifPermission={notifications.notifPermission}
          theme={theme}
          onClose={() => notifications.setShowAlertModal(null)}
          onSetAlert={notifications.setAlert}
        />
      )}

      {editingNickname && (
        <NicknameModal
          nicknameInput={nicknameInput}
          lightTheme={lightTheme}
          theme={theme}
          onClose={() => setEditingNickname(null)}
          onSave={saveNickname}
          onRemove={() => { setNicknameInput(''); saveNickname(); }}
          onChange={setNicknameInput}
        />
      )}

      {pwa.showIosInstructions && (
        <IosInstallModal
          isIosDevice={pwa.isIosDevice}
          theme={theme}
          onClose={() => pwa.setShowIosInstructions(false)}
          onDismiss={pwa.dismissInstallBanner}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <AppHeader
        theme={theme}
        lightTheme={lightTheme}
        staleData={staleData}
        activeTab={activeTab}
        busLinesCount={busLines.length}
        favoriteLinesCount={favoriteBusLines.length}
        isLoading={isLoading}
        isFavoritesLoading={isFavoritesLoading}
        countdown={countdown}
        onToggleTheme={() => setLightTheme(p => !p)}
      />

      {/* ── Pull-to-refresh indicator ───────────────────────────────────────── */}
      {pulling && (
        <div
          className="flex items-center justify-center gap-2 overflow-hidden transition-all"
          style={{ height: Math.min(pullDist, 56), opacity: Math.min(pullDist / 72, 1) }}
        >
          <div className={`w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full ${pullDist >= 72 ? 'animate-spin' : ''}`} />
          <span className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>
            {pullDist >= 72 ? 'Solte para atualizar' : 'Puxe para atualizar'}
          </span>
        </div>
      )}

      {/* ── Main scrollable container ────────────────────────────────────────── */}
      <div className="flex-grow overflow-y-auto app-container px-4 pt-2 pb-32">
        <PWABanners pwa={pwa} />

        {activeTab === 'search' && (
          <SearchTab
            stopId={stopId}
            lineFilter={lineFilter}
            destFilter={destFilter}
            busLines={busLines}
            displayedBusLines={displayedBusLines}
            isLoading={isLoading}
            errorMsg={errorMsg}
            searchHistory={searchHistory}
            liveLineMap={liveLineMap}
            activeMiniMap={activeMiniMap}
            miniMapRefreshKey={miniMapRefreshKey}
            lightTheme={lightTheme}
            theme={theme}
            cardProps={cardProps}
            parseTime={parseTime}
            getStopCoords={getStopCoords}
            selectedStop={selectedStop}
            onStopIdChange={setStopId}
            onLineFilterChange={setLineFilter}
            onDestFilterChange={setDestFilter}
            onSearch={() => handleSearch()}
            onHistorySearch={(id) => { setStopId(id); handleSearch(id); }}
            onToggleMiniMap={toggleMiniMap}
            onCloseMiniMap={() => setActiveMiniMap(null)}
            nearbyStops={nearbyStops}
            locationStatus={locationStatus}
            onRequestLocation={requestLocation}
            onNearbyStopSearch={(id) => {
              setStopId(id);
              setLineFilter('');
              setDestFilter('');
              handleSearch(id, '');
              haptic(40);
            }}
          />
        )}

        {activeTab === 'favs' && (
          <FavsTab
            favorites={favorites}
            favoriteBusLines={favoriteBusLines}
            displayedFavLines={displayedFavLines}
            groupedFavLines={groupedFavLines}
            isFavoritesLoading={isFavoritesLoading}
            destFilter={destFilter}
            stopId={stopId}
            removingFavKey={removingFavKey}
            lightTheme={lightTheme}
            theme={theme}
            cardProps={cardProps}
            parseTime={parseTime}
            onDestFilterChange={setDestFilter}
            onRefresh={loadFavoritesWithCurrentFavs}
            onShareStop={shareStop}
          />
        )}

        {activeTab === 'sitpass' && (
          <SitPassTab
            sitpass={sitpass}
            lightTheme={lightTheme}
            theme={theme}
          />
        )}
      </div>

      {/* ── Map tab (fixed, outside scroll container) ────────────────────────── */}
      <MapTab
        activeTab={activeTab}
        theme={theme}
        lightTheme={lightTheme}
        activeMiniMap={activeMiniMap}
        miniMapRefreshKey={miniMapRefreshKey}
        selectedStop={selectedStop}
        stopLines={stopLines}
        stopLinesLoading={stopLinesLoading}
        stopLinesError={stopLinesError}
        stopLiveLinesMap={stopLiveLinesMap}
        mapRefreshCountdown={mapRefreshCountdown}
        showMapOnboarding={showMapOnboarding}
        locationError={locationError}
        walkingMinutes={walkingMinutes}
        parseTime={parseTime}
        onToggleMiniMap={toggleMiniMap}
        onCloseMiniMap={() => setActiveMiniMap(null)}
        onCloseStop={handleCloseStop}
        onGoToSearch={goToSearchWithStop}
        onShareStop={shareStop}
        onMapReady={() => setMapReady(true)}
        onLocationError={() => setLocationError(true)}
        onSelectStop={handleSelectStop}
        onBuscarLinhas={buscarLinhasPontoInterno}
        onDismissOnboarding={() => {
          setShowMapOnboarding(false);
          localStorage.setItem('cade_meu_bau_map_onboarding_done', 'true');
        }}
        mapRef={mapRef}
        leafletMapRef={leafletMapRef}
        markersRef={markersRef}
        pontosDataRef={pontosDataRef}
        leafletLoadingRef={leafletLoadingRef}
        userLocationRef={userLocationRef}
        filtrarMarkersPorRaioRef={filtrarMarkersPorRaioRef}
      />

      {/* ── Bottom nav ──────────────────────────────────────────────────────── */}
      <BottomNav
        activeTab={activeTab}
        favCount={favorites.length}
        theme={theme}
        onTabChange={(tab) => { setActiveTab(tab); setDestFilter(''); }}
      />
    </div>
  );
};

export default App;
