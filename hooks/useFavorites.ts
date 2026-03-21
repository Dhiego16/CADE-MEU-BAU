import { useState, useCallback, useRef } from 'react';
import { BusLine, FavoriteItem } from '../types';
import { haptic } from '../utils';

export function useFavorites(stopId: string) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('cade_meu_bau_app_favs') || '[]'); } catch { return []; }
  });
  const [removingFavKey, setRemovingFavKey] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistFavorites = useCallback((next: FavoriteItem[]) => {
    localStorage.setItem('cade_meu_bau_app_favs', JSON.stringify(next));
  }, []);

  const toggleFavorite = useCallback((line: BusLine, favoriteBusLinesSetter: React.Dispatch<React.SetStateAction<BusLine[]>>) => {
    haptic(50);
    const sId = line.stopSource ?? stopId;
    const key = `${sId}::${line.number}`;
    setFavorites(prev => {
      const isFav = prev.some(f => f.stopId === sId && f.lineNumber === line.number);
      if (isFav) {
        setRemovingFavKey(key);
        setTimeout(() => {
          setFavorites(p => {
            const next = p.filter(f => !(f.stopId === sId && f.lineNumber === line.number));
            persistFavorites(next);
            return next;
          });
          favoriteBusLinesSetter(p => p.filter(l => !(l.stopSource === sId && l.number === line.number)));
          setRemovingFavKey(null);
        }, 350);
        return prev;
      } else {
        haptic([50, 30, 80]);
        const next = [...prev, { stopId: sId, lineNumber: line.number, destination: line.destination }];
        persistFavorites(next);
        return next;
      }
    });
  }, [stopId, persistFavorites]);

  const startLongPress = useCallback((key: string, currentNickname?: string) => {
    longPressTimerRef.current = setTimeout(() => {
      haptic(100);
      setEditingNickname(key);
      setNicknameInput(currentNickname ?? '');
    }, 600);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const saveNickname = useCallback(() => {
    if (!editingNickname) return;
    const [sId, lineNumber] = editingNickname.split('::');
    setFavorites(prev => {
      const next = prev.map(f =>
        f.stopId === sId && f.lineNumber === lineNumber
          ? { ...f, nickname: nicknameInput.trim() || undefined }
          : f
      );
      persistFavorites(next);
      return next;
    });
    setEditingNickname(null);
    haptic(40);
  }, [editingNickname, nicknameInput, persistFavorites]);

  return {
    favorites,
    setFavorites,
    removingFavKey,
    editingNickname,
    setEditingNickname,
    nicknameInput,
    setNicknameInput,
    toggleFavorite,
    startLongPress,
    cancelLongPress,
    saveNickname,
  };
}
