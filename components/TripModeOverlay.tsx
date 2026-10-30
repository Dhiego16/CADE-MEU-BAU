import React, { useEffect, useRef, useState } from 'react';
import { ThemeTokens } from '../types';
import { TripTarget, UserLocation, RouteInfo } from '../hooks/useTripMode';
import { haptic } from '../utils';
import { LeafletLib, LeafletMap, LeafletMarker } from '../types';

interface TripModeOverlayProps {
  tripTarget: TripTarget;
  secondsRemaining: number;
  isArriving: boolean;
  urgencyStatus: 'ok' | 'hurry' | 'arrived_at_stop';
  userLocation: UserLocation | null;
  routeInfo: RouteInfo | null;
  locationStatus: 'idle' | 'loading' | 'granted' | 'denied';
  theme: ThemeTokens;
  lightTheme: boolean;
  onCancel: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

const formatTime = (secs: number): { mins: string; seconds: string } => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return { mins: pad(m), seconds: pad(s) };
};

const Ring: React.FC<{ progress: number; isArriving: boolean }> = ({ progress, isArriving }) => {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <svg width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
      <circle
        cx="55" cy="55" r={r} fill="none"
        stroke={isArriving ? '#ef4444' : '#fbbf24'}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
      />
    </svg>
  );
};

const distMeters = (a: [number, number], b: [number, number]): number => {
  const R = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const formatMeters = (m: number): string =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

interface LeafletCircle { setLatLng: (l: [number, number]) => void; setRadius: (r: number) => void; remove: () => void }
type LeafletExt = LeafletLib & {
  circle: (latlng: [number, number], opts: object) => { addTo: (m: LeafletMap) => LeafletCircle };
  polyline: (coords: [number, number][], opts: object) => { addTo: (m: LeafletMap) => unknown; remove: () => void };
};
const getL = () => (window as unknown as { L?: LeafletExt }).L;

type BusData = { numero?: string; lat: number; lng: number; destino?: string };
type BusInfo = { status: 'searching' | 'live' | 'lost'; distM: number | null; updatedAt: number | null };

const BUS_POLL_MS = 10000;

const normDestino = (s: string): string =>
  s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').trim();

const TripModeOverlay: React.FC<TripModeOverlayProps> = ({
  tripTarget, secondsRemaining, isArriving, urgencyStatus,
  userLocation, routeInfo, locationStatus,
  theme, lightTheme, onCancel,
}) => {
  const totalSecs = tripTarget.minutesWhenSet * 60;
  const progress = secondsRemaining / Math.max(totalSecs, 1);
  const { mins, seconds } = formatTime(secondsRemaining);
  const prevArrivingRef = useRef(false);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const userCircleRef = useRef<LeafletCircle | null>(null);
  const stopMarkerRef = useRef<LeafletMarker | null>(null);
  const busMarkerRef = useRef<LeafletMarker | null>(null);
  const otherBusMarkersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const routeLayerRef = useRef<unknown>(null);
  const isMountedRef = useRef(true);
  const busIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const animRef = useRef<number | null>(null);

  const userPosRef = useRef<[number, number] | null>(null);
  const busPosRef = useRef<[number, number] | null>(null);
  const lastFitUserRef = useRef<[number, number] | null>(null);
  const prevDistRef = useRef<Map<string, number>>(new Map());
  const missRef = useRef(0);
  const followingRef = useRef(true);

  const [mapReady, setMapReady] = useState(false);
  const [following, setFollowing] = useState(true);
  const [busInfo, setBusInfo] = useState<BusInfo>({ status: 'searching', distM: null, updatedAt: null });

  const arrived = secondsRemaining === 0;
  const atStop = urgencyStatus === 'arrived_at_stop';
  const hurry = urgencyStatus === 'hurry';

  useEffect(() => {
    if (isArriving && !prevArrivingRef.current) haptic([200, 100, 200, 100, 200]);
    prevArrivingRef.current = isArriving;
  }, [isArriving]);

  useEffect(() => {
    if (atStop) haptic([300, 100, 300, 100, 300]);
  }, [atStop]);

  // ── Enquadra você + ponto + ônibus ao mesmo tempo ─────────────────────────
  const fitAll = (animate = true) => {
    const map = leafletMapRef.current;
    if (!map) return;
    const pts: [number, number][] = [[tripTarget.stopLat, tripTarget.stopLng]];
    if (userPosRef.current) pts.push(userPosRef.current);
    if (busPosRef.current) pts.push(busPosRef.current);
    if (pts.length === 1) { map.setView(pts[0], 16, { animate }); return; }
    const lats = pts.map(p => p[0]);
    const lngs = pts.map(p => p[1]);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [50, 50], maxZoom: 17, animate }
    );
  };

  const recenter = () => {
    followingRef.current = true;
    setFollowing(true);
    fitAll();
    haptic(30);
  };

  // Move o ônibus suavemente até a nova posição (em vez de pular)
  const moveBusMarker = (to: [number, number]) => {
    const marker = busMarkerRef.current;
    const from = busPosRef.current;
    busPosRef.current = to;
    if (!marker || !from) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const t0 = performance.now();
    const dur = 1500;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      marker.setLatLng([from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]);
      if (k < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  };

  const clearBusMarkers = () => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    if (busMarkerRef.current) { busMarkerRef.current.remove(); busMarkerRef.current = null; }
    otherBusMarkersRef.current.forEach(m => m.remove());
    otherBusMarkersRef.current.clear();
    busPosRef.current = null;
  };

  const registerMiss = () => {
    missRef.current += 1;
    // Só dá o ônibus como sem sinal depois de 2 falhas seguidas (evita piscar)
    if (missRef.current >= 2 && isMountedRef.current) {
      clearBusMarkers();
      setBusInfo({ status: 'lost', distM: null, updatedAt: null });
    }
  };

  // ── Fetch ônibus ao vivo ──────────────────────────────────────────────────
  const fetchBus = async (map: LeafletMap, L: LeafletExt) => {
    if (document.hidden) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;
    const stopPos: [number, number] = [tripTarget.stopLat, tripTarget.stopLng];

    try {
      const res = await fetch(`/api/realtimebus?linha=${tripTarget.lineNumber}`, { signal });
      if (!isMountedRef.current || signal.aborted) return;
      if (!res.ok) { registerMiss(); return; }
      const onibus = await res.json();
      if (!isMountedRef.current || signal.aborted) return;

      const withCoords: BusData[] = (Array.isArray(onibus) ? onibus : [])
        .filter((b: BusData) => b.lat && b.lng)
        .map((b: BusData) => ({ ...b, lat: Number(b.lat), lng: Number(b.lng) }));
      if (!withCoords.length) { registerMiss(); return; }

      const destNorm = normDestino(tripTarget.destination);
      const mesmoDestino = withCoords.filter(b =>
        normDestino(b.destino ?? '').includes(destNorm) || destNorm.includes(normDestino(b.destino ?? ''))
      );
      const candidatos = mesmoDestino.length > 0 ? mesmoDestino : withCoords;

      // Distância de cada candidato ao ponto, e se está se aproximando
      const rated = candidatos.map((bus, i) => {
        const key = bus.numero ?? `idx-${i}`;
        const d = distMeters(stopPos, [bus.lat, bus.lng]);
        const prev = prevDistRef.current.get(key);
        const approaching = prev === undefined || d < prev - 15;
        return { bus, key, d, approaching };
      });
      rated.forEach(r => prevDistRef.current.set(r.key, r.d));

      // Prefere o mais próximo que está vindo em direção ao ponto
      const pool = rated.some(r => r.approaching) ? rated.filter(r => r.approaching) : rated;
      const tracked = pool.reduce((best, r) => (r.d < best.d ? r : best), pool[0]);

      missRef.current = 0;
      setBusInfo({ status: 'live', distM: tracked.d, updatedAt: Date.now() });

      // Ônibus principal (o que está vindo)
      const trackedPos: [number, number] = [tracked.bus.lat, tracked.bus.lng];
      if (busMarkerRef.current) {
        moveBusMarker(trackedPos);
      } else {
        const busIcon = L.divIcon({
          html: '<div class="trip-bus"><span class="trip-bus-ring"></span><img src="/onibus_realtime.png" alt="" /></div>',
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 38],
          popupAnchor: [0, -38],
        } as object);
        busMarkerRef.current = L.marker(trackedPos, { icon: busIcon, zIndexOffset: 1000 })
          .addTo(map)
          .bindPopup(`Linha ${tripTarget.lineNumber}`);
        busPosRef.current = trackedPos;
      }

      // Outros ônibus da mesma linha (bolinhas menores)
      const seen = new Set<string>();
      rated.forEach(r => {
        if (r.key === tracked.key) return;
        seen.add(r.key);
        const pos: [number, number] = [r.bus.lat, r.bus.lng];
        const existing = otherBusMarkersRef.current.get(r.key);
        if (existing) {
          existing.setLatLng(pos);
        } else {
          const dot = L.divIcon({
            html: '<div class="trip-bus-other"></div>',
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          } as object);
          otherBusMarkersRef.current.set(r.key, L.marker(pos, { icon: dot }).addTo(map));
        }
      });
      otherBusMarkersRef.current.forEach((m, k) => {
        if (!seen.has(k)) { m.remove(); otherBusMarkersRef.current.delete(k); }
      });

      if (followingRef.current) fitAll();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (isMountedRef.current) registerMiss();
    }
  };

  // ── Inicializa mapa ────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    let onVisible: (() => void) | null = null;

    const loadLeaflet = () => new Promise<void>((resolve, reject) => {
      if ((window as { L?: unknown }).L) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
    });

    loadLeaflet().then(() => {
      if (!isMountedRef.current || !mapDivRef.current || leafletMapRef.current) return;
      const L = getL();
      if (!L) return;

      const map = L.map(mapDivRef.current, {
        center: [tripTarget.stopLat, tripTarget.stopLng],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      } as object);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      const stopIcon = L.icon({ iconUrl: '/ponto.png', iconSize: [32, 32], iconAnchor: [16, 32] });
      stopMarkerRef.current = L.marker([tripTarget.stopLat, tripTarget.stopLng], { icon: stopIcon })
        .addTo(map)
        .bindPopup(tripTarget.stopNome);

      // Se o usuário arrastar o mapa, para de reenquadrar sozinho (aparece "Centralizar")
      map.on('dragstart', () => { followingRef.current = false; setFollowing(false); });

      leafletMapRef.current = map;
      setMapReady(true);

      // Ônibus imediato e a cada 10s (pausa com o app em segundo plano)
      fetchBus(map, L);
      busIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) fetchBus(map, L);
      }, BUS_POLL_MS);
      onVisible = () => { if (!document.hidden && isMountedRef.current) fetchBus(map, L); };
      document.addEventListener('visibilitychange', onVisible);
    }).catch(() => {});

    return () => {
      isMountedRef.current = false;
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
      if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
      if (busIntervalRef.current) { clearInterval(busIntervalRef.current); busIntervalRef.current = null; }
      clearBusMarkers();
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
      if (userCircleRef.current) { userCircleRef.current.remove(); userCircleRef.current = null; }
      if (stopMarkerRef.current) { stopMarkerRef.current.remove(); stopMarkerRef.current = null; }
      if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; }
    };
  }, []); // eslint-disable-line

  // ── Atualiza posição do usuário no mapa ───────────────────────────────────
  // Depende de mapReady: se o GPS responder antes do mapa carregar, desenha assim que ficar pronto.
  useEffect(() => {
    if (!mapReady || !userLocation) return;
    const L = getL();
    const map = leafletMapRef.current;
    if (!L || !map) return;

    const pos: [number, number] = [userLocation.lat, userLocation.lng];
    userPosRef.current = pos;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(pos);
    } else {
      const userIcon = L.divIcon({
        html: '<div class="trip-user"><span class="trip-user-ring"></span><span class="trip-user-dot"></span></div>',
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      } as object);
      userMarkerRef.current = L.marker(pos, { icon: userIcon, zIndexOffset: 900 }).addTo(map);
    }

    // Círculo de precisão do GPS (só se for razoável)
    if (userLocation.accuracy <= 300) {
      if (userCircleRef.current) {
        userCircleRef.current.setLatLng(pos);
        userCircleRef.current.setRadius(userLocation.accuracy);
      } else {
        userCircleRef.current = L.circle(pos, {
          radius: userLocation.accuracy, color: '#3b82f6', weight: 1, opacity: 0.4,
          fillColor: '#3b82f6', fillOpacity: 0.1, interactive: false,
        }).addTo(map);
      }
    }

    // Reenquadra só na primeira posição ou se você andou mais de 25 m
    const moved = lastFitUserRef.current ? distMeters(lastFitUserRef.current, pos) : Infinity;
    if (followingRef.current && moved > 25) {
      lastFitUserRef.current = pos;
      fitAll();
    }
  }, [userLocation, mapReady]); // eslint-disable-line

  // ── Desenha rota no mapa ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !routeInfo || !leafletMapRef.current) return;
    const L = getL();
    if (!L) return;

    if (routeLayerRef.current) (routeLayerRef.current as { remove: () => void }).remove();

    const latLngs = routeInfo.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    const line = L.polyline(latLngs, {
      color: hurry ? '#ef4444' : '#3b82f6',
      weight: 4,
      opacity: 0.8,
      dashArray: '8, 6',
    });
    line.addTo(leafletMapRef.current);
    routeLayerRef.current = line;
  }, [routeInfo, hurry, mapReady]);

  const bgGradient = atStop
    ? 'linear-gradient(160deg, #052005 0%, #0f3d0f 100%)'
    : hurry || isArriving
      ? 'linear-gradient(160deg, #1a0505 0%, #3d0f0f 100%)'
      : 'linear-gradient(160deg, #0a0a0a 0%, #1a1a2e 100%)';

  const accentColor = atStop ? '#22c55e' : hurry || isArriving ? '#ef4444' : '#fbbf24';

  const statusLabel = arrived
    ? 'Chegou!'
    : atStop
      ? 'Você está no ponto!'
      : hurry
        ? 'CORRE! Baú chega antes de você'
        : isArriving
          ? 'Chegando agora'
          : 'Modo viagem ativo';

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      // paddingTop: o mapa começa abaixo da barra de status/Dynamic Island. A faixa
      // fica com a cor sólida do fundo, então o blur automático do iOS 26 não aparece
      // e o aviso de status deixa de ficar escondido atrás do notch.
      style={{ background: bgGradient, transition: 'background 1s ease', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <style>{`
        @keyframes tripPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        @keyframes tripBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes tripRing { 0%{transform:scale(0.5);opacity:0.7} 100%{transform:scale(2.2);opacity:0} }
        .trip-bus { position:relative; width:40px; height:40px; }
        .trip-bus img { position:relative; width:36px; height:36px; object-fit:contain; z-index:2; }
        .trip-bus-ring { position:absolute; left:2px; top:2px; width:36px; height:36px; border-radius:50%; background:rgba(251,191,36,0.55); animation:tripRing 1.8s ease-out infinite; z-index:1; }
        .trip-bus-other { width:12px; height:12px; border-radius:50%; background:#fbbf24; border:2px solid #fff; opacity:0.75; box-shadow:0 0 4px rgba(0,0,0,0.4); }
        .trip-user { position:relative; width:22px; height:22px; }
        .trip-user-dot { position:absolute; left:3px; top:3px; width:16px; height:16px; border-radius:50%; background:#3b82f6; border:3px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.4); z-index:2; }
        .trip-user-ring { position:absolute; left:0; top:0; width:22px; height:22px; border-radius:50%; background:rgba(59,130,246,0.5); animation:tripRing 2s ease-out infinite; z-index:1; }
      `}</style>

      {/* ── Mapa ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: '1', position: 'relative', minHeight: 0 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

        {/* Status badge */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-2xl flex items-center gap-2"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', border: `1px solid ${accentColor}40`, whiteSpace: 'nowrap' }}
        >
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor, animation: 'tripPulse 1s ease-in-out infinite' }} />
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
            {statusLabel}
          </span>
        </div>

        {/* Ônibus em tempo real */}
        <div
          className="absolute left-1/2 top-14 z-[1000] -translate-x-1/2 px-3 py-1.5 rounded-2xl flex items-center gap-2"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
            border: `1px solid ${busInfo.status === 'lost' ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.35)'}` }}
        >
          {busInfo.status === 'searching' && (
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Procurando o ônibus...
            </span>
          )}
          {busInfo.status === 'lost' && (
            <span className="text-[9px] font-black uppercase tracking-widest text-red-400">
              Ônibus sem sinal no momento
            </span>
          )}
          {busInfo.status === 'live' && busInfo.distM !== null && busInfo.updatedAt !== null && (
            <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400">
              🚍 {busInfo.distM < 80 ? 'No ponto' : `a ${formatMeters(busInfo.distM)} do ponto`}
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>
                {' '}· há {Math.max(0, Math.round((Date.now() - busInfo.updatedAt) / 1000))}s
              </span>
            </span>
          )}
        </div>

        {/* Centralizar (aparece depois que você mexe no mapa) */}
        {!following && (
          <button
            onClick={recenter}
            className="lg-glass lg-dark absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-yellow-300 active:scale-95"
            aria-label="Centralizar mapa"
          >
            🎯 Centralizar
          </button>
        )}

        {/* GPS status */}
        {locationStatus === 'loading' && (
          <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Buscando GPS...</span>
          </div>
        )}
        {locationStatus === 'denied' && (
          <div className="absolute bottom-3 left-3 z-[1000] px-3 py-2 rounded-xl"
            style={{ background: 'rgba(0,0,0,0.7)' }}>
            <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">GPS negado</span>
          </div>
        )}
      </div>

      {/* ── Painel inferior ───────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 pt-4 pb-8 flex flex-col gap-3"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-3">
          {/* Countdown ring */}
          <div className="relative shrink-0 flex items-center justify-center" style={{ width: 110, height: 110 }}>
            <Ring progress={progress} isArriving={isArriving || hurry} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {arrived ? (
                <span style={{ fontSize: 28, animation: 'tripBounce 0.8s ease-in-out infinite' }}>🚍</span>
              ) : (
                <>
                  <span className="font-black tabular-nums leading-none" style={{ fontSize: 24, color: accentColor, letterSpacing: '-0.02em' }}>
                    {mins}:{seconds}
                  </span>
                  <span className="text-[7px] font-black uppercase tracking-widest mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    restante
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Linha {tripTarget.lineNumber}
              </p>
              <p className="font-black text-sm text-white uppercase leading-tight truncate">
                {tripTarget.destination}
              </p>
              <p className="text-[9px] font-bold mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Ponto {tripTarget.stopId}
              </p>
            </div>

            <div className="flex gap-2">
              {routeInfo && (
                <div
                  className="flex-1 rounded-xl px-3 py-2"
                  style={{
                    background: hurry ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                    border: `1px solid ${hurry ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
                  }}
                >
                  <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: hurry ? '#ef4444' : '#3b82f6' }}>
                    A pé
                  </p>
                  <p className="font-black text-sm" style={{ color: hurry ? '#ef4444' : '#3b82f6' }}>
                    ~{routeInfo.walkingMinutes} min
                  </p>
                  <p className="text-[7px] font-bold opacity-60" style={{ color: hurry ? '#ef4444' : '#3b82f6' }}>
                    {routeInfo.distanceM < 1000
                      ? `${Math.round(routeInfo.distanceM)}m`
                      : `${(routeInfo.distanceM / 1000).toFixed(1)}km`}
                  </p>
                </div>
              )}

              <div
                className="flex-1 rounded-xl px-3 py-2"
                style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}
              >
                <p className="text-[7px] font-black uppercase tracking-widest text-yellow-400">Ônibus</p>
                <p className="font-black text-sm text-yellow-400">
                  ~{Math.ceil((secondsRemaining ?? 0) / 60)} min
                </p>
                <p className="text-[7px] font-bold text-yellow-400 opacity-60">
                  Est. original: {tripTarget.minutesWhenSet}m
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Chegou no ponto */}
        {atStop && (
          <div
            className="w-full rounded-2xl p-3 text-center"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            <p className="font-black text-sm text-green-400 uppercase tracking-wider">
              Você está no ponto!
            </p>
            <p className="text-[9px] font-bold text-green-400/60 mt-0.5">
              Aguarde o ônibus chegar
            </p>
          </div>
        )}

        {/* Ônibus chegou */}
        {arrived && !atStop && (
          <div
            className="w-full rounded-2xl p-3 text-center"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <p className="font-black text-sm text-red-400 uppercase tracking-wider">Seu baú chegou!</p>
            <p className="text-[9px] font-bold text-red-400/60 mt-0.5">Prepare-se para embarcar</p>
          </div>
        )}

        <button
          onClick={() => { onCancel(); haptic(40); }}
          className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
          style={{
            background: arrived || atStop ? accentColor : 'rgba(255,255,255,0.08)',
            color: arrived || atStop ? '#000' : 'rgba(255,255,255,0.5)',
            border: arrived || atStop ? 'none' : '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {arrived || atStop ? 'Concluir viagem' : 'Cancelar modo viagem'}
        </button>
      </div>
    </div>
  );
};

export default TripModeOverlay;
