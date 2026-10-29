import React, { useEffect, useState } from 'react';
import { ThemeTokens } from '../types';
import { REFRESH_INTERVAL } from '../utils';

interface UpdatedAgoProps {
  /** timestamp (ms) da última leitura bem-sucedida da previsão */
  updatedAt: number | null;
  theme: ThemeTokens;
  /** true quando a última tentativa de atualizar falhou */
  failing?: boolean;
}

const WARN_AFTER_S = 60;
const DANGER_AFTER_S = 120;

function formatAge(s: number): string {
  if (s < 5) return 'agora mesmo';
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 5) return r > 0 ? `há ${m} min ${r} s` : `há ${m} min`;
  return `há ${m} min`;
}

const UpdatedAgo: React.FC<UpdatedAgoProps> = ({ updatedAt, theme, failing = false }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (updatedAt === null) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [updatedAt]);

  if (updatedAt === null) return null;

  const age = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  const danger = age >= DANGER_AFTER_S || (failing && age >= REFRESH_INTERVAL * 2);
  const warn = !danger && (age >= WARN_AFTER_S || failing);

  const color = danger ? 'text-red-400' : warn ? 'text-yellow-400' : theme.subtext;
  const icon = danger ? '⚠️' : warn ? '⏱' : '●';

  return (
    <p
      className={`text-[8px] font-black uppercase tracking-widest px-2 flex items-center gap-1.5 ${color} ${danger || warn ? '' : 'opacity-60'}`}
      aria-live="off"
    >
      <span className={!danger && !warn ? 'text-emerald-500' : ''}>{icon}</span>
      <span>
        Previsão atualizada {formatAge(age)}
        {danger ? ' — pode estar desatualizada' : ''}
      </span>
    </p>
  );
};

export default UpdatedAgo;
