import { useState, useCallback } from 'react';
import { SaldoData, SaldoHistorico } from '../types';
import { formatCpf, isValidCpf } from '../utils';

const API_URL = 'https://sitpass.cj22233333.workers.dev';

export interface CartaoInfo {
  index: number;
  tipoParceria: string;
  cartaoDescricao: string;
  cartaoNumero: string;
}

export function useSitpass() {
  const [cpfSitpass, setCpfSitpass] = useState('');
  const [cpfError, setCpfError] = useState<string | null>(null);

  // Etapa 1 — lista de cartões
  const [cartoes, setCartoes] = useState<CartaoInfo[]>([]);
  const [cartoesLoading, setCartoesLoading] = useState(false);
  const [cartoesErro, setCartoesErro] = useState<string | null>(null);

  // Etapa 2 — saldo do cartão escolhido
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);
  const [saldoLoading, setSaldoLoading] = useState(false);
  const [saldoErro, setSaldoErro] = useState<string | null>(null);

  const [saldoHistorico, setSaldoHistorico] = useState<SaldoHistorico | null>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_saldo_historico') || 'null'); } catch { return null; }
  });

  const handleCpfChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCpf(e.target.value);
    setCpfSitpass(formatted);
    setCpfError(null);
    // limpa resultados anteriores ao editar CPF
    setCartoes([]);
    setSaldoData(null);
    setSaldoErro(null);
    setCartoesErro(null);
  }, []);

  // ── Etapa 1: busca lista de cartões ──────────────────────────────────────
  const consultarCartoes = useCallback(async () => {
    const cpfLimpo = cpfSitpass.replace(/\D/g, '');
    if (!cpfLimpo) { setCpfError('Digite seu CPF.'); return; }
    if (cpfLimpo.length !== 11) { setCpfError('CPF incompleto.'); return; }
    if (!isValidCpf(cpfLimpo)) { setCpfError('CPF inválido. Verifique os dígitos.'); return; }

    setCartoesLoading(true);
    setCartoesErro(null);
    setCartoes([]);
    setSaldoData(null);
    setSaldoErro(null);
    setCpfError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${API_URL}/saldo?cpf=${cpfLimpo}`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();

      if (!res.ok) {
        setCartoesErro(data.erro ?? 'Erro ao consultar cartões.');
        return;
      }

      // Se só tem 1 cartão, já pula direto para o saldo
      if (data.total === 1) {
        await _buscarSaldo(cpfLimpo, 0);
      } else {
        setCartoes(data.cartoes);
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setCartoesErro(isAbort ? 'Tempo esgotado. Tente novamente.' : 'Sem conexão. Tente novamente.');
    } finally {
      setCartoesLoading(false);
    }
  }, [cpfSitpass]); // eslint-disable-line

  // ── Etapa 2: busca saldo do cartão escolhido ─────────────────────────────
  const _buscarSaldo = useCallback(async (cpfLimpo: string, cartaoIndex: number) => {
    setSaldoLoading(true);
    setSaldoErro(null);
    setSaldoData(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${API_URL}/saldo?cpf=${cpfLimpo}&cartaoIndex=${cartaoIndex}`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();

      if (!res.ok) {
        setSaldoErro(data.erro ?? 'Erro ao consultar saldo.');
        return;
      }

      setSaldoData(data);
      setCartoes([]); // limpa seleção

      const agora = new Date();
      const historico: SaldoHistorico = {
        saldo_formatado: data.saldo_formatado,
        cartaoDescricao: data.cartaoDescricao,
        data: agora.toLocaleDateString('pt-BR'),
        hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      setSaldoHistorico(historico);
      localStorage.setItem('cade_meu_bau_saldo_historico', JSON.stringify(historico));
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setSaldoErro(isAbort ? 'Tempo esgotado. Tente novamente.' : 'Sem conexão. Tente novamente.');
    } finally {
      setSaldoLoading(false);
    }
  }, []);

  // chamado quando o usuário toca num cartão da lista
  const selecionarCartao = useCallback((index: number) => {
    const cpfLimpo = cpfSitpass.replace(/\D/g, '');
    _buscarSaldo(cpfLimpo, index);
  }, [cpfSitpass, _buscarSaldo]);

  return {
    cpfSitpass,
    setCpfSitpass,
    saldoHistorico,
    cpfError,
    // etapa 1
    cartoes,
    cartoesLoading,
    cartoesErro,
    consultarSaldo: consultarCartoes, // mantém mesmo nome para o botão não mudar
    // etapa 2
    saldoData,
    saldoLoading,
    saldoErro,
    selecionarCartao,
    handleCpfChange,
  };
}
