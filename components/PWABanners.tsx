import React from 'react';
import { UsePWAReturn } from '../hooks/usePWA';
import { haptic } from '../utils';

interface PWABannersProps {
  pwa: UsePWAReturn;
}

const PWABanners: React.FC<PWABannersProps> = ({ pwa }) => (
  <>
    {pwa.showUpdateBanner && (
      <div style={{ animation: 'slideUp 0.4s ease-out' }}>
        <div className="bg-emerald-500 rounded-[2rem] p-4 flex items-center gap-3 shadow-[0_8px_30px_rgba(16,185,129,0.4)]">
          <img src="/alert_on.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-[11px] uppercase tracking-wider leading-tight">
              Nova versão disponível!
            </p>
            <p className="text-white/70 text-[9px] font-bold uppercase tracking-widest leading-tight mt-0.5">
              Toque para atualizar agora
            </p>
          </div>
          <button
            onClick={() => { pwa.applyUpdate(); haptic(50); }}
            className="bg-white text-emerald-600 font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 shrink-0"
          >
            Atualizar
          </button>
        </div>
      </div>
    )}

    {pwa.showInstallBanner && !pwa.isInstalled && (
      <div style={{ animation: 'slideUp 0.4s ease-out' }}>
        <div className="bg-yellow-400 rounded-[2rem] p-4 flex items-center gap-3 shadow-[0_8px_30px_rgba(251,191,36,0.4)]">
          <img src="/buscar.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="font-black text-black text-[11px] uppercase tracking-wider leading-tight">
              Instale o app!
            </p>
            <p className="text-black/60 text-[9px] font-bold uppercase tracking-widest leading-tight mt-0.5">
              Acesso rápido • Funciona offline
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={pwa.handleInstall}
              className="bg-black text-yellow-400 font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95"
            >
              Instalar
            </button>
            <button onClick={pwa.dismissInstallBanner} className="p-1" aria-label="Fechar banner">
              <img src="/fechar.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', opacity: 0.5 }} />
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);

export default PWABanners;
