import React from 'react';
import { ActiveTab, ThemeTokens } from '../types';
import { haptic } from '../utils';

interface BottomNavProps {
  activeTab: ActiveTab;
  favCount: number;
  theme: ThemeTokens;
  lightTheme?: boolean;
  onTabChange: (tab: ActiveTab) => void;
}

const NAV_ITEMS = [
  { tab: 'search' as ActiveTab, icon: '/buscar.png', label: 'Busca' },
  { tab: 'favs' as ActiveTab, icon: '/salvos.png', label: 'Favoritos' },
  { tab: 'map' as ActiveTab, icon: '/mapa.png', label: 'Mapa' },
  { tab: 'sitpass' as ActiveTab, icon: '/sitpass.png', label: 'SitPass' },
];

// Tab bar flutuante em "Liquid Glass": vidro translúcido com blur e uma
// cápsula de vidro que desliza até a aba ativa. Estilos em .lg-* (App.tsx).
const BottomNav: React.FC<BottomNavProps> = ({ activeTab, favCount, lightTheme = false, onTabChange }) => {
  const activeIndex = Math.max(0, NAV_ITEMS.findIndex(i => i.tab === activeTab));
  const glass = lightTheme ? 'lg-glass lg-light' : 'lg-glass lg-dark';

  return (
    <nav
      className="fixed left-1/2 z-50 -translate-x-1/2"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)', width: 'min(92vw, 360px)' }}
      aria-label="Navegação principal"
    >
      <div className={`${glass} relative flex rounded-full p-1.5`}>
        {/* Cápsula de vidro que desliza entre as abas */}
        <div
          aria-hidden
          className={`lg-lens ${lightTheme ? 'lg-lens-light' : 'lg-lens-dark'} absolute bottom-1.5 left-1.5 top-1.5 rounded-full`}
          style={{
            width: 'calc((100% - 12px) / 4)',
            transform: `translateX(${activeIndex * 100}%)`,
            transition: 'transform 520ms cubic-bezier(0.34, 1.4, 0.64, 1)',
          }}
        />
        {NAV_ITEMS.map(({ tab, icon, label }) => {
          const active = activeTab === tab;
          const labelColor = active
            ? (lightTheme ? 'text-amber-700' : 'text-yellow-300')
            : (lightTheme ? 'text-gray-600' : 'text-white/60');
          return (
            <button
              key={tab}
              onClick={() => { onTabChange(tab); haptic(30); }}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="relative z-10 flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full transition-transform duration-200 active:scale-90"
            >
              <span
                className="relative block transition-transform duration-300"
                style={{ width: 24, height: 24, transform: active ? 'scale(1.1)' : 'scale(1)', opacity: active ? 1 : 0.75 }}
              >
                <img src={icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                {tab === 'favs' && favCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 text-[8px] font-black leading-none text-black shadow">
                    {favCount > 9 ? '9+' : favCount}
                  </span>
                )}
              </span>
              <span className={`text-[9px] font-black uppercase tracking-[0.12em] transition-colors duration-300 ${labelColor}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
