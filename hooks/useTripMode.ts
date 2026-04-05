import { useState, useEffect, useRef, useCallback } from 'react';
import { BusLine } from '../types';
import { haptic } from '../utils';

const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjhmNjlhZmYwMzIyYzRmYjg5YzdkNGNhY2M4NjA5N2I0IiwiaCI6Im11cm11cjY0In0=';

export interface TripTarget {
  stopId: string;
  stopNome: string;
  stopLat: number;
  stopLng: number;
  lineNumber: string;
  destination: string;
  minutesWhenSet: number;
  setAt: number;
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface RouteInfo {
  distanceM: number;
  walkingMinutes: number;
  coordinates: [number, number][]; // [lng, lat] pairs para Leaflet
}

export interface UseTripModeReturn {
  tripTarget: TripTarget | null;
  secondsRemaining: number | null;
  isActive: boolean;
  isArriving: boolean;
  userLocation: UserLocation | null;
  routeInfo: RouteInfo | null;
  locationStatus: 'idle' | 'loading' | 'granted' | 'denied';
  urgencyStatus: 'ok' | 'hurry' | 'arrived_at_stop';
  startTrip: (line: BusLine, stopId: string, stopNome: string, stopLat: number, stopLng: number) => void;
  cancelTrip: () => void;
  updateFromLines: (lines: BusLine[]) => void;
}

const parseMinutes = (t?: string): number | null => {
  if (!t || t === 'SEM PREVISÃO') return null;
  if (t.toLowerCase().includes('agora')) return 0;
  const n = parseInt(t.replace(/\D/g, ''));
  return isNaN(n) ? null : n;
};

const calcDistM = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

async function fetchRoute(userLat: number, userLng: number, stopLat: number, stopLng: number): Promise<RouteInfo | null> {
  try {
    const res = await fetch(
      `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${ORS_API_KEY}&start=${userLng},${userLat}&end=${stopLng},${stopLat}`
    );
    if (!res.ok) return null;
    const data = await res.json();

    const feature = data.features?.[0];
    if (!feature) return null;

    const distanceM = feature.properties.summary.distance;
    const walkingMinutes = Math.max(1, Math.round(distanceM / 80));
    const coordinates = feature.geometry.coordinates as [number, number][];

    return { distanceM, walkingMinutes, coordinates };
  } catch {
    // Fallback para linha reta
    const distanceM = calcDistM(userLat, userLng, stopLat, stopLng);
    const walkingMinutes = Math.max(1, Math.round(distanceM / 80));
    return { distanceM, walkingMinutes, coordinates: [[userLng, userLat], [stopLng, stopLat]] };
  }
}

export function useTripMode(onSendNotification?: (title: string, body: string) => void): UseTripModeReturn {
  const [tripTarget, setTripTarget] = useState<TripTarget | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());
  const routeFetchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tripTargetRef = useRef<TripTarget | null>(null);
  const secondsRemainingRef = useRef<number | null>(null);

  useEffect(() => { tripTargetRef.current = tripTarget; }, [tripTarget]);
  useEffect(() => { secondsRemainingRef.current = secondsRemaining; }, [secondsRemaining]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const clearWatcher = useCallback(() => {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (routeFetchTimerRef.current) { clearInterval(routeFetchTimerRef.current); routeFetchTimerRef.current = null; }
  }, []);

  const startCountdown = useCallback((minutes: number) => {
    clearTimer();
    let secs = minutes * 60;
    setSecondsRemaining(secs);
    intervalRef.current = setInterval(() => {
      secs -= 1;
      if (secs <= 0) { setSecondsRemaining(0); clearTimer(); }
      else setSecondsRemaining(secs);
    }, 1000);
  }, [clearTimer]);

  const startGPS = useCallback((target: TripTarget) => {
    if (!navigator.geolocation) return;
    setLocationStatus('loading');

    // Busca rota inicial e depois a cada 30s
    const doFetchRoute = async (lat: number, lng: number) => {
      const route = await fetchRoute(lat, lng, target.stopLat, target.stopLng);
      setRouteInfo(route);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setLocationStatus('granted');
        setUserLocation(loc);
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    // Busca rota a cada 30s
    navigator.geolocation.getCurrentPosition(pos => {
      doFetchRoute(pos.coords.latitude, pos.coords.longitude);
    });

    routeFetchTimerRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(pos => {
        doFetchRoute(pos.coords.latitude, pos.coords.longitude);
      });
    }, 30000);
  }, []);

  const startTrip = useCallback((
    line: BusLine,
    stopId: string,
    stopNome: string,
    stopLat: number,
    stopLng: number,
  ) => {
    const mins = parseMinutes(line.nextArrival);
    if (mins === null) return;

    haptic([40, 30, 80]);
    notifiedRef.current.clear();

    const target: TripTarget = {
      stopId, stopNome, stopLat, stopLng,
      lineNumber: line.number,
      destination: line.destination,
      minutesWhenSet: mins,
      setAt: Date.now(),
    };

    setTripTarget(target);
    setRouteInfo(null);
    setUserLocation(null);
    startCountdown(mins);
    startGPS(target);
  }, [startCountdown, startGPS]);

  const cancelTrip = useCallback(() => {
    clearTimer();
    clearWatcher();
    setTripTarget(null);
    setSecondsRemaining(null);
    setUserLocation(null);
    setRouteInfo(null);
    setLocationStatus('idle');
    notifiedRef.current.clear();
    haptic(30);
  }, [clearTimer, clearWatcher]);

  const updateFromLines = useCallback((lines: BusLine[]) => {
    const target = tripTargetRef.current;
    const secs = secondsRemainingRef.current;
    if (!target) return;

    const matching = lines.find(
      l => l.number === target.lineNumber && (l.stopSource ?? '') === target.stopId
    );
    if (!matching) return;

    const newMins = parseMinutes(matching.nextArrival);
    if (newMins === null) return;

    const elapsedSecs = Math.floor((Date.now() - target.setAt) / 1000);
    const expectedRemaining = Math.max(0, target.minutesWhenSet * 60 - elapsedSecs);
    const drift = Math.abs(newMins * 60 - expectedRemaining);

    if (drift > 90) {
      setTripTarget(prev => prev ? { ...prev, minutesWhenSet: newMins, setAt: Date.now() } : null);
      startCountdown(newMins);
    }

    const thresholds = [5 * 60, 2 * 60, 60];
    for (const t of thresholds) {
      const key = `${target.lineNumber}-${t}`;
      if (!notifiedRef.current.has(key) && (secs ?? 0) <= t && (secs ?? 0) > t - 30) {
        notifiedRef.current.add(key);
        const label = t >= 60 ? `${Math.round(t / 60)} min` : `${t}s`;
        onSendNotification?.('🚍 Baú chegando!', `Linha ${target.lineNumber} chega em ~${label} no ponto ${target.stopId}!`);
        haptic([100, 50, 100]);
      }
    }
  }, [startCountdown, onSendNotification]);

  useEffect(() => {
    return () => { clearTimer(); clearWatcher(); };
  }, [clearTimer, clearWatcher]);

  const isActive = tripTarget !== null && secondsRemaining !== null;
  const isArriving = isActive && (secondsRemaining ?? Infinity) <= 90;

  // Calcula urgência baseado em tempo a pé vs tempo do ônibus
  const distM = userLocation && tripTarget
    ? calcDistM(userLocation.lat, userLocation.lng, tripTarget.stopLat, tripTarget.stopLng)
    : null;
  const atStop = distM !== null && distM <= 50;
  const walkMins = routeInfo?.walkingMinutes ?? (distM ? Math.max(1, Math.round(distM / 80)) : null);
  const busMins = secondsRemaining !== null ? Math.ceil(secondsRemaining / 60) : null;
  const urgencyStatus = atStop
    ? 'arrived_at_stop'
    : walkMins !== null && busMins !== null && walkMins > busMins
      ? 'hurry'
      : 'ok';

  return {
    tripTarget,
    secondsRemaining,
    isActive,
    isArriving,
    userLocation,
    routeInfo,
    locationStatus,
    urgencyStatus,
    startTrip,
    cancelTrip,
    updateFromLines,
  };
}
