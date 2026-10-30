import React, { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { BusLine, FavoriteItem, ThemeTokens } from '../types';
import { haptic } from '../utils';
import TimeDisplay from './TimeDisplay';
import {
  getPredictionInsight, getPredictionVersion, subscribePredictions, PredictionInsight, bucketFor,
} from '../utils/predictionHistory';
import { reportCrowd, CrowdLevel } from '../utils/crowdApi';
import {
  subscribeCrowd, getCrowdVersion, getCrowd, ensureCrowd, crowdLabel, canReportCrowd, markReportedCrowd,
} from '../utils/crowdStore';
import { trackEvent } from '../utils/analytics';

const CONF_LABEL = { alta: 'alta', media: 'média', baixa: 'baixa' } as const;
const CONF_DOTS = { alta: 3, media: 2, baixa: 1 } as const;
const TONE_CLASS = {
  late: 'text-yellow-400',
  early: 'text-sky-400',
  ok: 'text-emerald-400',
  learning: '',
} as const;

const PredictionBadge: React.FC<{ insight: PredictionInsight; subtextClass: string }> = ({ insight, subtextClass }) => {
  if (insight.tone === 'learning') {
    return (
      <div className={`text-[8px] font-bold uppercase tracking-widest text-center ${subtextClass} opacity-70`}>
        Aprendendo esta linha… {insight.samples}/{insight.needed} chegadas medidas
      </div>
    );
  }
  const dots = CONF_DOTS[insight.confidence];
  return (
    <div
      className={`text-[9px] font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5 flex-wrap ${TONE_CLASS[insight.tone]}`}
      title={insight.scope === 'global'
        ? `Baseado em ${insight.samples} chegadas medidas por usuários do app`
        : `Baseado em ${insight.samples} chegadas medidas neste aparelho`}
    >
      <span>{insight.label}</span>
      <span className={`${subtextClass} font-bold`}>
        · confiança {CONF_LABEL[insight.confidence]} {'●'.repeat(dots)}{'○'.repeat(3 - dots)}
      </span>
    </div>
  );
};

const CROWD_TEXT = {
  vazio: { text: 'Costuma estar vazio nesse horário', cls: 'text-emerald-400' },
  cheio: { text: 'Costuma estar cheio nesse horário', cls: 'text-yellow-400' },
  lotado: { text: 'Costuma estar lotado nesse horário', cls: 'text-red-400' },
} as const;

const CROWD_OPTIONS: Array<{ level: CrowdLevel; label: string }> = [
  { level: 1, label: '🟢 Vazio' },
  { level: 2, label: '🟡 Cheio' },
  { level: 3, label: '🔴 Lotado' },
];

// "Tá lotado?": mostra o que a comunidade costuma relatar e deixa você relatar em 2 toques.
const CrowdRow: React.FC<{ cardKey: string; lineNumber: string; stopId: string; subtextClass: string }> = ({
  cardKey, lineNumber, stopId, subtextClass,
}) => {
  useSyncExternalStore(subscribeCrowd, getCrowdVersion);
  useEffect(() => { ensureCrowd(cardKey); }, [cardKey]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const label = crowdLabel(getCrowd(cardKey));

  const report = (level: CrowdLevel) => {
    setOpen(false);
    if (!canReportCrowd(cardKey)) { setMsg('Você já relatou há pouco. Obrigado!'); }
    else {
      markReportedCrowd(cardKey);
      void reportCrowd(cardKey, level, bucketFor());
      trackEvent('lotacao_report', { line: lineNumber, stop: stopId, nivel: level });
      haptic(40);
      setMsg('Obrigado pelo relato!');
    }
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <div className={`text-[9px] font-black uppercase tracking-widest text-center ${CROWD_TEXT[label.level].cls}`}>
          👥 {CROWD_TEXT[label.level].text}
          <span className={`${subtextClass} font-bold`}> · {label.reports} relatos</span>
        </div>
      )}
      {msg && <div className="text-[9px] font-black uppercase tracking-widest text-emerald-400">{msg}</div>}
      {!msg && !open && (
        <button
          onClick={e => { e.stopPropagation(); setOpen(true); haptic(20); }}
          className={`text-[9px] font-black uppercase tracking-widest underline underline-offset-2 opacity-70 active:opacity-100 ${subtextClass}`}
        >
          Relatar lotação
        </button>
      )}
      {open && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {CROWD_OPTIONS.map(o => (
            <button
              key={o.level}
              onClick={e => { e.stopPropagation(); report(o.level); }}
              className="border border-white/15 bg-white/5 rounded-full px-3 py-1.5 text-[10px] font-black active:scale-95 transition-transform"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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
  onRemoveAlert, onShowAlertModal, onShare, onStartTrip,
}: BusLineCardProps) => {
  const sId = line.stopSource ?? stopId;
  const key = `${sId}::${line.number}`;
  const isFav = favorites.some(f => f.stopId === sId && f.lineNumber === line.number);
  const favItem = favorites.find(f => f.stopId === sId && f.lineNumber === line.number);
  useSyncExternalStore(subscribePredictions, getPredictionVersion);
  const insight = getPredictionInsight(key);

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
      {insight && <PredictionBadge insight={insight} subtextClass={theme.subtext} />}
      <CrowdRow cardKey={key} lineNumber={line.number} stopId={sId} subtextClass={theme.subtext} />
    </div>
  );
});

export default BusLineCard;
