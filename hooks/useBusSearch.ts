import { useState, useCallback, useRef } from 'react';
import { BusLine, FavoriteItem, SearchResult } from '../types';
import { normalizeTime, REFRESH_INTERVAL, MAX_HISTORY, BASE_URL } from '../utils';

export function useBusSearch() {
  const [busLines, setBusLines] = useState<BusLine[]>([]);
  const [favoriteBusLines, setFavoriteBusLines] = useState<BusLine[]>([]);
  const [stopId, setStopId] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [staleData, setStaleData] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_search_history') || '[]'); } catch { return []; }
  });
  const [liveLineMap, setLiveLineMap] = useState<Record<string, boolean>>({});
  const [inactiveStops, setInactiveStops] = useState<Set<string>>(new Set());

  const isSearchingRef = useRef(false);
  const isFavSearchingRef = useRef(false);

  // ─── AbortController para cancelar fetches de realtime stale ─────────────
  // Mantemos uma ref com o controller da última rodada de buscas de realtime.
  // Ao iniciar uma nova busca principal, abortamos a rodada anterior para evitar
  // que Promises antigas sobrescrevam o liveLineMap com dados desatualizados.
  const realtimeAbortRef = useRef<AbortController | null>(null);

  // ─── Geração de busca — impede que fetches de rodadas antigas gravem estado ─
  // Cada chamada a handleSearch incrementa essa geração. Os callbacks assíncronos
  // comparam a geração no momento em que foram criados com a geração atual; se
  // diferirem, a busca foi substituída e os resultados são descartados.
  const searchGenerationRef = useRef(0);

  const performSearch = useCallback(async (sId: string, lFilter: string): Promise<SearchResult> => {
    if (!sId) return { lines: [], error: 'invalid_stop' };
    try {
      let url = `${BASE_URL}?ponto=${sId.trim()}`;
      if (lFilter.trim()) url += `&linha=${lFilter.trim()}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.status === 404) return { lines: [], error: 'not_found' };
      if (!res.ok) return { lines: [], error: 'offline' };

      const data = await res.json();

      if (data?.horarios && Array.isArray(data.horarios)) {
        if (data.horarios.length === 0) return { lines: [], error: lFilter ? 'no_lines' : 'not_found' };
        return {
          lines: data.horarios.map((item: Record<string, unknown>, index: number) => {
            const rawLinha = String(item.linha ?? '').trim();
            const formattedLinha = rawLinha.length === 1 ? `NS${rawLinha}` : rawLinha;
            return {
              id: `api-${sId}-${item.linha}-${index}`,
              number: formattedLinha,
              name: formattedLinha,
              origin: '',
              destination: String(item.destino ?? 'Destino não informado'),
              schedules: [],
              frequencyMinutes: 0,
              status: 'Normal' as const,
              nextArrival: normalizeTime(item.proximo ?? item.previsao),
              subsequentArrival: normalizeTime(item.seguinte),
              stopSource: sId.padStart(5, '0'),
            };
          })
        };
      }
      return { lines: [], error: 'not_found' };
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return { lines: [], error: isAbort ? 'offline' : 'offline' };
    }
  }, []);

  const addToHistory = useCallback((id: string) => {
    if (!id.trim()) return;
    setSearchHistory(prev => {
      const next = [id, ...prev.filter(h => h !== id)].slice(0, MAX_HISTORY);
      localStorage.setItem('cade_meu_bau_search_history', JSON.stringify(next));
      return next;
    });
  }, []);

  // ─── Merge inteligente: atualiza apenas linhas que mudaram ───────────────
  const mergeLines = useCallback((prev: BusLine[], next: BusLine[]): BusLine[] => {
    if (prev.length !== next.length) return next;
    const prevMap = new Map(prev.map(l => [`${l.stopSource}::${l.number}`, l]));
    let changed = false;
    const merged = next.map(newLine => {
      const key = `${newLine.stopSource}::${newLine.number}`;
      const oldLine = prevMap.get(key);
      if (!oldLine) { changed = true; return newLine; }
      if (
        oldLine.nextArrival === newLine.nextArrival &&
        oldLine.subsequentArrival === newLine.subsequentArrival &&
        oldLine.destination === newLine.destination
      ) {
        return oldLine;
      }
      changed = true;
      return { ...oldLine, nextArrival: newLine.nextArrival, subsequentArrival: newLine.subsequentArrival };
    });
    return changed ? merged : prev;
  }, []);

  const handleSearch = useCallback(async (
    forcedId?: string,
    forcedFilter?: string,
  ) => {
    const idToSearch = forcedId ?? stopId;
    if (!idToSearch || isSearchingRef.current) return;
    isSearchingRef.current = true;

    // ── Incrementa geração e aborta fetches de realtime anteriores ──────────
    const currentGeneration = ++searchGenerationRef.current;
    if (realtimeAbortRef.current) {
      realtimeAbortRef.current.abort();
    }
    const realtimeController = new AbortController();
    realtimeAbortRef.current = realtimeController;

    setBusLines(prev => { if (prev.length === 0) setIsLoading(true); return prev; });
    setErrorMsg(null);
    setStaleData(false);
    // Limpa o mapa de linhas ao vivo ao iniciar nova busca
    setLiveLineMap({});
    setCountdown(REFRESH_INTERVAL);

    try {
      const { lines, error } = await performSearch(idToSearch, forcedFilter ?? lineFilter);

      // Se uma busca mais nova já começou, descarta este resultado
      if (currentGeneration !== searchGenerationRef.current) return;

      setBusLines(prev => prev.length === 0 ? lines : mergeLines(prev, lines));
      if (error === 'offline') { setStaleData(true); setErrorMsg('offline'); }
      else if (error === 'not_found') setErrorMsg('not_found');
      else if (error === 'no_lines') setErrorMsg('no_lines');
      else if (error === 'invalid_stop') setErrorMsg('invalid_stop');

      if (lines.length > 0) {
        addToHistory(idToSearch);

        // ── Fetches de realtime com AbortController compartilhado ───────────
        const linhasUnicas = [...new Set(lines.map(l => l.number))];
        const liveMap: Record<string, boolean> = {};

        await Promise.all(linhasUnicas.map(async (num) => {
          // Se esta rodada foi abortada (nova busca iniciada), para imediatamente
          if (realtimeController.signal.aborted) return;
          try {
            const r = await fetch(`/api/realtimebus?linha=${num}`, {
              signal: realtimeController.signal,
            });
            if (!r.ok) return;
            const data = await r.json();
            if (Array.isArray(data) && data.length > 0) liveMap[num] = true;
          } catch (err) {
            // AbortError é esperado quando uma nova busca cancela a anterior
            if (err instanceof Error && err.name === 'AbortError') return;
            // outros erros de rede: apenas ignora, não interrompe as demais
          }
        }));

        // Verifica novamente se a geração ainda é a atual antes de gravar
        if (currentGeneration !== searchGenerationRef.current) return;
        if (!realtimeController.signal.aborted) {
          setLiveLineMap(liveMap);
        }
      }
    } catch {
      if (currentGeneration === searchGenerationRef.current) {
        setStaleData(true);
        setErrorMsg('offline');
      }
    } finally {
      if (currentGeneration === searchGenerationRef.current) {
        setIsLoading(false);
        setCountdown(REFRESH_INTERVAL);
      }
      isSearchingRef.current = false;
    }
  }, [stopId, lineFilter, performSearch, addToHistory, mergeLines]);

  // ─── FIX CRÍTICO: aceita favs como parâmetro ─────────────────────────────
  const loadFavoritesSchedules = useCallback(async (favs: FavoriteItem[]) => {
    if (favs.length === 0) return;
    if (isFavSearchingRef.current) return;
    isFavSearchingRef.current = true;
    setFavoriteBusLines(prev => { if (prev.length === 0) setIsFavoritesLoading(true); return prev; });
    setStaleData(false);
    try {
      const results = await Promise.all(favs.map(fav => performSearch(fav.stopId, fav.lineNumber)));
      const allLines = results.flatMap(r => r.lines);
      const hasOffline = results.some(r => r.error === 'offline');
      const newInactive = new Set<string>();
      results.forEach((r, i) => {
        if (r.error === 'not_found' || r.error === 'inactive_stop') {
          newInactive.add(favs[i].stopId);
        }
      });
      setInactiveStops(newInactive);
      setFavoriteBusLines(prev => prev.length === 0 ? allLines : mergeLines(prev, allLines));
      if (hasOffline) setStaleData(true);
    } catch { setStaleData(true); }
    finally { setIsFavoritesLoading(false); setCountdown(REFRESH_INTERVAL); isFavSearchingRef.current = false; }
  }, [performSearch, mergeLines]);

  return {
    busLines,
    setBusLines,
    favoriteBusLines,
    setFavoriteBusLines,
    stopId,
    setStopId,
    lineFilter,
    setLineFilter,
    isLoading,
    isFavoritesLoading,
    errorMsg,
    setErrorMsg,
    countdown,
    setCountdown,
    staleData,
    setStaleData,
    searchHistory,
    liveLineMap,
    setLiveLineMap,
    inactiveStops,
    isSearchingRef,
    isFavSearchingRef,
    performSearch,
    mergeLines,
    handleSearch,
    loadFavoritesSchedules,
  };
}
