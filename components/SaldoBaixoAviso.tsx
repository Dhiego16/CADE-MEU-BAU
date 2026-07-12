import React from 'react';
import { ThemeTokens } from '../types';
import { TARIFA_INTEIRA, parseSaldoMonetario } from '../utils/sitpass';

interface FavoritoSaldoLike {
  tipo_saldo: 'monetario' | 'viagens';
  saldo?: string;
  saldo_formatado: string;
  viagens_restantes?: number;
}

interface SaldoBaixoAvisoProps {
  favoritoSaldo: FavoritoSaldoLike | null;
  theme: ThemeTokens;
}

// Aviso de saldo baixo do cartão SitPass favorito — usado na busca de horários
// e na aba de favoritos, sempre com base na tarifa inteira (não a meia-tarifa).
const SaldoBaixoAviso: React.FC<SaldoBaixoAvisoProps> = ({ favoritoSaldo, theme }) => {
  if (!favoritoSaldo) return null;

  const abaixoDaTarifa = favoritoSaldo.tipo_saldo === 'monetario'
    ? parseSaldoMonetario(favoritoSaldo.saldo) < TARIFA_INTEIRA
    : (favoritoSaldo.viagens_restantes ?? 0) < 1;

  if (!abaixoDaTarifa) return null;

  return (
    <div
      className="border border-red-500/30 bg-red-500/10 rounded-2xl px-4 py-3 flex items-start gap-3"
      style={{ animation: 'slideUp 0.3s ease-out' }}
    >
      <img src="/alerta.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0, marginTop: 1 }} />
      <div>
        <p className="font-black text-[10px] uppercase tracking-widest text-red-400">Saldo do SitPass baixo</p>
        <p className={`text-[9px] font-bold mt-1 leading-relaxed text-red-400/90`}>
          {favoritoSaldo.tipo_saldo === 'monetario'
            ? `Seu cartão está com ${favoritoSaldo.saldo_formatado}, abaixo da tarifa inteira (R$ ${TARIFA_INTEIRA.toFixed(2).replace('.', ',')}). Recarregue antes de embarcar.`
            : 'Seu cartão está sem viagens disponíveis. Recarregue antes de embarcar.'}
        </p>
        <p className={`text-[8px] font-bold mt-1 ${theme.subtext} opacity-50 uppercase tracking-widest`}>
          Baseado no seu cartão SitPass favorito
        </p>
      </div>
    </div>
  );
};

export default SaldoBaixoAviso;
