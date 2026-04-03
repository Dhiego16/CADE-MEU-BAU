import React from 'react';
import { BusLine, FavoriteItem, ThemeTokens } from '../../types';
import { haptic } from '../../utils';
import BusLineCard from '../BusLineCard';
import SkeletonCard from '../SkeletonCard';
import { BusLineCardProps } from '../BusLineCard';

interface FavsTabProps {
  favorites: FavoriteItem[];
  favoriteBusLines: BusLine[];
  displayedFavLines: BusLine[];
  groupedFavLines: Record<string, BusLine[]>;
  isFavoritesLoading: boolean;
  destFilter: string;
  stopId: string;
  removingFavKey: string | null;
  lightTheme: boolean;
  theme: ThemeTokens;
  cardProps: Omit<BusLineCardProps, 'line' | 'staggerIndex'>;
  parseTime: (t?: string) => number;
  onDestFilterChange: (val: string) => void;
  onRefresh: () => void;
  onShareStop: (pontoId: string, nomePonto: string) => void;
}

const FavsTab: React.FC<FavsTabProps> = ({
  favorites, favoriteBusLines, displayedFavLines, groupedFavLines,
  isFavoritesLoading, destFilter, stopId, removingFavKey,
  lightTheme, theme, cardProps, parseTime,
  onDestFilterChange, onRefresh, onShareStop,
}) => (
  <div className="page-enter space-y-4">
    <div className="flex items-center justify-between px-2 mb-2">
      <h2 className={`text-[10px] font-black uppercase tracking-[0.5em] ${theme.subtext} flex items-center gap-2`}>
        <img src="/favorito.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} /> Minha Garagem
      </h2>
      {favorites.length > 0 && !isFavoritesLoading && (
        <button
          onClick={() => { onRefresh(); haptic(30); }}
          className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} border ${lightTheme ? 'border-gray-300' : 'border-white/10'} px-3 py-2 rounded-xl active:scale-95 transition-transform`}
        >
          Atualizar
        </button>
      )}
    </div>

    {favoriteBusLines.length > 0 && (
      <div className="relative px-1">
        <input
          type="text"
          placeholder="🔍 Filtrar por destino ou linha..."
          value={destFilter}
          onChange={e => onDestFilterChange(e.target.value)}
          className={`w-full ${theme.input} border rounded-2xl px-4 py-3 font-black outline-none focus:border-yellow-400 transition-all text-sm`}
        />
        {destFilter && (
          <button onClick={() => onDestFilterChange('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 text-lg">×</button>
        )}
      </div>
    )}

    {favorites.length > 0 && !isFavoritesLoading && (
      <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest px-2 opacity-50`}>
        <img src="/editar.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} /> Segure o dedo em um card para dar apelido
      </p>
    )}

    {isFavoritesLoading && favorites.slice(0, 3).map((_, i) => (
      <div key={i} className="stagger-card" style={{ animationDelay: `${i * 80}ms` }}>
        <SkeletonCard light={lightTheme} />
      </div>
    ))}

    {!isFavoritesLoading && Object.entries(groupedFavLines).map(([pontoId, lines]) => (
      <div key={pontoId} className="space-y-3">
        <div className="flex items-center gap-2 px-1 pt-2">
          📍
          <span className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>Ponto {pontoId}</span>
          <div className={`flex-1 h-px ${theme.divider}`} />
          <button
            onClick={() => onShareStop(pontoId, `Ponto ${pontoId}`)}
            className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} opacity-50 active:opacity-100 transition-opacity`}
            aria-label="Compartilhar ponto"
          >
            🔗
          </button>
        </div>
        {lines.map((line, i) => {
          const key = `${line.stopSource ?? stopId}::${line.number}`;
          const isUrgent = parseTime(line.nextArrival) <= 2;
          return (
            <div key={line.id} className="stagger-card" style={{ animationDelay: `${i * 60}ms` }}>
              <div className={isUrgent ? 'urgent-card rounded-[2.5rem]' : ''}>
                <BusLineCard line={line} isRemoving={removingFavKey === key} staggerIndex={i} {...cardProps} />
              </div>
            </div>
          );
        })}
      </div>
    ))}

    {favorites.length === 0 && (
      <div className="py-28 text-center opacity-20 px-10">
        <p className="font-black text-[12px] uppercase tracking-[0.3em] mb-4">Garagem Vazia</p>
        <p className="text-[10px] leading-relaxed uppercase tracking-widest font-bold">
          Toque na estrela de uma linha para que ela apareça aqui.
        </p>
      </div>
    )}

    {!isFavoritesLoading && favorites.length > 0 && favoriteBusLines.length === 0 && (
      <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-2xl px-4 py-4 flex items-start gap-3">
        <img src="/alerta.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="font-black text-[11px] text-yellow-400 uppercase tracking-widest">Sem horários disponíveis</p>
          <p className={`text-[9px] font-bold mt-1 ${theme.subtext} leading-relaxed`}>
            Os pontos salvos podem estar sem operação agora. Tente atualizar.
          </p>
          <button onClick={() => { onRefresh(); haptic(30); }} className="mt-2 text-[9px] font-black uppercase tracking-widest text-yellow-400 underline">
            Tentar novamente →
          </button>
        </div>
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

export default FavsTab;
