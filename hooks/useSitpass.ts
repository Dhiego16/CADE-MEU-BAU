import { useState, useCallback } from 'react';
import { SaldoData, SaldoHistorico } from '../types';
import { formatCpf, isValidCpf } from '../utils';

export function useSitpass() {
  const [cpfSitpass, setCpfSitpass] = useState('');
  const [saldoHistorico, setSaldoHistorico] = useState<SaldoHistorico | null>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_saldo_historico') || 'null'); } catch { return null; }
  });
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);
  const [saldoLoading, setSaldoLoading] = useState(false);
  const [saldoErro, setSaldoErro] = useState<string | null>(null);

  const handleCpfChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCpf(e.target.value);
    setCpfSitpass(formatted);
    setCpfError(null);
  }, []);

  const consultarSaldo = useCallback(async () => {
    const cpfLimpo = cpfSitpass.replace(/\D/g, '');
    if (!cpfLimpo) { setCpfError('Digite seu CPF.'); return; }
    if (cpfLimpo.length !== 11) { setCpfError('CPF incompleto.'); return; }
    if (!isValidCpf(cpfLimpo)) { setCpfError('CPF inválido. Verifique os dígitos.'); return; }

    setSaldoLoading(true);
    setSaldoErro(null);
    setSaldoData(null);
    setCpfError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch(`https://sitpass.cj22233333.workers.dev/saldo?cpf=${cpfLimpo}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.ok) {
        setSaldoData(data);
        const agora = new Date();
        const historico: SaldoHistorico = {
          saldo_formatado: data.saldo_formatado,
          cartaoDescricao: data.cartaoDescricao,
          data: agora.toLocaleDateString('pt-BR'),
          hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        };
        setSaldoHistorico(historico);
        localStorage.setItem('cade_meu_bau_saldo_historico', JSON.stringify(historico));
      } else {
        setSaldoErro(data.erro ?? 'Erro ao consultar saldo.');
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setSaldoErro(isAbort ? 'Tempo esgotado. Tente novamente.' : 'Sem conexão. Tente novamente.');
    } finally {
      setSaldoLoading(false);
    }
  }, [cpfSitpass]);

  return {
    cpfSitpass,
    setCpfSitpass,
    saldoHistorico,
    cpfError,
    saldoData,
    saldoLoading,
    saldoErro,
    handleCpfChange,
    consultarSaldo,
  };
}
