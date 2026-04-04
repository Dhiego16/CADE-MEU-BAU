import React, { memo } from 'react';
import { BusLine, FavoriteItem, ThemeTokens } from '../types';
import { haptic } from '../utils';
import TimeDisplay from './TimeDisplay';

export interface BusLineCardProps {
  line: BusLine;
  isRemoving?: boolean;
  staggerIndex?: number;
  stopId: string;
  favorites: FavoriteItem[];
  activeAlerts: Record<string, number>;
  lightTheme: boolean;
  theme: ThemeTokens;
  onToggleFavorite: (line: BusLine) => void;
  onStartLongPress: (key: string, nickname?: string) => void;
  onCancelLongPress: () => void;
  onRemoveAlert: (key: string) => void;
  onShowAlertModal: (key: string) => void;
  onShare: (stopId: string, lineNumber: string) => void;
  onStartTrip?: (line: BusLine) => void;
}

const BusLineCard = memo(({
  line, isRemoving = false, staggerIndex = 0,
  stopId, favorites, activeAlerts, lightTheme: _lightTheme, theme,
  onToggleFavorite, onStartLongPress, onCancelLongPress,
  onRemoveAlert, onShowAlertModal, onShare,
}: BusLineCardProps) => {
  const sId = line.stopSource ?? stopId;
  const key = `${sId}::${line.number}`;
  const isFav = favorites.some(f => f.stopId === sId && f.lineNumber === line.number);
  const favItem = favorites.find(f => f.stopId === sId && f.lineNumber === line.number);

  return (
    <div
      className={`${theme.card} border p-5 rounded-[2.5rem] flex flex-col gap-4 shadow-xl active:scale-[0.98]`}
      style={{
        opacity: isRemoving ? 0 : 1,
        transform: isRemoving ? 'scale(0.92) translateY(-8px)' : undefined,
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        animationDelay: `${staggerIndex * 60}ms`,
      }}
      onTouchStart={() => isFav && onStartLongPress(key, favItem?.nickname)}
      onTouchEnd={onCancelLongPress}
      onTouchMove={onCancelLongPress}
      onMouseDown={() => isFav && onStartLongPress(key, favItem?.nickname)}
      onMouseUp={onCancelLongPress}
      onMouseLeave={onCancelLongPress}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="text-4xl font-black text-yellow-400 italic w-24 shrink-0 text-center leading-none tracking-tighter drop-shadow-[0_2px_10px_rgba(251,191,36,0.2)]">
            {line.number}
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            {favItem?.nickname && (
              <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-0.5">
                <img src="/editar.png" alt="" style={{width:14, height:14, objectFit:"contain"}} /> {favItem.nickname}
              </span>
            )}
            <div className="mb-1 pr-2 min-w-0 flex flex-col">
              <span className={`text-[9px] font-bold ${theme.subtext} uppercase tracking-widest`}>INDO PARA:</span>
              <span className={`font-black text-[13px] uppercase ${theme.destText} leading-tight break-words`}>{line.destination}</span>
            </div>
            {line.stopSource && (
              <div className={`text-[8px] font-bold ${theme.stopBadge} uppercase tracking-widest mb-1`}>
                <img src="/localizacao.png" alt="" style={{width:12, height:12, objectFit:"contain"}} /> PONTO {line.stopSource}
              </div>
            )}
            <div className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${theme.subtext}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${line.nextArrival?.toLowerCase().includes('aprox') ? 'bg-red-500' : 'bg-emerald-500'}`} />
              {line.nextArrival?.toLowerCase().includes('aprox') ? 'Offline' : 'Online agora'}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(line); }}
            className="transition-all duration-200 active:scale-150 p-2"
          >
            <img
              src={isFav ? '/favorito.png' : '/no_favorito.png'}
              alt="Favorito"
              style={{width:28, height:28, objectFit:'contain', opacity: isFav ? 1 : 0.4}}
            />
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              if (activeAlerts[key]) { onRemoveAlert(key); }
              else { onShowAlertModal(key); }
              haptic(30);
            }}
            className="p-1.5 transition-all active:scale-125"
            title={activeAlerts[key] ? `Alerta: ${activeAlerts[key]} min — toque para remover` : 'Criar alerta'}
          >
            <img
              src={activeAlerts[key] ? '/alert_on.png' : '/alert_off.png'}
              alt="Alerta"
              style={{width:24, height:24, objectFit:'contain', opacity: activeAlerts[key] ? 1 : 0.4}}
            />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onShare(sId, line.number); haptic(30); }}
            className="p-1.5 transition-all active:scale-125"
          >
            <img src="/share.png" alt="Compartilhar" style={{width:24, height:24, objectFit:'contain', opacity: 0.5}} />
          </button>
{onStartTrip && (
  <button
    onClick={e => { e.stopPropagation(); onStartTrip(line); haptic(40); }}
    className="p-1.5 transition-all active:scale-125"
    title="Iniciar modo viagem"
  >
    <img src="/localizacao.png" alt="Viagem" style={{width:24, height:24, objectFit:'contain', opacity:0.5}} />
  </button>
)}
        </div>
      </div>
      <div className="flex gap-2">
        <div className={`flex-1 ${theme.timeCard1} rounded-[1.5rem] p-4 border flex flex-col items-center justify-center min-h-[95px]`}>
          <span className={`block text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2`}>Chega em:</span>
          <TimeDisplay timeStr={line.nextArrival ?? 'SEM PREVISÃO'} isNext={true} />
        </div>
        <div className={`flex-1 ${theme.timeCard2} rounded-[1.5rem] p-4 border flex flex-col items-center justify-center min-h-[95px] opacity-90`}>
          <span className={`block text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2`}>Próximo em:</span>
          <TimeDisplay timeStr={line.subsequentArrival ?? 'SEM PREVISÃO'} isNext={false} />
        </div>
      </div>
    </div>
  );
});

export default BusLineCard;
