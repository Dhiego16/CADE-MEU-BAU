import React from 'react';
import { ThemeTokens } from '../../types';

interface NicknameModalProps {
  nicknameInput: string;
  lightTheme: boolean;
  theme: ThemeTokens;
  onClose: () => void;
  onSave: () => void;
  onRemove: () => void;
  onChange: (val: string) => void;
}

const NicknameModal: React.FC<NicknameModalProps> = ({
  nicknameInput, lightTheme, theme, onClose, onSave, onRemove, onChange,
}) => (
  <div
    className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center p-4"
    onClick={onClose}
  >
    <div
      className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-4`}
      onClick={e => e.stopPropagation()}
      style={{ animation: 'slideUp 0.25s ease-out' }}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">
        <img src="/editar.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} /> Apelido da Linha
      </p>

      <input
        id="nickname-input"
        type="text"
        placeholder="Ex: Meu trabalho, Casa da mãe..."
        value={nicknameInput}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSave()}
        maxLength={30}
        className={`w-full ${theme.input} border rounded-2xl px-4 py-4 font-black outline-none focus:border-yellow-400 transition-all text-base`}
      />

      <div className="flex gap-3">
        <button
          onClick={() => { onChange(''); onSave(); }}
          className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border ${theme.subtext} ${lightTheme ? 'border-gray-300' : 'border-white/10'}`}
        >
          Remover apelido
        </button>
        <button
          onClick={onSave}
          className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
        >
          Salvar
        </button>
      </div>
    </div>
  </div>
);

export default NicknameModal;
