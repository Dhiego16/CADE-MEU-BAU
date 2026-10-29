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

  const glass = lightTheme ? 'lg-glass lg-light' : 'lg-glass lg-dark';
  const logoColor = lightTheme ? 'text-amber-600' : 'text-yellow-400';
  const textColor = lightTheme ? 'text-gray-800' : 'text-white';

  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2">
        {/* Botão flutuante: logo */}
        <div className={`${glass} pointer-events-auto rounded-full px-4 py-2.5`}>
          <div className={`font-black italic ${logoColor} text-base tracking-tighter skew-x-[-10deg] whitespace-nowrap`}>
            CADÊ MEU BAÚ?
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão flutuante: contador (aparece/some com animação) */}
          <div
            className={`${glass} pointer-events-auto flex items-center gap-1.5 overflow-hidden rounded-full transition-all duration-300 ease-out ${
              showCountdown ? 'max-w-[90px] px-3 py-2.5 opacity-100' : 'max-w-0 border-transparent px-0 py-2.5 opacity-0'
            }`}
            aria-hidden={!showCountdown}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full animate-pulse ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className={`text-sm font-black tabular-nums leading-none whitespace-nowrap ${lightTheme ? 'text-amber-700' : 'text-yellow-300'}`}>
              {countdown}s
            </span>
          </div>

          {(isLoading || isFavoritesLoading) && (
            <div className={`${glass} pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full`}>
              <div className="h-5 w-5 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
            </div>
          )}

          {/* Botão flutuante: tema */}
          <button
            onClick={() => { onToggleTheme(); haptic(30); }}
            className={`${glass} pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-lg transition-transform active:scale-90 ${textColor}`}
            aria-label="Alternar tema"
          >
            {lightTheme ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      {/* Aviso de offline: pílula de vidro vermelha logo abaixo */}
      {(!isOnline || showOfflineBanner || staleData) && (
        <div
          className="pointer-events-none mx-auto mt-2 flex max-w-md items-center justify-center rounded-full px-4 py-2"
          style={{
            background: 'linear-gradient(90deg, rgba(127,29,29,0.88), rgba(153,27,27,0.88))',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.18)',
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-white animate-pulse">
            {!isOnline
              ? '📡 Sem conexão — os dados podem estar desatualizados'
              : '⚠️ Previsões indisponíveis agora — mostrando o último resultado'}
          </span>
        </div>
      )}
    </header>
  );
};

export default AppHeader;
