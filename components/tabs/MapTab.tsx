import React, { useRef, useEffect, useCallback, useState } from 'react';
import { BusLine, ThemeTokens, LeafletLib, LeafletMap, LeafletMarker, PontoDataWithMarker } from '../../types';
import { haptic } from '../../utils';
import MiniMap from '../MiniMap';
import PONTOS_DATA from '../../pontos.json';

interface MiniMapConfig {
  key: string;
  lineNumber: string;
  stopLat: number;
  stopLng: number;
  stopNome: string;
  destination: string;
}

interface MapTabProps {
  activeTab: string;
  theme: ThemeTokens;
  lightTheme: boolean;
  activeMiniMap: MiniMapConfig | null;
  miniMapRefreshKey: number;
  selectedStop: { id: string; nome: string } | null;
  stopLines: BusLine[];
  stopLinesLoading: boolean;
  stopLinesError: string | null;
  stopLiveLinesMap: Record<string, boolean>;
  mapRefreshCountdown: number;
  showMapOnboarding: boolean;
  locationError: boolean;
  walkingMinutes: number | null;
  parseTime: (t?: string) => number;
  onToggleMiniMap: (config: MiniMapConfig) => void;
  onCloseMiniMap: () => void;
  onCloseStop: () => void;
  onGoToSearch: (pontoId: string) => void;
  onShareStop: (pontoId: string, nomePonto: string) => void;
  onMapReady: () => void;
  onLocationError: () => void;
  onSelectStop: (stop: { id: string; nome: string }) => void;
  onBuscarLinhas: (pontoId: string) => void;
  onDismissOnboarding: () => void;
  mapRef: React.RefObject<HTMLDivElement | null>;
  leafletMapRef: React.RefObject<LeafletMap | null>;
  markersRef: React.RefObject<LeafletMarker[]>;
  pontosDataRef: React.RefObject<PontoDataWithMarker[]>;
  leafletLoadingRef: React.RefObject<boolean>;
  userLocationRef: React.RefObject<{ lat: number; lng: number } | null>;
  filtrarMarkersPorRaioRef: React.RefObject<((lat: number, lng: number) => void) | null>;
}

// ── Skeleton de linha no painel do ponto ──────────────────────────────────────
const StopLineSkeleton: React.FC<{ light: boolean }> = ({ light }) => (
  <div className={`${light ? 'bg-white border-gray-200' : 'bg-slate-900 border-white/10'} border rounded-2xl px-4 py-3 flex items-center gap-3 animate-pulse`}>
    <div className={`w-14 h-6 rounded-xl ${light ? 'bg-gray-200' : 'bg-slate-700'}`} />
    <div className="flex-1 space-y-2">
      <div className={`h-2 w-16 rounded-full ${light ? 'bg-gray-200' : 'bg-slate-700'}`} />
      <div className={`h-3 w-32 rounded-full ${light ? 'bg-gray-200' : 'bg-slate-700'}`} />
    </div>
    <div className="flex gap-1.5">
      <div className={`w-11 h-10 rounded-xl ${light ? 'bg-gray-200' : 'bg-slate-700'}`} />
      <div className={`w-11 h-10 rounded-xl ${light ? 'bg-gray-100' : 'bg-slate-800'}`} />
    </div>
  </div>
);

// ── Skeleton do mapa inteiro ──────────────────────────────────────────────────
const MapSkeleton: React.FC<{ theme: ThemeTokens; light: boolean }> = ({ theme, light }) => (
  <div className={`absolute inset-0 z-[999] ${theme.bg} flex flex-col`}>
    {/* Simula tiles do mapa */}
    <div className="flex-1 relative overflow-hidden animate-pulse">
      <div className={`absolute inset-0 ${light ? 'bg-gray-200' : 'bg-slate-800'}`} />
      {/* Grade de tiles */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-4 gap-0.5 opacity-40">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={`${light ? 'bg-gray-300' : 'bg-slate-700'}`} />
        ))}
      </div>
      {/* Marcadores simulados */}
      {[
        { top: '30%', left: '40%' },
        { top: '50%', left: '55%' },
        { top: '45%', left: '30%' },
        { top: '60%', left: '60%' },
        { top: '35%', left: '65%' },
      ].map((pos, i) => (
        <div
          key={i}
          className={`absolute w-6 h-6 rounded-full ${light ? 'bg-gray-400' : 'bg-slate-600'}`}
          style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -50%)' }}
        />
      ))}
      {/* Texto de loading centralizado */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        <p className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>
          Carregando mapa...
        </p>
        <p className={`text-[9px] font-bold ${theme.subtext} opacity-50`}>
          Buscando sua localização
        </p>
      </div>
    </div>
  </div>
);

const MapTab: React.FC<MapTabProps> = ({
  activeTab, theme, lightTheme,
  activeMiniMap, miniMapRefreshKey,
  selectedStop, stopLines, stopLinesLoading, stopLinesError, stopLiveLinesMap,
  mapRefreshCountdown, showMapOnboarding, locationError, walkingMinutes,
  parseTime, onToggleMiniMap, onCloseMiniMap, onCloseStop,
  onGoToSearch, onShareStop, onMapReady, onLocationError,
  onSelectStop, onBuscarLinhas, onDismissOnboarding,
  mapRef, leafletMapRef, markersRef, pontosDataRef, leafletLoadingRef,
  userLocationRef, filtrarMarkersPorRaioRef,
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (activeTab !== 'map' || leafletMapRef.current || leafletLoadingRef.current) return;
    leafletLoadingRef.current = true;

    const seenIds = new Set<string>();
    const PONTOS = (PONTOS_DATA as Array<{ id: string; lat: number; lng: number; nome: string }>)
      .filter(p => { if (seenIds.has(p.id)) return false; seenIds.add(p.id); return true; });

    const loadLeaflet = () => new Promise<void>((resolve, reject) => {
      if ((window as { L?: unknown }).L) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar Leaflet'));
      document.head.appendChild(script);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    });

    let moveEndHandler: (() => void) | null = null;

    loadLeaflet().then(() => {
      if (!mapRef.current || leafletMapRef.current) { leafletLoadingRef.current = false; return; }
      const L = (window as unknown as { L: LeafletLib }).L;

      const map = L.map(mapRef.current, { center: [-16.7200, -49.0900], zoom: 14, zoomControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const pontoIcon = L.icon({ iconUrl: '/ponto.png', iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36] });

      const calcDist = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      const filtrarMarkersPorRaio = (userLat: number, userLng: number) => {
        pontosDataRef.current.forEach(p => {
          const d = calcDist(userLat, userLng, p.lat, p.lng);
          p.marker.setOpacity(d <= 500 ? 1 : 0);
        });
      };
      filtrarMarkersPorRaioRef.current = filtrarMarkersPorRaio;

      PONTOS.forEach(ponto => {
        const marker = L.marker([ponto.lat, ponto.lng], { icon: pontoIcon, opacity: 0 })
          .addTo(map)
          .on('click', () => {
            const loc = userLocationRef.current;
            if (loc) filtrarMarkersPorRaio(loc.lat, loc.lng);
            onSelectStop({ id: ponto.id, nome: ponto.nome });
            onBuscarLinhas(ponto.id);
            haptic(40);
          });
        markersRef.current.push(marker);
        pontosDataRef.current.push({ ...ponto, marker });
      });

      moveEndHandler = () => {
        const c = map.getCenter();
        filtrarMarkersPorRaio(c.lat, c.lng);
      };
      map.on('moveend', moveEndHandler);
      map.on('zoomend', moveEndHandler);
      map.on('dragend', moveEndHandler);
      leafletMapRef.current = map;

      // Mapa carregado — remove skeleton
      setMapLoaded(true);
      onMapReady();

      if (navigator.geolocation) {
        setLocating(true);
        navigator.geolocation.getCurrentPosition(pos => {
          const { latitude, longitude } = pos.coords;
          userLocationRef.current = { lat: latitude, lng: longitude };
          const userIcon = L.divIcon({
            html: `<div style="width:20px;height:20px;background:#3b82f6;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(59,130,246,0.4);"></div>`,
            className: '', iconSize: [20, 20], iconAnchor: [10, 10],
          });
          L.marker([latitude, longitude], { icon: userIcon }).addTo(map).bindPopup('Você está aqui');
          map.setView([latitude, longitude], 15);
          filtrarMarkersPorRaio(latitude, longitude);
          setLocating(false);
        }, () => {
          onLocationError();
          pontosDataRef.current.forEach(p => p.marker.setOpacity(1));
          setLocating(false);
        }, { timeout: 8000, enableHighAccuracy: true });
      } else {
        pontosDataRef.current.forEach(p => p.marker.setOpacity(1));
      }
    }).catch(() => { leafletLoadingRef.current = false; });

    return () => {
      if (leafletMapRef.current && moveEndHandler) {
        leafletMapRef.current.off('moveend', moveEndHandler);
        leafletMapRef.current.off('zoomend', moveEndHandler);
      }
    };
  }, [activeTab]); // eslint-disable-line

  const getColor = (t: string) => {
    if (!t || t === 'SEM PREVISÃO') return 'bg-slate-800 text-slate-500';
    if (t.toLowerCase().includes('agora')) return 'bg-red-600 text-white';
    const m = parseInt(t) || 999;
    if (m <= 3) return 'bg-red-600 text-white';
    if (m <= 8) return 'bg-yellow-500 text-black';
    return 'bg-emerald-500 text-white';
  };

  return (
    <div style={{ position: 'fixed', top: '64px', left: 0, right: 0, bottom: '90px', zIndex: 40, display: activeTab === 'map' ? 'block' : 'none' }}>
      
      {/* Mapa real */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Skeleton do mapa enquanto não carregou */}
      {!mapLoaded && <MapSkeleton theme={theme} light={lightTheme} />}

      {/* Badge de localização sendo buscada */}
      {mapLoaded && locating && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-4 py-2 rounded-2xl border border-blue-500/30 bg-blue-500/10"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">
            Buscando localização...
          </span>
        </div>
      )}

      {/* Map onboarding */}
      {showMapOnboarding && mapLoaded && (
        <div
          className="absolute inset-0 bg-black/70 z-[1001] flex items-end justify-center p-4"
          onClick={onDismissOnboarding}
        >
          <div
            className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-4`}
            onClick={e => e.stopPropagation()}
            style={{ animation: 'slideUp 0.3s ease-out' }}
          >
            <div className="text-center space-y-3">
              <span className="text-4xl">🗺️</span>
              <p className="font-black text-base uppercase tracking-tight text-white leading-tight">Mapa de Pontos</p>
              <p className={`text-sm ${theme.subtext} leading-relaxed`}>
                Toque em qualquer marcador no mapa para ver as linhas que passam naquele ponto.
              </p>
              <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl px-4 py-3">
                <p className="text-[11px] font-bold text-yellow-400 leading-relaxed">
                  💡 Use o ícone de lupa no painel para abrir o ponto diretamente na busca!
                </p>
              </div>
            </div>
            <button
              onClick={() => { onDismissOnboarding(); haptic(40); }}
              className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform"
            >
              Entendi!
            </button>
          </div>
        </div>
      )}

      {/* Location error */}
      {locationError && (
        <div
          className="absolute top-3 left-3 right-3 z-[1000] border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          📍 Localização negada — mostrando Senador Canedo
        </div>
      )}

      {/* Stop panel */}
      {selectedStop && (
        <div
          className={`absolute left-0 right-0 z-[1000] ${theme.card} border-t rounded-t-[2rem]`}
          style={{ bottom: 0, animation: 'slideUp 0.3s ease-out', maxHeight: '75%', display: 'flex', flexDirection: 'column' }}
          onTouchStart={e => {
            const startY = e.touches[0].clientY;
            const el = e.currentTarget;
            let lastY = startY;
            const onMove = (ev: TouchEvent) => { const dy = ev.touches[0].clientY - startY; lastY = ev.touches[0].clientY; if (dy > 0) el.style.transform = `translateY(${dy}px)`; };
            const onEnd = () => { const dy = lastY - startY; el.style.transform = ''; if (dy > 80) onCloseStop(); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); };
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onEnd);
          }}
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          <div className="flex items-start justify-between px-5 pt-2 pb-3 shrink-0">
            <div className="flex-1 min-w-0">
              <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>📍 Ponto selecionado</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="font-black text-base text-yellow-400 truncate">{selectedStop.nome}</p>
                <button
                  onClick={() => onGoToSearch(selectedStop.id)}
                  className="shrink-0 p-1.5 rounded-xl bg-yellow-400/15 border border-yellow-400/30 active:scale-95 transition-all"
                  aria-label="Buscar este ponto"
                >🔍</button>
                <button
                  onClick={() => onShareStop(selectedStop.id, selectedStop.nome)}
                  className="shrink-0 p-1.5 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all"
                  aria-label="Compartilhar ponto"
                >🔗</button>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <p className={`text-[10px] font-bold ${theme.subtext}`}>Nº {selectedStop.id}</p>
                {walkingMinutes !== null && (
                  <p className="text-[9px] font-black text-emerald-400">🚶 ~{walkingMinutes} min a pé</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              {!stopLinesLoading && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className={`text-[9px] font-black tabular-nums ${theme.subtext}`}>{mapRefreshCountdown}s</span>
                </div>
              )}
              <button onClick={onCloseStop} className="p-1 active:scale-95" aria-label="Fechar painel">
                <img src="/fechar.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, paddingBottom: '12px' }} className="px-5 space-y-2">
            {/* Skeleton das linhas enquanto carrega */}
            {stopLinesLoading && (
              <>
                <div className="flex items-center gap-2 py-1 mb-1">
                  <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <p className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>Buscando linhas...</p>
                </div>
                {[0, 1, 2].map(i => (
                  <StopLineSkeleton key={i} light={lightTheme} />
                ))}
              </>
            )}

            {stopLinesError && !stopLinesLoading && (
              <div className="border border-red-500/30 bg-red-500/10 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-lg shrink-0">📡</span>
                <div>
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                    {stopLinesError === 'offline' ? 'Sem conexão' : 'Nenhuma linha encontrada'}
                  </p>
                  <p className={`text-[9px] font-bold mt-0.5 ${theme.subtext}`}>
                    {stopLinesError === 'offline'
                      ? 'Verifique sua internet e tente novamente'
                      : 'Este ponto pode estar inativo no momento'}
                  </p>
                </div>
              </div>
            )}

            {!stopLinesLoading && stopLines.map(line => {
              const miniKey = `map-${line.number}-${selectedStop.id}`;
              const isMapMiniActive = activeMiniMap?.key === miniKey;
              const stopCoordsMap = pontosDataRef.current.find(p => p.id === selectedStop.id);
              const isUrgent = parseTime(line.nextArrival) <= 2;

              return (
                <div key={line.id}>
                  <div className={`${theme.card} border rounded-2xl px-4 py-3 flex items-center gap-3 ${isUrgent ? 'urgent-card' : ''}`}>
                    <span className="text-yellow-400 font-black text-xl w-14 text-center shrink-0">{line.number}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>Indo para</p>
                      <p className={`font-black text-[11px] uppercase truncate ${theme.destText}`}>{line.destination}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex gap-1.5">
                        <div className={`${getColor(line.nextArrival ?? '')} rounded-xl px-2 py-1.5 text-center min-w-[44px]`}>
                          <p className="font-black text-sm leading-none">{line.nextArrival === 'SEM PREVISÃO' ? '—' : line.nextArrival}</p>
                          <p className="text-[6px] font-black uppercase opacity-70 mt-0.5">min</p>
                        </div>
                        <div className={`${getColor(line.subsequentArrival ?? '')} rounded-xl px-2 py-1.5 text-center min-w-[44px] opacity-80`}>
                          <p className="font-black text-sm leading-none">{line.subsequentArrival === 'SEM PREVISÃO' ? '—' : line.subsequentArrival}</p>
                          <p className="text-[6px] font-black uppercase opacity-70 mt-0.5">min</p>
                        </div>
                      </div>
                      {stopLiveLinesMap[line.number] && stopCoordsMap && (
                        <button
                          onClick={() => {
                            haptic(40);
                            onToggleMiniMap({
                              key: miniKey,
                              lineNumber: line.number,
                              stopLat: stopCoordsMap.lat,
                              stopLng: stopCoordsMap.lng,
                              stopNome: selectedStop.nome,
                              destination: line.destination,
                            });
                          }}
                          className={`rounded-xl p-2 transition-all active:scale-95 border ${isMapMiniActive ? 'bg-blue-600 border-blue-500' : 'bg-blue-600/15 border-blue-500/30'}`}
                          aria-label="Ver ao vivo"
                        >
                          <img src="/onibus_realtime.png" alt="Ao vivo" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isMapMiniActive && activeMiniMap && stopCoordsMap && (
                    <MiniMap
                      key={activeMiniMap.key}
                      stopLat={stopCoordsMap.lat}
                      stopLng={stopCoordsMap.lng}
                      stopNome={selectedStop.nome}
                      lineNumber={line.number}
                      destination={line.destination}
                      refreshKey={miniMapRefreshKey}
                      onClose={onCloseMiniMap}
                      theme={theme}
                      lightTheme={lightTheme}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapTab;