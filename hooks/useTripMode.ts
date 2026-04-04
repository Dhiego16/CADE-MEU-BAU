import { useState, useEffect, useRef, useCallback } from 'react';
import { BusLine } from '../types';
import { haptic } from '../utils';

export interface TripTarget {
  stopId: string;
  stopNome: string;
  lineNumber: string;
  destination: string;
  minutesWhenSet: number;
  setAt: number;
}

export interface UseTripModeReturn {
  tripTarget: TripTarget | null;
  secondsRemaining: number | null;
  isActive: boolean;
  isArriving: boolean;
  startTrip: (line: BusLine, stopId: string, stopNome: string) => void;
  cancelTrip: () => void;
  updateFromLines: (lines: BusLine[]) => void;
}

const parseMinutes = (t?: string): number | null => {
  if (!t || t === 'SEM PREVISÃO') return null;
  if (t.toLowerCase().includes('agora')) return 0;
  const n = parseInt(t.replace(/\D/g, ''));
  return isNaN(n) ? null : n;
};

export function useTripMode(onSendNotification?: (title: string, body: string) => void): UseTripModeReturn {
  const [tripTarget, setTripTarget] = useState<TripTarget | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCountdown = useCallback((minutes: number) => {
    clearTimer();
    let secs = minutes * 60;
    setSecondsRemaining(secs);

    intervalRef.current = setInterval(() => {
      secs -= 1;
      if (secs <= 0) {
        setSecondsRemaining(0);
        clearTimer();
      } else {
        setSecondsRemaining(secs);
      }
    }, 1000);
  }, [clearTimer]);

  const startTrip = useCallback((line: BusLine, stopId: string, stopNome: string) => {
    const mins = parseMinutes(line.nextArrival);
    if (mins === null) return;

    haptic([40, 30, 80]);
    notifiedRef.current.clear();

    const target: TripTarget = {
      stopId,
      stopNome,
      lineNumber: line.number,
      destination: line.destination,
      minutesWhenSet: mins,
      setAt: Date.now(),
    };

    setTripTarget(target);
    startCountdown(mins);
  }, [startCountdown]);

  const cancelTrip = useCallback(() => {
    clearTimer();
    setTripTarget(null);
    setSecondsRemaining(null);
    notifiedRef.current.clear();
    haptic(30);
  }, [clearTimer]);

  const updateFromLines = useCallback((lines: BusLine[]) => {
    if (!tripTarget) return;

    const matching = lines.find(
      l => l.number === tripTarget.lineNumber &&
        (l.stopSource ?? '') === tripTarget.stopId
    );

    if (!matching) return;

    const newMins = parseMinutes(matching.nextArrival);
    if (newMins === null) return;

    const elapsedSecs = Math.floor((Date.now() - tripTarget.setAt) / 1000);
    const originalSecs = tripTarget.minutesWhenSet * 60;
    const expectedRemaining = Math.max(0, originalSecs - elapsedSecs);
    const apiSecs = newMins * 60;

    const drift = Math.abs(apiSecs - expectedRemaining);
    if (drift > 90) {
      setTripTarget(prev => prev ? { ...prev, minutesWhenSet: newMins, setAt: Date.now() } : null);
      startCountdown(newMins);
    }

    const thresholds = [5 * 60, 2 * 60, 60];
    for (const t of thresholds) {
      const key = `${tripTarget.lineNumber}-${t}`;
      if (!notifiedRef.current.has(key) && (secondsRemaining ?? 0) <= t && (secondsRemaining ?? 0) > t - 30) {
        notifiedRef.current.add(key);
        const label = t >= 60 ? `${Math.round(t / 60)} min` : `${t}s`;
        onSendNotification?.(
          '🚍 Baú chegando!',
          `Linha ${tripTarget.lineNumber} chega em ~${label} no ponto ${tripTarget.stopId}!`
        );
        haptic([100, 50, 100]);
      }
    }
  }, [tripTarget, secondsRemaining, startCountdown, onSendNotification]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const isActive = tripTarget !== null && secondsRemaining !== null;
  const isArriving = isActive && (secondsRemaining ?? Infinity) <= 90;

  return {
    tripTarget,
    secondsRemaining,
    isActive,
    isArriving,
    startTrip,
    cancelTrip,
    updateFromLines,
  };
}
