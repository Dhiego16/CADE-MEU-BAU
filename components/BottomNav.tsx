import React from 'react';
import { ActiveTab, ThemeTokens } from '../types';
import { haptic } from '../utils';

interface BottomNavProps {
  activeTab: ActiveTab;
  favCount: number;
  theme: ThemeTokens;
  onTabChange: (tab: ActiveTab) => void;
}

const NAV_ITEMS = [
  { tab: 'search' as ActiveTab, icon: '/buscar.png', label: 'Busca' },
  { tab: 'favs' as ActiveTab, icon: '/salvos.png', label: 'Favoritos' },
  { tab: 'map' as ActiveTab, icon: '/mapa.png', label: 'Mapa' },
  { tab: 'sitpass' as ActiveTab, icon: '/sitpass.png', label: 'SitPass' },
];

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, favCount, theme, onTabChange }) => (
  <nav
    className={`fixed bottom-0 left-0 right-0 ${theme.nav} border-t px-6 pb-12 pt-5 flex justify-between items-center z-50`}
  >
    {NAV_ITEMS.map(({ tab, icon, label }) => (
      <button
        key={tab}
        onClick={() => { onTabChange(tab); haptic(30); }}
        className={`flex flex-col items-center gap-2 transition-all duration-300 ${activeTab === tab ? 'scale-125 opacity-100' : 'opacity-40'}`}
        aria-label={label}
      >
        <div className="relative" style={{ width: 28, height: 28 }}>
          <img src={icon} alt={label} style={{ width: 28, height: 28, objectFit: 'contain' }} />
          {tab === 'favs' && favCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-yellow-400 text-black text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">
              {favCount > 9 ? '9+' : favCount}
            </span>
          )}
        </div>
        <span
          className={`text-[9px] font-black uppercase tracking-[0.2em] ${activeTab === tab ? 'text-yellow-400' : theme.inactiveNav}`}
        >
          {label}
        </span>
      </button>
    ))}
  </nav>
);

export default BottomNav;
