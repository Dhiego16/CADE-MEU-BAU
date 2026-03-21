import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ThemeTokens, LeafletLib, LeafletMap, LeafletMarker } from '../types';

const normDestino = (s: string): string =>
  s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').trim();

const geoDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

export interface MiniMapProps {
  stopLat: number;
  stopLng: number;
  stopNome: string;
  lineNumber: string;
  destination: string;
  onClose: () => void;
  theme: ThemeTokens;
  lightTheme: boolean;
}

const MiniMap: React.FC<MiniMapProps> = ({
  stopLat, stopLng, stopNome, lineNumber, destination, onClose, theme, lightTheme,
}) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const busMarkerRef = useRef<LeafletMarker | null>(null);
  const stopMarkerRef = useRef<LeafletMarker | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [busFound, setBusFound] = useState<boolean | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const fetchAndUpdateBus = useCallback(async (map: LeafletMap, L: LeafletLib) => {
    try {
      const r = await fetch(`/api/realtimebus?linha=${lineNumber}`);
      if (!r.ok) return;
      const onibus = await r.json();
      if (!Array.isArray(onibus) || onibus.length === 0) { setBusFound(false); return; }

      const withCoords = onibus.filter((bus: { lat: number; lng: number }) => bus.lat && bus.lng);
      if (withCoords.length === 0) { setBusFound(false); return; }

      const destNorm = normDestino(destination);
      const mesmoDestino = withCoords.filter((bus: { destino?: string }) =>
        normDestino(bus.destino || '').includes(destNorm) || destNorm.includes(normDestino(bus.destino || ''))
      );
      const candidatos = mesmoDestino.length > 0 ? mesmoDestino : withCoords;
      type BusData = { lat: number; lng: number; destino?: string };
      const maisProximo = (candidatos as BusData[]).reduce<BusData | null>((closest, bus) => {
        if (!closest) return bus;
        return geoDistance(stopLat, stopLng, bus.lat, bus.lng) < geoDistance(stopLat, stopLng, closest.lat, closest.lng)
          ? bus : closest;
      }, null);

      if (!maisProximo) { setBusFound(false); return; }
      setBusFound(true);

      if (busMarkerRef.current) {
        busMarkerRef.current.setLatLng([maisProximo.lat, maisProximo.lng]);
      } else {
        const busIcon = L.icon({
          iconUrl: '/onibus_realtime.png',
          iconSize: [36, 36],
          iconAnchor: [18, 36],
          popupAnchor: [0, -36],
        });
        busMarkerRef.current = L.marker([maisProximo.lat, maisProximo.lng], { icon: busIcon })
          .addTo(map)
          .bindPopup(`<b>Linha ${lineNumber}</b><br>${maisProximo.destino || destination}`);
      }

      // Centraliza entre ponto e ônibus
      const minLat = Math.min(stopLat, maisProximo.lat);
      const maxLat = Math.max(stopLat, maisProximo.lat);
      const minLng = Math.min(stopLng, maisProximo.lng);
      const maxLng = Math.max(stopLng, maisProximo.lng);
      const diff = Math.abs(maxLat - minLat) + Math.abs(maxLng - minLng);

      if (diff < 0.002) {
        map.setView([stopLat, stopLng], 15, { animate: true });
      } else {
        map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [40, 40], animate: true, maxZoom: 17 });
      }
    } catch { /* ignora */ }
  }, [lineNumber, destination, stopLat, stopLng]);

  // Inicializa o mapa
  useEffect(() => {
    const loadLeaflet = () => new Promise<void>((resolve, reject) => {
      if ((window as { L?: unknown }).L) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar Leaflet'));
      document.head.appendChild(script);
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
    });

    loadLeaflet().then(() => {
      if (!mapDivRef.current || leafletMapRef.current) return;
      const L = (window as unknown as { L: LeafletLib }).L;

      const map = L.map(mapDivRef.current, {
        center: [stopLat, stopLng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
      } as object);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const stopIcon = L.icon({
        iconUrl: '/ponto.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
      stopMarkerRef.current = L.marker([stopLat, stopLng], { icon: stopIcon })
        .addTo(map)
        .bindPopup(stopNome);

      leafletMapRef.current = map;
      setMapReady(true);
      fetchAndUpdateBus(map, L);
    }).catch(() => {});

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (busMarkerRef.current) { busMarkerRef.current.remove(); busMarkerRef.current = null; }
      if (stopMarkerRef.current) { stopMarkerRef.current.remove(); stopMarkerRef.current = null; }
      if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; }
    };
  }, []); // eslint-disable-line

  // Timer de auto-refresh após mapa pronto
  useEffect(() => {
    if (!mapReady) return;
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          const L = (window as unknown as { L?: LeafletLib }).L;
          if (leafletMapRef.current && L) fetchAndUpdateBus(leafletMapRef.current, L);
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mapReady, fetchAndUpdateBus]);

  return (
    <div
      className={`mt-2 rounded-[1.5rem] overflow-hidden border`}
      style={{
        borderColor: lightTheme ? 'rgba(37,99,235,0.25)' : 'rgba(96,165,250,0.2)',
        background: lightTheme ? 'rgba(239,246,255,1)' : 'rgba(15,23,42,0.9)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: lightTheme ? 'rgba(37,99,235,0.1)' : 'rgba(29,78,216,0.35)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {busFound !== false && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
          )}
          <span className="font-black text-[10px] uppercase tracking-widest text-blue-400 truncate">
            Linha {lineNumber} ao vivo
          </span>
          {busFound === false && (
            <span className={`text-[9px] font-bold ${theme.subtext} shrink-0`}>
              — nenhum ônibus detectado
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {mapReady && busFound !== false && (
            <span className={`font-black text-[10px] tabular-nums ${theme.subtext}`}>{countdown}s</span>
          )}
          <button onClick={onClose} className="p-1 active:scale-95 transition-transform">
            <img src="/fechar.png" alt="Fechar" style={{ width: 18, height: 18, objectFit: 'contain', opacity: 0.6 }} />
          </button>
        </div>
      </div>

      {/* Mapa */}
      <div style={{ position: 'relative' }}>
        <div ref={mapDivRef} style={{ height: 200, width: '100%' }} />
        {!mapReady && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-2"
            style={{ background: lightTheme ? '#eff6ff' : '#0f172a' }}
          >
            <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            <span className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>
              Carregando...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniMap;
