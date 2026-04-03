import React from 'react';
import { ThemeTokens } from '../../types';

interface IosInstallModalProps {
  isIosDevice: boolean;
  theme: ThemeTokens;
  onClose: () => void;
  onDismiss: () => void;
}

const IosInstallModal: React.FC<IosInstallModalProps> = ({ isIosDevice, theme, onClose, onDismiss }) => {
  const steps = isIosDevice
    ? [
        { icon: '1️⃣', title: 'Toque no botão compartilhar', desc: 'O ícone ↑ na barra inferior do Safari' },
        { icon: '2️⃣', title: 'Role para baixo', desc: 'Procure "Adicionar à Tela de Início"' },
        { icon: '3️⃣', title: 'Toque em "Adicionar"', desc: 'O app aparecerá na sua tela inicial!' },
      ]
    : [
        { icon: '1️⃣', title: 'Toque no menu do Chrome', desc: 'Os três pontinhos ⋮ no canto superior direito' },
        { icon: '2️⃣', title: 'Selecione a opção', desc: '"Adicionar à tela inicial" ou "Instalar app"' },
        { icon: '3️⃣', title: 'Confirme a instalação', desc: 'Pronto! O ícone aparece na sua tela inicial!' },
      ];

  return (
    <div
      className="fixed inset-0 bg-black/90 z-[100] flex items-end justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-5`}
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400">Como instalar</p>
          <button onClick={onClose} className="p-1 active:scale-95" aria-label="Fechar">
            <img src="/fechar.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
          </button>
        </div>

        <div className="space-y-3">
          {steps.map(step => (
            <div key={step.icon} className={`flex items-start gap-3 ${theme.card} border rounded-2xl p-3`}>
              <span className="text-2xl shrink-0">{step.icon}</span>
              <div>
                <p className="font-black text-[11px] uppercase tracking-wide">{step.title}</p>
                <p className={`text-[9px] ${theme.subtext} font-bold mt-0.5`}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => { onClose(); onDismiss(); }}
          className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
        >
          Entendi!
        </button>
      </div>
    </div>
  );
};

export default IosInstallModal;
