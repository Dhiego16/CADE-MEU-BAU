import React, { useEffect, useRef } from 'react';
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
  const stopMarkerRef = useRef<LeafletMarker | null>(null);
  const routeLayerRef = useRef<unknown>(null);
  const isMountedRef = useRef(true);

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

  // ── Inicializa mapa ────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

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
      const L = (window as unknown as { L: LeafletLib }).L;

      const map = L.map(mapDivRef.current, {
        center: [tripTarget.stopLat, tripTarget.stopLng],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      } as object);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      // Marcador do ponto
      const stopIcon = L.icon({ iconUrl: '/ponto.png', iconSize: [32, 32], iconAnchor: [16, 32] });
      stopMarkerRef.current = L.marker([tripTarget.stopLat, tripTarget.stopLng], { icon: stopIcon })
        .addTo(map)
        .bindPopup(tripTarget.stopNome);

      leafletMapRef.current = map;
    }).catch(() => {});

    return () => {
      isMountedRef.current = false;
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
      if (stopMarkerRef.current) { stopMarkerRef.current.remove(); stopMarkerRef.current = null; }
      if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; }
    };
  }, []); // eslint-disable-line

  // ── Atualiza posição do usuário no mapa ───────────────────────────────────
  useEffect(() => {
    if (!userLocation || !leafletMapRef.current) return;
    const L = (window as unknown as { L?: LeafletLib }).L;
    if (!L) return;
    const map = leafletMapRef.current;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      const userIcon = L.divIcon({
        html: `<div style="width:16px;height:16px;background:#3b82f6;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(59,130,246,0.4);"></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      } as object);
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map);
    }

    // Centraliza entre usuário e ponto
    map.fitBounds(
      [
        [Math.min(userLocation.lat, tripTarget.stopLat), Math.min(userLocation.lng, tripTarget.stopLng)],
        [Math.max(userLocation.lat, tripTarget.stopLat), Math.max(userLocation.lng, tripTarget.stopLng)],
      ],
      { padding: [40, 40], maxZoom: 17, animate: true }
    );
  }, [userLocation, tripTarget.stopLat, tripTarget.stopLng]);

  // ── Desenha rota no mapa ──────────────────────────────────────────────────
  useEffect(() => {
    if (!routeInfo || !leafletMapRef.current) return;
    const L = (window as unknown as { L?: LeafletLib & { polyline: (coords: [number,number][], opts: object) => { addTo: (m: LeafletMap) => unknown; remove: () => void } } }).L;
    if (!L) return;

    // Remove rota anterior
    if (routeLayerRef.current) (routeLayerRef.current as { remove: () => void }).remove();

    // Converte [lng, lat] → [lat, lng] para Leaflet
    const latLngs = routeInfo.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);

    routeLayerRef.current = L.polyline(latLngs, {
      color: hurry ? '#ef4444' : '#3b82f6',
      weight: 4,
      opacity: 0.8,
      dashArray: '8, 6',
    }).addTo(leafletMapRef.current);
  }, [routeInfo, hurry]);

  // Cor do background baseado no status
  const bgGradient = atStop
    ? 'linear-gradient(160deg, #052005 0%, #0f3d0f 100%)'
    : hurry
      ? 'linear-gradient(160deg, #1a0505 0%, #3d0f0f 100%)'
      : isArriving
        ? 'linear-gradient(160deg, #1a0505 0%, #3d0f0f 100%)'
        : 'linear-gradient(160deg, #0a0a0a 0%, #1a1a2e 100%)';

  const accentColor = atStop ? '#22c55e' : hurry ? '#ef4444' : isArriving ? '#ef4444' : '#fbbf24';

  const statusLabel = arrived
    ? 'Chegou!'
    : atStop
      ? '📍 Você está no ponto!'
      : hurry
        ? '🏃 CORRE! Baú chega antes de você'
        : isArriving
          ? 'Chegando agora'
          : 'Modo viagem ativo';

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: bgGradient, transition: 'background 1s ease' }}
    >
      <style>{`
        @keyframes tripPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        @keyframes tripBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>

      {/* ── Mapa ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: '1', position: 'relative', minHeight: 0 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

        {/* Status badge sobre o mapa */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-2xl flex items-center gap-2"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', border: `1px solid ${accentColor}40` }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor, animation: 'tripPulse 1s ease-in-out infinite' }} />
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
            {statusLabel}
          </span>
        </div>

        {/* GPS loading */}
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
            <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">📍 GPS negado</span>
          </div>
        )}
      </div>

      {/* ── Painel inferior ───────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 pt-4 pb-8 flex flex-col gap-3"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      >
        {/* Linha info + countdown */}
        <div className="flex items-center gap-3">
          {/* Countdown ring compacto */}
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

          {/* Info da linha + distância */}
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

            {/* Métricas */}
            <div className="flex gap-2">
              {routeInfo && (
                <div
                  className="flex-1 rounded-xl px-3 py-2"
                  style={{ background: hurry ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', border: `1px solid ${hurry ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}` }}
                >
                  <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: hurry ? '#ef4444' : '#3b82f6' }}>
                    🚶 A pé
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
                <p className="text-[7px] font-black uppercase tracking-widest text-yellow-400">🚍 Ônibus</p>
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
              ✅ Você está no ponto!
            </p>
            <p className="text-[9px] font-bold text-green-400/60 mt-0.5">
              Aguarde o ônibus chegar
            </p>
          </div>
        )}

        {/* Chegou o ônibus */}
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
