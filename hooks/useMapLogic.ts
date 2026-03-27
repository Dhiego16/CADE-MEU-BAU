import { useState, useCallback, useRef } from 'react';
import PONTOS_DATA from '../pontos.json';
import { BusLine, LeafletLib, LeafletMap, LeafletMarker, PontoDataWithMarker } from '../types';
import { haptic } from '../utils';

interface SelectedStop { id: string; nome: string }

export interface UseMapLogicReturn {
  mapRef: React.RefObject<HTMLDivElement | null>;
  mapReady: boolean;
  locationError: boolean;
  selectedStop: SelectedStop | null;
  stopLines: BusLine[];
  stopLinesLoading: boolean;
  stopLinesError: string | null;
  stopLiveLinesMap: Record<string, boolean>;
  mapRefreshCountdown: number;
  setSelectedStop: (s: SelectedStop | null) => void;
  setStopLines: React.Dispatch<React.SetStateAction<BusLine[]>>;
  setActiveMiniMap: (v: null) => void;
  initializeMap: (
    onStopClick: (stop: SelectedStop) => void,
    mergeLines: (prev: BusLine[], next: BusLine[]) => BusLine[]
  ) => void;
  getStopCoords: (stopSource: string) => { lat: number; lng: number; nome: string; id: string; marker: LeafletMarker };
  buscarLinhasPontoInterno: (pontoId: string, mergeLines: (prev: BusLine[], next: BusLine[]) => BusLine[]) => Promise<void>;
}

// Necessário para satisfazer o tipo externo; o App passa mergeLines como argumento
// para não criar dependência circular entre hooks.
export function useMapLogic(): UseMapLogicReturn {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const pontosDataRef = useRef<PontoDataWithMarker[]>([]);
  const leafletLoadingRef = useRef(false);
  const filtrarMarkersPorRaioRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedStopRef = useRef<SelectedStop | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [selectedStop, setSelectedStopState] = useState<SelectedStop | null>(null);
  const [stopLines, setStopLines] = useState<BusLine[]>([]);
  const [stopLinesLoading, setStopLinesLoading] = useState(false);
  const [stopLinesError, setStopLinesError] = useState<string | null>(null);
  const [stopLiveLinesMap, setStopLiveLinesMap] = useState<Record<string, boolean>>({});
  const [mapRefreshCountdown, setMapRefreshCountdown] = useState(15);

  const setSelectedStop = useCallback((s: SelectedStop | null) => {
    setSelectedStopState(s);
    selectedStopRef.current = s;

    if (!s) {
      if (mapRefreshTimerRef.current) clearInterval(mapRefreshTimerRef.current);
      setMapRefreshCountdown(15);
    }
  }, []);

  // ─── Placeholder para setActiveMiniMap — o App sobrescreve via prop ──────
  // Usamos um callback vazio aqui; o App passa o setter real pelo onStopClick.
  const setActiveMiniMap = useCallback((_v: null) => {}, []);

  const getStopCoords = useCallback((stopSource: string) => {
    const normalizedId = stopSource.padStart(5, '0');
    const fromRef = pontosDataRef.current.find(p => p.id === normalizedId);
    if (fromRef) return fromRef;
    const fromJson = (PONTOS_DATA as Array<{ id: string; lat: number; lng: number; nome: string }>)
      .find(p => p.id === normalizedId);
    if (fromJson) return { ...fromJson, marker: null as unknown as LeafletMarker };
    return { lat: -16.7200, lng: -49.0900, nome: `Ponto ${stopSource}`, id: stopSource, marker: null as unknown as LeafletMarker };
  }, []);

  const buscarLinhasPontoInterno = useCallback(async (
    pontoId: string,
    mergeLines: (prev: BusLine[], next: BusLine[]) => BusLine[]
  ) => {
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
  }, []);

  const initializeMap = useCallback((
    onStopClick: (stop: SelectedStop) => void,
    mergeLines: (prev: BusLine[], next: BusLine[]) => BusLine[]
  ) => {
    if (leafletMapRef.current || leafletLoadingRef.current) return;
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
        const R = 6371000; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180;
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

            const stop = { id: ponto.id, nome: ponto.nome };
            setSelectedStop(stop);
            onStopClick(stop);

            setStopLines([]);
            setStopLiveLinesMap({});
            setStopLinesError(null);
            setStopLinesLoading(true);
            buscarLinhasPontoInterno(ponto.id, mergeLines);
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
      leafletMapRef.current = map;
      setMapReady(true);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          const { latitude, longitude } = pos.coords;
          userLocationRef.current = { lat: latitude, lng: longitude };
          const userIcon = L.divIcon({
            html: `<div style="width:20px;height:20px;background:#3b82f6;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(59,130,246,0.4);"></div>`,
            className: '', iconSize: [20, 20], iconAnchor: [10, 10],
          });
          L.marker([latitude, longitude], { icon: userIcon }).addTo(map).bindPopup('Você está aqui');
          map.setView([latitude, longitude], 15);
        }, () => {
          setLocationError(true);
          pontosDataRef.current.forEach(p => p.marker.setOpacity(1));
        }, { timeout: 8000, enableHighAccuracy: true });
      } else {
        pontosDataRef.current.forEach(p => p.marker.setOpacity(1));
      }
    }).catch(() => { leafletLoadingRef.current = false; });
  }, [buscarLinhasPontoInterno, setSelectedStop]);

  // Expõe referência ao mapa para o App invalidar o tamanho ao trocar de aba
  (initializeMap as { leafletMapRef?: typeof leafletMapRef }).leafletMapRef = leafletMapRef;

  return {
    mapRef,
    mapReady,
    locationError,
    selectedStop,
    stopLines,
    stopLinesLoading,
    stopLinesError,
    stopLiveLinesMap,
    mapRefreshCountdown,
    setSelectedStop,
    setStopLines,
    setActiveMiniMap,
    initializeMap,
    getStopCoords,
    buscarLinhasPontoInterno,
  };
}
