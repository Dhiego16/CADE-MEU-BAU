import React from 'react';
import { BusLine, RoutineItem, ThemeTokens } from '../types';
import { haptic } from '../utils';
import { DepartureStatus } from '../hooks/useRoutineTracking';

interface RoutineCardProps {
  routine: RoutineItem;
  theme: ThemeTokens;
  lightTheme: boolean;
  nextArrival?: string;
  subsequentArrival?: string;
  destination?: string;
  isLoading: boolean;
  walkingMinutes: number | null;
  departureStatus: DepartureStatus;
  locationDenied: boolean;
  onRefreshWalking: () => void;
  onStartTrip: (line: BusLine) => void;
}

const STATUS_CONFIG: Record<DepartureStatus, { icon: string; text: string; color: string }> = {
  unknown: { icon: '📍', text: '', color: '' },
  plenty:  { icon: '✅', text: 'Dá tempo tranquilo', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  go_now:  { icon: '🏃', text: 'Sai agora!',          color: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' },
  risky:   { icon: '⚠️', text: 'Bem apertado, pode perder', color: 'border-red-500/30 bg-red-500/10 text-red-400' },
};

const RoutineCard: React.FC<RoutineCardProps> = ({
  routine, theme, lightTheme, nextArrival, subsequentArrival, destination,
  isLoading, walkingMinutes, departureStatus, locationDenied,
  onRefreshWalking, onStartTrip,
}) => {
  const status = STATUS_CONFIG[departureStatus];

  const handleStartTrip = () => {
    haptic(40);
    onStartTrip({
      id: `routine-${routine.id}`,
      number: routine.lineNumber,
      name: routine.lineNumber,
      origin: '',
      destination: destination ?? routine.destination,
      schedules: [],
      frequencyMinutes: 0,
      status: 'Normal',
      nextArrival,
      subsequentArrival,
      stopSource: routine.stopId,
    });
  };

  return (
    <div className={`${theme.inputWrap} border-2 border-yellow-400/40 p-5 rounded-[2.5rem] shadow-2xl space-y-4 relative overflow-hidden`}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between relative">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-yellow-400">
          🕒 Seu trajeto agora
        </p>
        <span className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>
          {routine.startTime}–{routine.endTime}
        </span>
      </div>

      <p className={`font-black text-lg ${theme.destText}`}>{routine.label}</p>

      <div className="flex items-center gap-3">
        <div className={`${theme.timeCard1} border rounded-2xl px-4 py-3 flex-1`}>
          <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-1`}>
            Linha {routine.lineNumber} · {(destination ?? routine.destination) || 'Destino'}
          </p>
          {isLoading && !nextArrival ? (
            <p className="text-2xl font-black opacity-30">···</p>
          ) : (
            <p className="text-2xl font-black text-yellow-400">
              {nextArrival || 'SEM PREVISÃO'}
            </p>
          )}
          {subsequentArrival && (
            <p className={`text-[9px] font-bold ${theme.subtext} mt-0.5`}>Depois: {subsequentArrival}</p>
          )}
        </div>
      </div>

      {/* ── Vou perder o ônibus? ────────────────────────────────────────── */}
      {locationDenied ? (
        <div className={`border rounded-2xl px-4 py-3 flex items-center justify-between gap-2 border-slate-500/30 bg-slate-500/10`}>
          <p className={`text-[9px] font-bold ${theme.subtext} uppercase tracking-widest`}>
            Ative a localização pra saber se dá tempo
          </p>
          <button
            onClick={() => { onRefreshWalking(); haptic(30); }}
            className="text-[9px] font-black uppercase tracking-widest text-yellow-400 underline shrink-0"
          >
            Tentar
          </button>
        </div>
      ) : departureStatus === 'unknown' ? (
        <div className={`${theme.card} border rounded-2xl px-4 py-3 flex items-center gap-2`}>
          <div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className={`text-[9px] font-bold ${theme.subtext} uppercase tracking-widest`}>
            Calculando se dá tempo de chegar...
          </p>
        </div>
      ) : (
        <div className={`border rounded-2xl px-4 py-3 flex items-center gap-3 ${status.color}`}>
          <span className="text-lg shrink-0">{status.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[11px] uppercase tracking-widest">{status.text}</p>
            <p className="text-[9px] font-bold opacity-80 mt-0.5">
              {walkingMinutes} min a pé até o ponto · ônibus em {nextArrival || '?'}
            </p>
          </div>
        </div>
      )}

      <button
        onClick={handleStartTrip}
        className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] active:scale-95 transition-all"
      >
        Iniciar viagem →
      </button>
    </div>
  );
};

export default RoutineCard;
