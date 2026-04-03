import React from 'react';
import { ThemeTokens } from '../../types';

interface AlertModalProps {
  lineKey: string;
  notifPermission: NotificationPermission;
  theme: ThemeTokens;
  onClose: () => void;
  onSetAlert: (lineKey: string, minutes: number) => void;
}

const AlertModal: React.FC<AlertModalProps> = ({
  lineKey, notifPermission, theme, onClose, onSetAlert,
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
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400">
          <img src="/alert_on.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain', display: 'inline', marginRight: 6 }} />
          Alertar quando chegar
        </p>
        <button onClick={onClose} className="p-1 active:scale-95" aria-label="Fechar">
          <img src="/fechar.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
        </button>
      </div>

      <p className={`text-[9px] font-bold ${theme.subtext} uppercase tracking-widest`}>
        Notificar quando o baú estiver a:
      </p>

      <div className="grid grid-cols-2 gap-3">
        {[2, 5, 10, 15].map(min => (
          <button
            key={min}
            onClick={() => onSetAlert(lineKey, min)}
            className={`${theme.card} border rounded-2xl py-4 font-black text-center active:scale-95 transition-transform hover:border-yellow-400`}
          >
            <span className="block text-2xl font-black text-yellow-400">{min}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest ${theme.subtext}`}>minutos</span>
          </button>
        ))}
      </div>

      {notifPermission === 'denied' && (
        <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest text-center">
          Notificações bloqueadas. Ative nas configurações do navegador.
        </p>
      )}
    </div>
  </div>
);

export default AlertModal;
