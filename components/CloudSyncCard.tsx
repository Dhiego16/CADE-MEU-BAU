import React, { useEffect, useState } from 'react';
import { ThemeTokens } from '../types';
import { CloudSync } from '../hooks/useCloudSync';
import { haptic } from '../utils';

interface CloudSyncCardProps {
  cloud: CloudSync;
  theme: ThemeTokens;
  lightTheme: boolean;
}

const ago = (t: number | null): string => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return 'agora';
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`;
};

const CloudSyncCard: React.FC<CloudSyncCardProps> = ({ cloud, theme, lightTheme }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!cloud.user) return;
    const id = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(id);
  }, [cloud.user]);

  if (!cloud.configured) return null;

  const border = lightTheme ? 'border-gray-200' : 'border-white/10';

  if (!cloud.user) {
    return (
      <div className={`${theme.card} border ${border} rounded-2xl p-4 flex items-center gap-3`}>
        <span className="text-2xl" aria-hidden>☁️</span>
        <div className="flex-1 min-w-0">
          <p className="font-black text-[10px] uppercase tracking-widest">Guarde seus favoritos na nuvem</p>
          <p className={`text-[9px] font-bold mt-1 leading-relaxed ${theme.subtext}`}>
            Entre com o Google para ter favoritos e trajetos em qualquer aparelho.
          </p>
          {cloud.status === 'error' && (
            <p className="text-[9px] font-bold mt-1 text-red-400">Não foi possível entrar. Tente de novo.</p>
          )}
        </div>
        <button
          onClick={() => { haptic(30); void cloud.signIn(); }}
          disabled={cloud.busy}
          className="shrink-0 bg-yellow-400 text-black font-black text-[9px] uppercase tracking-widest px-3 py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
        >
          {cloud.busy ? 'Abrindo…' : 'Entrar com Google'}
        </button>
      </div>
    );
  }

  const first = (cloud.user.name || cloud.user.email).split(' ')[0];
  const statusText =
    cloud.status === 'syncing' ? 'Sincronizando…'
    : cloud.status === 'error' ? 'Falha ao sincronizar'
    : `Sincronizado ${ago(cloud.lastSyncAt)}`.trim();

  return (
    <div className={`${theme.card} border ${border} rounded-2xl p-3 flex items-center gap-3`}>
      {cloud.user.photo ? (
        <img src={cloud.user.photo} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full shrink-0" />
      ) : (
        <span className="w-9 h-9 rounded-full bg-yellow-400 text-black font-black flex items-center justify-center shrink-0">
          {first.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-black text-[10px] uppercase tracking-widest truncate">{first}</p>
        <p className={`text-[9px] font-bold mt-0.5 ${cloud.status === 'error' ? 'text-red-400' : theme.subtext}`}>
          ☁️ {statusText}
        </p>
      </div>
      {cloud.status === 'error' && (
        <button
          onClick={() => { haptic(30); cloud.retry(); }}
          className="text-[8px] font-black uppercase tracking-widest text-yellow-400 border border-yellow-400/40 px-3 py-2 rounded-xl active:scale-95 transition-transform"
        >
          Tentar de novo
        </button>
      )}
      <button
        onClick={() => { haptic(30); void cloud.signOut(); }}
        className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} border ${border} px-3 py-2 rounded-xl active:scale-95 transition-transform`}
      >
        Sair
      </button>
    </div>
  );
};

export default CloudSyncCard;
