import React, { useEffect, useRef } from 'react';
import { ThemeTokens } from '../types';
import { TripTarget } from '../hooks/useTripMode';
import { haptic } from '../utils';

interface TripModeOverlayProps {
  tripTarget: TripTarget;
  secondsRemaining: number;
  isArriving: boolean;
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
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
      <circle
        cx="70" cy="70" r={r} fill="none"
        stroke={isArriving ? '#ef4444' : '#fbbf24'}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
      />
    </svg>
  );
};

const TripModeOverlay: React.FC<TripModeOverlayProps> = ({
  tripTarget, secondsRemaining, isArriving, theme, lightTheme, onCancel
}) => {
  const totalSecs = tripTarget.minutesWhenSet * 60;
  const progress = secondsRemaining / Math.max(totalSecs, 1);
  const { mins, seconds } = formatTime(secondsRemaining);
  const prevArrivingRef = useRef(false);

  useEffect(() => {
    if (isArriving && !prevArrivingRef.current) {
      haptic([200, 100, 200, 100, 200]);
    }
    prevArrivingRef.current = isArriving;
  }, [isArriving]);

  const arrived = secondsRemaining === 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{
        background: isArriving
          ? 'linear-gradient(160deg, #1a0505 0%, #3d0f0f 100%)'
          : 'linear-gradient(160deg, #0a0a0a 0%, #1a1a2e 100%)',
        transition: 'background 1s ease',
      }}
    >
      <style>{`
        @keyframes tripPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        @keyframes tripBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .trip-pulse { animation: tripPulse 1.5s ease-in-out infinite; }
        .trip-bounce { animation: tripBounce 0.8s ease-in-out infinite; }
      `}</style>

      <div className="flex flex-col items-center gap-6 px-8 w-full max-w-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: isArriving ? '#ef4444' : '#fbbf24',
              animation: 'tripPulse 1s ease-in-out infinite',
            }}
          />
          <span
            className="text-[9px] font-black uppercase tracking-[0.4em]"
            style={{ color: isArriving ? '#ef4444' : '#fbbf24' }}
          >
            {arrived ? 'Chegou!' : isArriving ? 'Chegando agora' : 'Modo viagem ativo'}
          </span>
        </div>

        <div className="relative flex items-center justify-center">
          <Ring progress={progress} isArriving={isArriving} />
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            {arrived ? (
              <span className="trip-bounce" style={{ fontSize: 40 }}>🚍</span>
            ) : (
              <>
                <span
                  className="font-black tabular-nums leading-none"
                  style={{
                    fontSize: 34,
                    color: isArriving ? '#ef4444' : '#fbbf24',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {mins}:{seconds}
                </span>
                <span
                  className="text-[8px] font-black uppercase tracking-widest mt-1"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  restante
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className="w-full rounded-[1.5rem] p-4 flex flex-col items-center gap-1"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span
            className="text-[10px] font-black uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Linha {tripTarget.lineNumber}
          </span>
          <span className="font-black text-sm text-white uppercase text-center leading-tight">
            {tripTarget.destination}
          </span>
          <span
            className="text-[9px] font-bold mt-1"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Ponto {tripTarget.stopId} — {tripTarget.stopNome.replace(/\s*\(\d+\)$/, '')}
          </span>
        </div>

        {arrived && (
          <div
            className="w-full rounded-[1.5rem] p-4 text-center"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <p className="font-black text-[13px] text-red-400 uppercase tracking-wider">
              Seu baú chegou!
            </p>
            <p className="text-[9px] font-bold text-red-400/60 mt-1">
              Prepare-se para embarcar
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 w-full">
          {!arrived && (
            <div
              className="w-full rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Estimativa original
              </span>
              <span className="font-black text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {tripTarget.minutesWhenSet} min
              </span>
            </div>
          )}

          <button
            onClick={() => { onCancel(); haptic(40); }}
            className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
            style={{
              background: arrived ? '#fbbf24' : 'rgba(255,255,255,0.08)',
              color: arrived ? '#000' : 'rgba(255,255,255,0.5)',
              border: arrived ? 'none' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {arrived ? 'Concluir viagem' : 'Cancelar modo viagem'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TripModeOverlay;
