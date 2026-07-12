import { useState, useCallback, useEffect, useRef } from 'react';
import { SaldoData, SaldoHistorico } from '../types';
import { formatCpf, isValidCpf } from '../utils';

const API_URL = 'https://sitpass.cj22233333.workers.dev';
const FAVORITO_KEY = 'cade_meu_bau_sitpass_favorito';

export interface CartaoInfo {
  index: number;
  tipoParceria: string;
  cartaoDescricao: string;
  cartaoNumero: string;
}

// Cartão SitPass salvo para uso pessoal — igual a uma "linha favorita",
// sempre atualiza sozinho quando a aba abre, sem precisar digitar o CPF de novo.
export interface CartaoFavorito {
  cpf: string; // somente dígitos
  cartaoIndex: number;
  cartaoNumero: string;
  cartaoDescricao: string;
  tipoParceria: string;
}

export function useSitpass() {
  const [cpfSitpass, setCpfSitpass] = useState('');
  const [cpfError, setCpfError] = useState<string | null>(null);

  // Etapa 1 — lista de cartões
  const [cartoes, setCartoes] = useState<CartaoInfo[]>([]);
  const [cartoesLoading, setCartoesLoading] = useState(false);
  const [cartoesErro, setCartoesErro] = useState<string | null>(null);
  // true quando o CPF consultado só retornou 1 cartão (pula direto pro saldo)
  const [cartaoUnico, setCartaoUnico] = useState(false);

  // Etapa 2 — saldo do cartão escolhido
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);
  const [saldoLoading, setSaldoLoading] = useState(false);
  const [saldoErro, setSaldoErro] = useState<string | null>(null);
  // guarda o índice do último cartão consultado, pra poder favoritar depois
  const ultimoIndexRef = useRef<number>(0);

  const [saldoHistorico, setSaldoHistorico] = useState<SaldoHistorico | null>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_saldo_historico') || 'null'); } catch { return null; }
  });

  // ── Cartão favorito (uso pessoal, persistente) ───────────────────────────
  const [favorito, setFavorito] = useState<CartaoFavorito | null>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITO_KEY) || 'null'); } catch { return null; }
  });
  const [favoritoSaldo, setFavoritoSaldo] = useState<SaldoData | null>(null);
  const [favoritoLoading, setFavoritoLoading] = useState(false);
  const [favoritoErro, setFavoritoErro] = useState<string | null>(null);
  const [favoritoAtualizadoAs, setFavoritoAtualizadoAs] = useState<string | null>(null);

  // ── Etapa 1: busca lista de cartões (função interna, recebe CPF já limpo) ──
  const _consultarCartoesComCpf = useCallback(async (cpfLimpo: string) => {
    setCartoesLoading(true);
    setCartoesErro(null);
    setCartoes([]);
    setSaldoData(null);
    setSaldoErro(null);
    setCpfError(null);
    setCartaoUnico(false);

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

      // Se só tem 1 cartão, já pula direto para o saldo e marca como único
      // (não faz sentido mostrar depois um botão de "consultar de novo")
      if (data.total === 1) {
        setCartaoUnico(true);
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
  }, []); // eslint-disable-line

  const handleCpfChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCpf(e.target.value);
    setCpfSitpass(formatted);
    setCpfError(null);
    // limpa resultados anteriores ao editar CPF
    setCartoes([]);
    setSaldoData(null);
    setSaldoErro(null);
    setCartoesErro(null);
    setCartaoUnico(false);

    const cpfLimpo = formatted.replace(/\D/g, '');
    // Assim que o CPF estiver completo (11 dígitos), valida e já dispara a busca
    if (cpfLimpo.length === 11) {
      if (isValidCpf(cpfLimpo)) {
        _consultarCartoesComCpf(cpfLimpo);
      } else {
        setCpfError('CPF inválido. Verifique os dígitos.');
      }
    }
  }, [_consultarCartoesComCpf]);

  // Mantido como fallback manual (botão "Consultar Saldo" / tecla Enter)
  const consultarCartoes = useCallback(() => {
    const cpfLimpo = cpfSitpass.replace(/\D/g, '');
    if (!cpfLimpo) { setCpfError('Digite seu CPF.'); return; }
    if (cpfLimpo.length !== 11) { setCpfError('CPF incompleto.'); return; }
    if (!isValidCpf(cpfLimpo)) { setCpfError('CPF inválido. Verifique os dígitos.'); return; }
    _consultarCartoesComCpf(cpfLimpo);
  }, [cpfSitpass, _consultarCartoesComCpf]);

  // ── Etapa 2: busca saldo do cartão escolhido ─────────────────────────────
  const _buscarSaldo = useCallback(async (cpfLimpo: string, cartaoIndex: number) => {
    ultimoIndexRef.current = cartaoIndex;
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

  // ── Favorito: salvar / remover / atualizar ───────────────────────────────

  // Marca o cartão consultado agora (saldoData atual) como favorito
  const salvarComoFavorito = useCallback(() => {
    if (!saldoData) return;
    const cpfLimpo = cpfSitpass.replace(/\D/g, '');
    const novo: CartaoFavorito = {
      cpf: cpfLimpo,
      cartaoIndex: ultimoIndexRef.current,
      cartaoNumero: saldoData.cartaoNumero,
      cartaoDescricao: saldoData.cartaoDescricao,
      tipoParceria: saldoData.tipoParceria,
    };
    try { localStorage.setItem(FAVORITO_KEY, JSON.stringify(novo)); } catch { /* */ }
    setFavorito(novo);
    setFavoritoSaldo(saldoData);
    setFavoritoErro(null);
    setFavoritoAtualizadoAs(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  }, [saldoData, cpfSitpass]);

  const removerFavorito = useCallback(() => {
    try { localStorage.removeItem(FAVORITO_KEY); } catch { /* */ }
    setFavorito(null);
    setFavoritoSaldo(null);
    setFavoritoErro(null);
    setFavoritoAtualizadoAs(null);
  }, []);

  // Busca o saldo atualizado do cartão favorito salvo
  const atualizarFavorito = useCallback(async (fav?: CartaoFavorito) => {
    const alvo = fav ?? favorito;
    if (!alvo) return;

    setFavoritoLoading(true);
    setFavoritoErro(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${API_URL}/saldo?cpf=${alvo.cpf}&cartaoIndex=${alvo.cartaoIndex}`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();

      if (!res.ok) {
        setFavoritoErro(data.erro ?? 'Erro ao atualizar cartão favorito.');
        return;
      }

      setFavoritoSaldo(data);
      setFavoritoAtualizadoAs(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setFavoritoErro(isAbort ? 'Tempo esgotado. Tente novamente.' : 'Sem conexão. Tente novamente.');
    } finally {
      setFavoritoLoading(false);
    }
  }, [favorito]);

  // Assim que a aba/app abre, se já existe cartão favorito salvo, atualiza sozinho
  useEffect(() => {
    if (favorito) atualizarFavorito(favorito);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    cpfSitpass,
    setCpfSitpass,
    saldoHistorico,
    cpfError,
    // etapa 1
    cartoes,
    cartoesLoading,
    cartoesErro,
    cartaoUnico,
    consultarSaldo: consultarCartoes, // mantém mesmo nome para o botão não mudar
    // etapa 2
    saldoData,
    saldoLoading,
    saldoErro,
    selecionarCartao,
    handleCpfChange,
    // favorito
    favorito,
    favoritoSaldo,
    favoritoLoading,
    favoritoErro,
    favoritoAtualizadoAs,
    salvarComoFavorito,
    removerFavorito,
    atualizarFavorito,
  };
}
