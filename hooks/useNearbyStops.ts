import { useState, useCallback, useEffect, useRef } from 'react';
import PONTOS_DATA from '../pontos.json';
import { loadExtraStops, mergePontos } from '../utils/pontosExtras';

interface PontoData {
  id: string;
  lat: number;
  lng: number;
  nome: string;
}

export interface NearbyStop extends PontoData {
  distanceM: number;
  walkingMinutes: number;
}

const calcDist = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  return Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
};

const deduplicarPontos = (pontos: PontoData[]): PontoData[] => {
  const seen = new Set<string>();
  return pontos.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
};

export function useNearbyStops() {
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'>('idle');
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const rankear = useCallback((lat: number, lng: number, base: PontoData[]) => {
    const pontos = deduplicarPontos(base);

    const comDistancia: NearbyStop[] = pontos
      .map(p => ({
        ...p,
        distanceM: calcDist(lat, lng, p.lat, p.lng),
        walkingMinutes: Math.max(1, Math.round(calcDist(lat, lng, p.lat, p.lng) / 80)),
      }))
      .filter(p => p.distanceM <= 2000) // só mostra até 2km
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3);

    setNearbyStops(comDistancia);
  }, []);

  const calcularProximos = useCallback((lat: number, lng: number) => {
    // 1) Resposta imediata só com o pontos.json
    rankear(lat, lng, PONTOS_DATA as PontoData[]);
    // 2) Depois, completa com pontos do OpenStreetMap da região (Goiânia, Aparecida…), se houver
    void loadExtraStops(lat, lng).then(extras => {
      if (extras.length === 0) return;
      const atual = userLocationRef.current;
      if (!atual || atual.lat !== lat || atual.lng !== lng) return; // usuário já se moveu/pediu de novo
      rankear(lat, lng, mergePontos(PONTOS_DATA as PontoData[], extras));
    });
  }, [rankear]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }

    setLocationStatus('loading');

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        userLocationRef.current = { lat: latitude, lng: longitude };
        setLocationStatus('granted');
        calcularProximos(latitude, longitude);
      },
      () => {
        setLocationStatus('denied');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, [calcularProximos]);

  // Tenta pegar localização automaticamente ao montar
  useEffect(() => {
    // Verifica se já tem permissão antes de pedir
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') {
          requestLocation();
        } else if (result.state === 'denied') {
          setLocationStatus('denied');
        }
        // se 'prompt', não pede automaticamente — espera o usuário clicar
      });
    }
  }, [requestLocation]);

  return {
    nearbyStops,
    locationStatus,
    requestLocation,
  };
}