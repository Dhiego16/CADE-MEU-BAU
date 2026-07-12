import React, { useState } from 'react';
import { FavoriteItem, RoutineItem, ThemeTokens } from '../types';
import { haptic } from '../utils';
import RoutineModal from './modals/RoutineModal';

interface RoutineManagerProps {
  routines: RoutineItem[];
  favorites: FavoriteItem[];
  theme: ThemeTokens;
  lightTheme: boolean;
  onAdd: (routine: Omit<RoutineItem, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<Omit<RoutineItem, 'id'>>) => void;
  onRemove: (id: string) => void;
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const formatDays = (days: number[]): string => {
  const sorted = [...days].sort();
  if (sorted.length === 5 && [1, 2, 3, 4, 5].every(d => sorted.includes(d))) return 'Seg–Sex';
  if (sorted.length === 7) return 'Todos os dias';
  return sorted.map(d => DAY_LABELS[d]).join(', ');
};

const RoutineManager: React.FC<RoutineManagerProps> = ({
  routines, favorites, theme, lightTheme, onAdd, onUpdate, onRemove,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RoutineItem | null>(null);

  const openNew = () => { setEditingRoutine(null); setShowModal(true); haptic(30); };
  const openEdit = (r: RoutineItem) => { setEditingRoutine(r); setShowModal(true); haptic(30); };

  const handleSave = (data: Omit<RoutineItem, 'id'>) => {
    if (editingRoutine) onUpdate(editingRoutine.id, data);
    else onAdd(data);
    setShowModal(false);
    haptic([50, 30, 80]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <h2 className={`text-[10px] font-black uppercase tracking-[0.5em] ${theme.subtext} flex items-center gap-2`}>
          🕒 Meus Trajetos
        </h2>
        <button
          onClick={openNew}
          className="text-[8px] font-black uppercase tracking-widest text-yellow-400 border border-yellow-400/30 px-3 py-2 rounded-xl active:scale-95 transition-transform"
        >
          + Novo
        </button>
      </div>

      {routines.length === 0 ? (
        <div className={`${theme.card} border rounded-2xl px-4 py-4`}>
          <p className={`text-[9px] font-bold ${theme.subtext} uppercase tracking-widest leading-relaxed`}>
            Crie um trajeto (ex: "Casa → Trabalho") a partir de uma linha favorita e o app já mostra a previsão assim que você abrir, no horário certo.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {routines.map(r => (
            <div
              key={r.id}
              className={`${theme.card} border rounded-2xl px-4 py-3 flex items-center gap-3`}
            >
              <div className="flex-1 min-w-0" onClick={() => openEdit(r)}>
                <p className={`font-black text-[12px] truncate ${theme.destText}`}>{r.label}</p>
                <p className={`text-[8px] font-bold ${theme.subtext} uppercase tracking-widest mt-0.5`}>
                  Linha {r.lineNumber} · Ponto {r.stopId} · {formatDays(r.days)} · {r.startTime}–{r.endTime}
                </p>
              </div>
              <button
                onClick={() => openEdit(r)}
                className={`text-[9px] font-black uppercase ${theme.subtext} opacity-60 active:opacity-100 shrink-0`}
                aria-label="Editar trajeto"
              >
                <img src="/editar.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              </button>
              <button
                onClick={() => { onRemove(r.id); haptic(50); }}
                className="text-red-400 opacity-60 active:opacity-100 shrink-0 text-lg leading-none"
                aria-label="Excluir trajeto"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <RoutineModal
          favorites={favorites}
          editingRoutine={editingRoutine}
          theme={theme}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

export default RoutineManager;
