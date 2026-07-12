import React, { useState } from 'react';
import { FavoriteItem, RoutineItem, ThemeTokens } from '../../types';

interface RoutineModalProps {
  favorites: FavoriteItem[];
  editingRoutine: RoutineItem | null;
  theme: ThemeTokens;
  onClose: () => void;
  onSave: (routine: Omit<RoutineItem, 'id'>) => void;
}

const DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

const WEEKDAYS = [1, 2, 3, 4, 5];

const RoutineModal: React.FC<RoutineModalProps> = ({ favorites, editingRoutine, theme, onClose, onSave }) => {
  const initialFavKey = editingRoutine
    ? `${editingRoutine.stopId}::${editingRoutine.lineNumber}`
    : (favorites[0] ? `${favorites[0].stopId}::${favorites[0].lineNumber}` : '');

  const [favKey, setFavKey] = useState(initialFavKey);
  const [label, setLabel] = useState(editingRoutine?.label ?? '');
  const [days, setDays] = useState<number[]>(editingRoutine?.days ?? WEEKDAYS);
  const [startTime, setStartTime] = useState(editingRoutine?.startTime ?? '06:30');
  const [endTime, setEndTime] = useState(editingRoutine?.endTime ?? '08:00');

  const toggleDay = (d: number) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  const selectedFav = favorites.find(f => `${f.stopId}::${f.lineNumber}` === favKey);
  const canSave = !!selectedFav && label.trim().length > 0 && days.length > 0 && startTime < endTime;

  const handleSave = () => {
    if (!selectedFav || !canSave) return;
    onSave({
      label: label.trim(),
      stopId: selectedFav.stopId,
      lineNumber: selectedFav.lineNumber,
      destination: selectedFav.destination,
      days,
      startTime,
      endTime,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center p-4" onClick={onClose}>
      <div
        className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-5 max-h-[85vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.25s ease-out' }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400">
            🕒 {editingRoutine ? 'Editar trajeto' : 'Novo trajeto'}
          </p>
          <button onClick={onClose} className="p-1 active:scale-95" aria-label="Fechar">
            <img src="/fechar.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
          </button>
        </div>

        {favorites.length === 0 ? (
          <p className={`text-[10px] font-bold ${theme.subtext} uppercase tracking-widest leading-relaxed`}>
            Você precisa favoritar uma linha primeiro (na aba Busca, toque na estrela) antes de criar um trajeto.
          </p>
        ) : (
          <>
            <div>
              <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2 px-1`}>
                Qual linha favorita?
              </p>
              <select
                value={favKey}
                onChange={e => setFavKey(e.target.value)}
                className={`w-full ${theme.input} border rounded-2xl px-4 py-3 font-black outline-none focus:border-yellow-400 transition-all text-sm`}
              >
                {favorites.map(f => (
                  <option key={`${f.stopId}::${f.lineNumber}`} value={`${f.stopId}::${f.lineNumber}`}>
                    Linha {f.lineNumber} — Ponto {f.stopId} {f.nickname ? `(${f.nickname})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2 px-1`}>
                Nome do trajeto
              </p>
              <input
                type="text"
                placeholder="Ex: Casa → Trabalho"
                value={label}
                onChange={e => setLabel(e.target.value)}
                maxLength={30}
                className={`w-full ${theme.input} border rounded-2xl px-4 py-3 font-black outline-none focus:border-yellow-400 transition-all text-sm`}
              />
            </div>

            <div>
              <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2 px-1`}>
                Dias da semana
              </p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border active:scale-95 transition-all ${
                      days.includes(d.value)
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : `${theme.card} ${theme.subtext} border-white/10`
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2 px-1`}>
                  A partir de
                </p>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className={`w-full ${theme.input} border rounded-2xl px-4 py-3 font-black outline-none focus:border-yellow-400 transition-all text-sm`}
                />
              </div>
              <div className="flex-1">
                <p className={`text-[8px] font-black ${theme.subtext} uppercase tracking-widest mb-2 px-1`}>
                  Até
                </p>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className={`w-full ${theme.input} border rounded-2xl px-4 py-3 font-black outline-none focus:border-yellow-400 transition-all text-sm`}
                />
              </div>
            </div>
            {startTime >= endTime && (
              <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest">
                O horário final precisa ser depois do inicial.
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={!canSave}
              className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] disabled:opacity-40 active:scale-95 transition-all"
            >
              Salvar trajeto
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default RoutineModal;
