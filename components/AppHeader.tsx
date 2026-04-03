import React from 'react';
import { ThemeTokens } from '../types';
import { haptic } from '../utils';

interface AppHeaderProps {
  theme: ThemeTokens;
  lightTheme: boolean;
  staleData: boolean;
  activeTab: string;
  busLinesCount: number;
  favoriteLinesCount: number;
  isLoading: boolean;
  isFavoritesLoading: boolean;
  countdown: number;
  onToggleTheme: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  theme,
  lightTheme,
  staleData,
  activeTab,
  busLinesCount,
  favoriteLinesCount,
  isLoading,
  isFavoritesLoading,
  countdown,
  onToggleTheme,
}) => {
  const showCountdown =
    (activeTab === 'search' && busLinesCount > 0 && !isLoading) ||
    (activeTab === 'favs' && favoriteLinesCount > 0 && !isFavoritesLoading);

  return (
    <header
      className={`pt-[env(safe-area-inset-top)] ${theme.header} border-b p-4 flex justify-between items-center shrink-0 z-50`}
    >
      <div className="font-black italic text-yellow-400 text-xl tracking-tighter skew-x-[-10deg]">
        CADÊ MEU BAÚ?
      </div>
      <div className="flex items-center gap-3">
        {staleData && (
          <div className="text-[8px] font-black uppercase tracking-widest text-red-400 animate-pulse border border-red-500/30 px-2 py-1 rounded-xl">
            Sem internet
          </div>
        )}
        {showCountdown && (
          <div className="text-right flex flex-col items-end">
            <span className={`text-[7px] font-black ${theme.subtext} uppercase leading-none mb-0.5`}>
              Auto-Refresh
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-black text-yellow-400 tabular-nums leading-none">
                {countdown}s
              </span>
            </div>
          </div>
        )}
        {(isLoading || isFavoritesLoading) && (
          <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        )}
        <button
          onClick={() => { onToggleTheme(); haptic(30); }}
          className={`text-xl p-1.5 transition-all active:scale-110 ${theme.subtext}`}
          aria-label="Alternar tema"
        >
          {lightTheme ? '🌙' : '☀️'}
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
