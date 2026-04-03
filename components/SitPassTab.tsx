import React from 'react';
import { ThemeTokens } from '../../types';
import { haptic } from '../../utils';
import { ICONS } from '../../utils/icons';

// Re-use the hook's return shape via duck-typing to avoid circular imports
interface SitpassHook {
  cpfSitpass: string;
  cpfError: string | null;
  cartoes: Array<{ index: number; tipoParceria: string; cartaoDescricao: string; cartaoNumero: string }>;
  cartoesLoading: boolean;
  cartoesErro: string | null;
  saldoData: {
    cpf: string;
    tipoParceria: string;
    cartaoNumero: string;
    cartaoDescricao: string;
    tipo_saldo: 'monetario' | 'viagens';
    saldo?: string;
    saldo_formatado: string;
    viagens_usadas?: number;
    viagens_total?: number;
    viagens_restantes?: number;
  } | null;
  saldoLoading: boolean;
  saldoErro: string | null;
  consultarSaldo: () => void;
  selecionarCartao: (index: number) => void;
  handleCpfChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface SitPassTabProps {
  sitpass: SitpassHook;
  lightTheme: boolean;
  theme: ThemeTokens;
}

const formatarDescricaoCartao = (descricao: string, tipoParceria: string) =>
  tipoParceria === 'ESTUDANTE' ? 'Passe Livre Estudantil' : descricao;

const iconePorTipo = (tipoParceria: string) => {
  if (tipoParceria === 'ESTUDANTE') return ICONS.cartaoEstudante;
  if (tipoParceria === 'PLT') return ICONS.cartaoTrabalhador;
  return ICONS.sitpass;
};

const SitPassTab: React.FC<SitPassTabProps> = ({ sitpass, lightTheme, theme }) => (
  <div className="page-enter space-y-5">
    {/* CPF input */}
    <div className={`${theme.inputWrap} border p-5 rounded-[2.5rem] shadow-2xl space-y-4`}>
      <div className="relative">
        <span className={`absolute left-4 top-2 text-[8px] font-black ${theme.subtext} uppercase pointer-events-none`}>CPF</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={sitpass.cpfSitpass}
          onChange={sitpass.handleCpfChange}
          onKeyDown={e => e.key === 'Enter' && sitpass.consultarSaldo()}
          maxLength={14}
          className={`w-full ${theme.input} border rounded-2xl px-4 pt-6 pb-3 font-black outline-none transition-all placeholder:text-slate-700 text-xl ${sitpass.cpfError ? 'border-red-500' : 'focus:border-yellow-400'}`}
        />
        {sitpass.cpfError && (
          <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mt-2 px-1">{sitpass.cpfError}</p>
        )}
      </div>
      <button
        onClick={sitpass.consultarSaldo}
        disabled={sitpass.cartoesLoading || sitpass.saldoLoading}
        className="w-full bg-yellow-400 text-black py-5 rounded-2xl font-black btn-active uppercase text-sm tracking-[0.2em] shadow-[0_10px_30px_rgba(251,191,36,0.3)] disabled:opacity-50 transition-all"
      >
        {sitpass.cartoesLoading ? 'Buscando cartões...' : sitpass.saldoLoading ? 'Consultando...' : 'Consultar Saldo'}
      </button>
    </div>

    {/* Erro cartões */}
    {sitpass.cartoesErro && (
      <div className="border border-red-500/30 bg-red-500/10 text-red-400 p-4 rounded-2xl flex items-start gap-3">
        <img src="/alerta.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />
        <div>
          <p className="font-black text-[11px] uppercase tracking-widest">Erro</p>
          <p className="text-[9px] font-bold mt-1 opacity-80">{sitpass.cartoesErro}</p>
        </div>
      </div>
    )}

    {/* Lista de cartões */}
    {sitpass.cartoes.length > 1 && (
      <div className="space-y-3" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <p className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext} px-1`}>Selecione o cartão</p>
        {sitpass.cartoes.map(cartao => (
          <button
            key={cartao.index}
            onClick={() => sitpass.selecionarCartao(cartao.index)}
            disabled={sitpass.saldoLoading}
            className={`w-full ${theme.card} border rounded-[2rem] p-5 flex items-center gap-4 active:scale-95 transition-all hover:border-yellow-400/50 disabled:opacity-50`}
          >
            <img src={iconePorTipo(cartao.tipoParceria)} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 8, flexShrink: 0 }} />
            <div className="flex-1 text-left min-w-0">
              <p className="font-black text-sm uppercase text-yellow-400 truncate">
                {formatarDescricaoCartao(cartao.cartaoDescricao, cartao.tipoParceria)}
              </p>
              <p className={`text-[9px] font-bold ${theme.subtext} mt-0.5`}>Nº {cartao.cartaoNumero}</p>
              <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} opacity-50 mt-0.5`}>{cartao.tipoParceria}</p>
            </div>
            <span className="text-yellow-400 font-black text-lg shrink-0">›</span>
          </button>
        ))}
      </div>
    )}

    {/* Loading saldo */}
    {sitpass.saldoLoading && (
      <div className="flex items-center justify-center gap-3 py-8">
        <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        <p className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Consultando saldo...</p>
      </div>
    )}

    {/* Erro saldo */}
    {sitpass.saldoErro && (
      <div className="border border-red-500/30 bg-red-500/10 text-red-400 p-4 rounded-2xl flex items-start gap-3">
        <img src="/alerta.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />
        <div>
          <p className="font-black text-[11px] uppercase tracking-widest">Erro</p>
          <p className="text-[9px] font-bold mt-1 opacity-80">{sitpass.saldoErro}</p>
        </div>
      </div>
    )}

    {/* Resultado saldo */}
    {sitpass.saldoData && !sitpass.saldoLoading && (
      <div className="border border-yellow-400/20 bg-yellow-400/5 rounded-[2.5rem] p-6 space-y-4" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className="flex items-center gap-3">
          <img src={iconePorTipo(sitpass.saldoData.tipoParceria)} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 8 }} />
          <div>
            <p className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext}`}>{sitpass.saldoData.tipoParceria}</p>
            <p className={`font-black text-sm uppercase ${theme.saldoText}`}>
              {formatarDescricaoCartao(sitpass.saldoData.cartaoDescricao, sitpass.saldoData.tipoParceria)}
            </p>
            <p className={`text-[9px] font-bold ${theme.subtext}`}>Nº {sitpass.saldoData.cartaoNumero}</p>
          </div>
        </div>

        <div className={`${theme.divider} h-px w-full`} />

        {sitpass.saldoData.tipo_saldo === 'viagens' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Viagens restantes</span>
              <span className="text-4xl font-black text-yellow-400">
                {sitpass.saldoData.viagens_restantes}
                <span className={`text-lg font-black ${theme.subtext} opacity-50`}>/{sitpass.saldoData.viagens_total}</span>
              </span>
            </div>
            <div className={`w-full h-2 rounded-full ${lightTheme ? 'bg-gray-200' : 'bg-white/10'}`}>
              <div
                className="h-2 rounded-full bg-yellow-400 transition-all duration-500"
                style={{ width: `${((sitpass.saldoData.viagens_restantes ?? 0) / (sitpass.saldoData.viagens_total ?? 1)) * 100}%` }}
              />
            </div>
            {(sitpass.saldoData.viagens_restantes ?? 0) <= 5 && (
              <div className="border border-red-500/30 bg-red-500/10 rounded-2xl px-4 py-3 flex items-start gap-2">
                <img src="/alerta.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0, marginTop: 2 }} />
                <p className="text-[9px] font-bold leading-relaxed text-red-400">Poucas viagens restantes. Recarregue seu cartão.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-widest ${theme.subtext}`}>Saldo disponível</span>
              <span className="text-4xl font-black text-yellow-400">{sitpass.saldoData.saldo_formatado}</span>
            </div>
            {(() => {
              const n = parseFloat((sitpass.saldoData!.saldo ?? '0').replace('.', '').replace(',', '.'));
              if (n < 2.15) return (
                <div className="border border-red-500/30 bg-red-500/10 rounded-2xl px-4 py-3 flex items-start gap-2">
                  <img src="/alerta.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0, marginTop: 2 }} />
                  <p className="text-[9px] font-bold leading-relaxed text-red-400">Saldo insuficiente para qualquer passagem. Recarregue antes de embarcar.</p>
                </div>
              );
              if (n < 4.30) return (
                <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-2xl px-4 py-3 flex items-start gap-2">
                  <img src="/alerta.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0, marginTop: 2 }} />
                  <p className="text-[9px] font-bold leading-relaxed text-yellow-400">Saldo insuficiente para a tarifa inteira (R$ 4,30). Recarregue antes de embarcar.</p>
                </div>
              );
              return null;
            })()}
          </div>
        )}

        <div className={`border ${lightTheme ? 'border-gray-200 bg-gray-50' : 'border-white/5 bg-black/20'} rounded-2xl px-4 py-3 flex items-start gap-2`}>
          <img src="/informacao.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0, marginTop: 2 }} />
          <p className={`text-[9px] font-bold leading-relaxed ${theme.subtext}`}>
            O saldo não é em tempo real — é o último valor registrado no sistema do SitPass.
          </p>
        </div>

        <button
          onClick={sitpass.consultarSaldo}
          className={`w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border ${lightTheme ? 'border-gray-300 text-gray-500' : 'border-white/10 text-slate-500'} active:scale-95 transition-all`}
        >
          ← Consultar outro cartão
        </button>
      </div>
    )}

    {/* Empty state */}
    {!sitpass.saldoData && !sitpass.saldoErro && !sitpass.cartoesLoading && !sitpass.saldoLoading && sitpass.cartoes.length === 0 && !sitpass.cartoesErro && (
      <div className="py-16 text-center opacity-10 flex flex-col items-center">
        <img src="/sitpass.png" alt="" className="mb-6" style={{ width: 100, height: 100, objectFit: 'contain', opacity: 0.2, borderRadius: 12 }} />
        <p className={`font-black text-[12px] uppercase tracking-[0.5em] px-10 leading-relaxed ${theme.subtext}`}>
          Digite seu CPF para consultar o saldo
        </p>
      </div>
    )}

    <a
      href="https://forms.gle/JwtHNRw7pjaZtfV19"
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => haptic(30)}
      className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl border ${lightTheme ? 'border-gray-200 text-gray-400' : 'border-white/5 text-slate-600'} transition-all font-black text-[10px] uppercase tracking-widest`}
    >
      💬 Algo errado? Me avisa
    </a>
  </div>
);

export default SitPassTab;
