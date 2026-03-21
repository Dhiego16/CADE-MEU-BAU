import React from 'react';
import { getUrgencyColor } from '../utils';

interface TimeDisplayProps {
  timeStr: string;
  isNext: boolean;
}

const TimeDisplay: React.FC<TimeDisplayProps> = ({ timeStr, isNext }) => {
  const isNoPrev = timeStr === 'SEM PREVISÃO';
  const urgencyClasses = getUrgencyColor(timeStr);
  const isApprox = timeStr.toLowerCase().includes('aprox');

  if (isNoPrev) {
    return (
      <div className={`px-2 py-3 rounded-2xl ${urgencyClasses} font-black uppercase tracking-tighter w-full text-center text-[9px] opacity-40`}>
        {timeStr}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center w-full rounded-2xl py-2 ${urgencyClasses} ${!isNext ? 'opacity-90' : ''}`}>
      <span className={`font-black leading-none tracking-tighter ${isNext ? 'text-2xl' : 'text-xl'}`}>{timeStr}</span>
      <span className="text-[7px] font-black uppercase tracking-widest mt-0.5 opacity-80">MINUTO(S)</span>
      {isApprox && (
        <span className="text-[6px] font-black uppercase tracking-widest mt-1 opacity-80 text-center">
          IMPOSSÍVEL RASTREAR O BAÚ AGORA, MOSTRANDO TEMPO ESPECULADO!
        </span>
      )}
    </div>
  );
};

export default TimeDisplay;
