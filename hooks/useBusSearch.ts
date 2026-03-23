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

  // Merge inteligente: atualiza apenas linhas que mudaram, preservando referências
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
    timerRef?: React.MutableRefObject<ReturnType<typeof setInterval> | null>
  ) => {
    const idToSearch = forcedId ?? stopId;
    if (!idToSearch || isSearchingRef.current) return;
    isSearchingRef.current = true;
    setBusLines(prev => { if (prev.length === 0) setIsLoading(true); return prev; });
    setErrorMsg(null);
    setStaleData(false);

    // FIX: limpar liveLineMap antes de nova busca para evitar botões fantasma
    setLiveLineMap({});

    if (timerRef?.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setCountdown(REFRESH_INTERVAL);

    try {
      const { lines, error } = await performSearch(idToSearch, forcedFilter ?? lineFilter);
      setBusLines(prev => prev.length === 0 ? lines : mergeLines(prev, lines));
      if (error === 'offline') { setStaleData(true); setErrorMsg('offline'); }
      else if (error === 'not_found') setErrorMsg('not_found');
      else if (error === 'no_lines') setErrorMsg('no_lines');
      else if (error === 'invalid_stop') setErrorMsg('invalid_stop');
      if (lines.length > 0) {
        addToHistory(idToSearch);
        const liveMap: Record<string, boolean> = {};
        await Promise.all([...new Set(lines.map(l => l.number))].map(async (num) => {
          try {
            const r = await fetch(`/api/realtimebus?linha=${num}`);
            if (!r.ok) return;
            const data = await r.json();
            if (Array.isArray(data) && data.length > 0) liveMap[num] = true;
          } catch { /* ignora */ }
        }));
        setLiveLineMap(liveMap);
      }
    } catch { setStaleData(true); setErrorMsg('offline'); }
    finally { setIsLoading(false); setCountdown(REFRESH_INTERVAL); isSearchingRef.current = false; }
  }, [stopId, lineFilter, performSearch, addToHistory, mergeLines]);

  // FIX CRÍTICO: agora aceita favs como parâmetro — não depende mais do closure vazio
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
