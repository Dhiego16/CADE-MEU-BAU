import React, { useEffect, useState } from 'react';
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineBanner(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineBanner(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showCountdown =
    (activeTab === 'search' && busLinesCount > 0 && !isLoading) ||
    (activeTab === 'favs' && favoriteLinesCount > 0 && !isFavoritesLoading);

  return (
    <>
      {/* Banner de offline fixo abaixo do header */}
      {(!isOnline || showOfflineBanner || staleData) && (
        <div
          className="w-full z-[60] flex items-center justify-center gap-2 py-2 px-4"
          style={{
            background: 'linear-gradient(90deg, #7f1d1d, #991b1b)',
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-white animate-pulse">
            {!isOnline
              ? '📡 Sem conexão — os dados podem estar desatualizados'
              : '⚠️ Dados desatualizados — verifique sua internet'}
          </span>
        </div>
      )}

      <header
        className={`pt-[env(safe-area-inset-top)] ${theme.header} border-b p-4 flex justify-between items-center shrink-0 z-50`}
      >
        <div className="font-black italic text-yellow-400 text-xl tracking-tighter skew-x-[-10deg]">
          CADÊ MEU BAÚ?
        </div>
        <div className="flex items-center gap-3">
          {showCountdown && (
            <div className="text-right flex flex-col items-end">
              <span className={`text-[7px] font-black ${theme.subtext} uppercase leading-none mb-0.5`}>
                Auto-Refresh
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
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
    </>
  );
};

export default AppHeader;