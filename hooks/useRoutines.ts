import { useState, useCallback, useEffect, useMemo } from 'react';
import { RoutineItem } from '../types';

const STORAGE_KEY = 'cade_meu_bau_routines';
// Reavalia a rotina ativa a cada 30s (suficiente pra pegar a virada de janela sem gastar bateria)
const CHECK_INTERVAL = 30000;

const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function useRoutines() {
  const [routines, setRoutines] = useState<RoutineItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CHECK_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  const persist = useCallback((next: RoutineItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addRoutine = useCallback((routine: Omit<RoutineItem, 'id'>) => {
    setRoutines(prev => {
      const next = [...prev, { ...routine, id: `routine_${Date.now()}` }];
      persist(next);
      return next;
    });
  }, [persist]);

  const updateRoutine = useCallback((id: string, patch: Partial<Omit<RoutineItem, 'id'>>) => {
    setRoutines(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, ...patch } : r));
      persist(next);
      return next;
    });
  }, [persist]);

  const removeRoutine = useCallback((id: string) => {
    setRoutines(prev => {
      const next = prev.filter(r => r.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  // ── Rotina ativa agora (dia da semana + janela de horário) ────────────────
  const activeRoutine = useMemo(() => {
    const day = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return (
      routines.find(r => {
        if (!r.days.includes(day)) return false;
        return nowMin >= toMinutes(r.startTime) && nowMin <= toMinutes(r.endTime);
      }) ?? null
    );
  }, [routines, now]);

  return { routines, activeRoutine, addRoutine, updateRoutine, removeRoutine };
}
