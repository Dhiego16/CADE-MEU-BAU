import { useState, useCallback, useEffect, useRef } from 'react';
import { RoutineItem, SearchResult } from '../types';
import { REFRESH_INTERVAL } from '../utils';

export type DepartureStatus = 'unknown' | 'plenty' | 'go_now' | 'risky';

interface StopCoords {
  lat: number;
  lng: number;
  nome: string;
  id: string;
}

const parseArrivalMinutes = (t?: string): number | null => {
  if (!t || t === 'SEM PREVISÃO') return null;
  if (t.toLowerCase().includes('agora')) return 0;
  const n = parseInt(t.replace(/\D/g, ''));
  return isNaN(n) ? null : n;
};

const straightLineWalkingMinutes = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round(distM / 80));
};

export function useRoutineTracking(
  routine: RoutineItem | null,
  performSearch: (stopId: string, lineFilter: string) => Promise<SearchResult>,
  getStopCoords: (stopId: string) => StopCoords,
) {
  const [nextArrival, setNextArrival] = useState<string | undefined>();
  const [subsequentArrival, setSubsequentArrival] = useState<string | undefined>();
  const [destination, setDestination] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [walkingMinutes, setWalkingMinutes] = useState<number | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routineIdRef = useRef<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    if (!routine) return;
    setIsLoading(true);
    try {
      const { lines } = await performSearch(routine.stopId, routine.lineNumber);
      const match = lines.find(l => l.number === routine.lineNumber) ?? lines[0];
      setNextArrival(match?.nextArrival);
      setSubsequentArrival(match?.subsequentArrival);
      setDestination(match?.destination ?? routine.destination);
    } finally {
      setIsLoading(false);
    }
  }, [routine, performSearch]);

  const fetchWalkingTime = useCallback(() => {
    if (!routine) return;
    if (!navigator.geolocation) { setLocationDenied(true); return; }

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        const coords = getStopCoords(routine.stopId);
        try {
          const res = await fetch(
            `/api/route?startLng=${longitude}&startLat=${latitude}&endLng=${coords.lng}&endLat=${coords.lat}`
          );
          if (res.ok) {
            const data = await res.json();
            const distM = data?.features?.[0]?.properties?.summary?.distance;
            if (typeof distM === 'number') {
              setWalkingMinutes(Math.max(1, Math.round(distM / 80)));
              return;
            }
          }
        } catch { /* cai no fallback abaixo */ }
        setWalkingMinutes(straightLineWalkingMinutes(latitude, longitude, coords.lat, coords.lng));
      },
      () => setLocationDenied(true),
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, [routine, getStopCoords]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!routine) {
      routineIdRef.current = null;
      setNextArrival(undefined);
      setSubsequentArrival(undefined);
      setWalkingMinutes(null);
      setLocationDenied(false);
      return;
    }

    // Só re-busca localização quando o trajeto ativo mudou (evita pedir GPS toda hora)
    if (routineIdRef.current !== routine.id) {
      routineIdRef.current = routine.id;
      fetchWalkingTime();
    }

    fetchSchedule();
    intervalRef.current = setInterval(fetchSchedule, REFRESH_INTERVAL * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine?.id]);

  const arrivalMin = parseArrivalMinutes(nextArrival);
  let departureStatus: DepartureStatus = 'unknown';
  if (arrivalMin !== null && walkingMinutes !== null) {
    const buffer = arrivalMin - walkingMinutes;
    if (buffer < 0) departureStatus = 'risky';
    else if (buffer <= 3) departureStatus = 'go_now';
    else departureStatus = 'plenty';
  }

  return {
    nextArrival,
    subsequentArrival,
    destination,
    isLoading,
    walkingMinutes,
    departureStatus,
    locationDenied,
    refresh: fetchSchedule,
    refreshWalking: fetchWalkingTime,
  };
}
