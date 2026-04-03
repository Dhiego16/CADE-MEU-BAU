import React from 'react';
import { BusLine, FavoriteItem, ThemeTokens } from '../../types';
import { haptic } from '../../utils';
import BusLineCard from '../BusLineCard';
import SkeletonCard from '../SkeletonCard';
import MiniMap from '../MiniMap';
import { BusLineCardProps } from '../BusLineCard';

interface MiniMapConfig {
  key: string;
  lineNumber: string;
  stopLat: number;
  stopLng: number;
  stopNome: string;
  destination: string;
}

interface SearchTabProps {
  stopId: string;
  lineFilter: string;
  destFilter: string;
  busLines: BusLine[];
  displayedBusLines: BusLine[];
  isLoading: boolean;
  errorMsg: string | null;
  searchHistory: string[];
  liveLineMap: Record<string, boolean>;
  activeMiniMap: MiniMapConfig | null;
  miniMapRefreshKey: number;
  lightTheme: boolean;
  theme: ThemeTokens;
  cardProps: Omit<BusLineCardProps, 'line' | 'staggerIndex'>;
  parseTime: (t?: string) => number;
  getStopCoords: (id: string) => { lat: number; lng: number; nome: string; id: string };
  selectedStop: { id: string; nome: string } | null;
  onStopIdChange: (val: string) => void;
  onLineFilterChange: (val: string) => void;
  onDestFilterChange: (val: string) => void;
  onSearch: () => void;
  onHistorySearch: (id: string) => void;
  onToggleMiniMap: (config: MiniMapConfig) => void;
  onCloseMiniMap: () => void;
}

const SearchTab: React.FC<SearchTabProps> = ({
  stopId, lineFilter, destFilter,
  busLines, displayedBusLines, isLoading, errorMsg,
  searchHistory, liveLineMap, activeMiniMap, miniMapRefreshKey,
  lightTheme, theme, cardProps, parseTime, getStopCoords, selectedStop,
  onStopIdChange, onLineFilterChange, onDestFilterChange,
  onSearch, onHistorySearch, onToggleMiniMap, onCloseMiniMap,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') onSearch(); };

  const errors: Record<string, { icon: string; title: string; desc: string; color: string }> = {
    offline:      { icon: '/informacao.png', title: 'Sem conexão',       desc: 'Verifique sua internet e tente novamente.',                         color: 'border-slate-500/30 text-slate-400 bg-slate-500/10' },
    not_found:    { icon: '📍',             title: 'Ponto não encontrado', desc: `O ponto "${stopId}" não existe ou está inativo.`,                 color: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' },
    no_lines:     { icon: '/onibus_realtime.png', title: 'Linha não opera aqui', desc: `A linha "${lineFilter}" não para neste ponto agora.`,       color: 'border-orange-500/30 text-orange-400 bg-orange-500/10' },
    invalid_stop: { icon: '/alerta.png',    title: 'Número inválido',    desc: 'Digite um número de ponto válido. Ex: 31700',                        color: 'border-red-500/30 text-red-400 bg-red-500/10' },
  };

  return (
    <div className="page-enter space-y-5">
      {/* Search form */}
      <div className={`${theme.inputWrap} border p-5 rounded-[2.5rem] shadow-2xl space-y-4`}>
        <div className="flex gap-2">
          <div className="flex-[3] relative">
            <span className={`absolute left-4 top-2 text-[8px] font-black ${theme.subtext} uppercase pointer-events-none`}>
              Número do Ponto
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ex: 31700"
              value={stopId}
              onChange={e => onStopIdChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-xl`}
            />
          </div>
          <div className="flex-[2] relative">
            <span className={`absolute left-0 top-2 text-[8px] font-black ${theme.subtext} uppercase text-center w-full pointer-events-none`}>
              Linha (OPCIONAL)
            </span>
            <input
              type="text"
              placeholder="Ex: 327"
              value={lineFilter}
              onChange={e => onLineFilterChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-xl text-center`}
            />
          </div>
        </div>

        {busLines.length > 0 && (
          <div className="relative">
            <span className={`absolute left-4 top-2 text-[8px] font-black ${theme.subtext} uppercase pointer-events-none`}>
              Filtrar destino
            </span>
            <input
              type="text"
              placeholder="Ex: Terminal, Centro..."
              value={destFilter}
              onChange={e => onDestFilterChange(e.target.value)}
              className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none focus:border-yellow-400 transition-all placeholder:text-slate-700 text-sm`}
            />
            {destFilter && (
              <button onClick={() => onDestFilterChange('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">×</button>
            )}
          </div>
        )}

        <button
          onClick={onSearch}
          disabled={isLoading}
          className="w-full bg-yellow-400 text-black py-5 rounded-2xl font-black btn-active uppercase text-sm tracking-[0.2em] shadow-[0_10px_30px_rgba(251,191,36,0.3)] disabled:opacity-50 transition-all"
        >
          {isLoading ? 'Rastreando...' : 'Localizar Baú'}
        </button>

        {searchHistory.length > 0 && busLines.length === 0 && !isLoading && (
          <div>
            <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2 px-1`}>
              Buscas Recentes
            </p>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map(h => (
                <button
                  key={h}
                  onClick={() => { onHistorySearch(h); haptic(30); }}
                  className={`${theme.historyBtn} border text-xs font-black px-3 py-2 rounded-xl active:scale-95 transition-transform tracking-wider`}
                >
                  📍 {h}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {errorMsg && (() => {
        const e = errors[errorMsg] ?? errors['offline'];
        return (
          <div className={`border p-4 rounded-2xl flex items-start gap-3 ${e.color}`}>
            {e.icon.startsWith('/') ? (
              <img src={e.icon} alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1 }}>{e.icon}</span>
            )}
            <div>
              <p className="font-black text-[11px] uppercase tracking-widest">{e.title}</p>
              <p className="text-[9px] font-bold mt-1 opacity-80 leading-relaxed">{e.desc}</p>
              {errorMsg === 'offline' && (
                <button onClick={onSearch} className="mt-2 text-[9px] font-black uppercase tracking-widest underline opacity-70">
                  Tentar novamente →
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Skeletons */}
      {isLoading && [0, 1, 2].map(i => (
        <div key={i} className="stagger-card" style={{ animationDelay: `${i * 80}ms` }}>
          <SkeletonCard light={lightTheme} />
        </div>
      ))}

      {/* Lines */}
      {!isLoading && (
        <div className="space-y-3">
          {displayedBusLines.map((line, i) => {
            const sId = (selectedStop?.id ?? line.stopSource ?? stopId).padStart(5, '0');
            const miniKey = `${line.number}-${sId}`;
            const stopCoords = getStopCoords(sId);
            const isActive = activeMiniMap?.key === miniKey;
            const isUrgent = parseTime(line.nextArrival) <= 2;

            return (
              <div key={line.id} className="stagger-card" style={{ animationDelay: `${i * 60}ms` }}>
                <div className={isUrgent ? 'urgent-card rounded-[2.5rem]' : ''}>
                  <BusLineCard line={line} staggerIndex={i} {...cardProps} />
                </div>

                {liveLineMap[line.number] && (
                  <button
                    onClick={() => {
                      haptic(40);
                      onToggleMiniMap({
                        key: miniKey,
                        lineNumber: line.number,
                        stopLat: stopCoords.lat,
                        stopLng: stopCoords.lng,
                        stopNome: selectedStop?.nome ?? stopCoords.nome ?? `Ponto ${sId}`,
                        destination: line.destination,
                      });
                    }}
                    className={`w-full mt-1 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all ${isActive ? 'bg-blue-700 text-white' : 'bg-blue-600/15 text-blue-400 border border-blue-500/30'}`}
                  >
                    <img src="/onibus_realtime.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                    {isActive ? 'Fechar mapa ao vivo' : `Ver linha ${line.number} ao vivo`}
                    {!isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                  </button>
                )}

                {isActive && activeMiniMap && (
                  <MiniMap
                    key={activeMiniMap.key}
                    stopLat={activeMiniMap.stopLat}
                    stopLng={activeMiniMap.stopLng}
                    stopNome={activeMiniMap.stopNome}
                    lineNumber={activeMiniMap.lineNumber}
                    destination={activeMiniMap.destination}
                    refreshKey={miniMapRefreshKey}
                    onClose={onCloseMiniMap}
                    theme={theme}
                    lightTheme={lightTheme}
                  />
                )}
              </div>
            );
          })}

          {busLines.length > 0 && displayedBusLines.length === 0 && destFilter && (
            <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-2xl px-4 py-4 text-center">
              <p className="font-black text-[11px] text-yellow-400 uppercase tracking-widest">
                Nenhuma linha para "{destFilter}"
              </p>
              <button onClick={() => onDestFilterChange('')} className="mt-2 text-[9px] font-black uppercase tracking-widest text-yellow-400 underline">
                Limpar filtro
              </button>
            </div>
          )}

          {busLines.length === 0 && !errorMsg && (
            <div className="py-20 text-center opacity-10 flex flex-col items-center">
              <img src="/onibus_realtime.png" alt="" className="mb-6" style={{ width: 90, height: 90, objectFit: 'contain', opacity: 0.15 }} />
              <p className={`font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed ${theme.subtext}`}>
                Aguardando número do ponto...
              </p>
            </div>
          )}
        </div>
      )}

      <a
        href="https://forms.gle/JwtHNRw7pjaZtfV19"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => haptic(30)}
        className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border ${lightTheme ? 'border-gray-200 text-gray-400' : 'border-white/5 text-slate-600'} transition-all font-black text-[10px] uppercase tracking-widest`}
      >
        💬 Algo errado? Me avisa
      </a>
    </div>
  );
};

export default SearchTab;
