import { useState, useEffect, useRef } from 'react';
import { haptic } from '../utils';

export function usePullToRefresh(onRefresh: () => void, enabled: boolean) {
  const startYRef = useRef<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullDist, setPullDist] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const THRESHOLD = 72;

    const onTouchStart = (e: TouchEvent) => {
      const el = document.querySelector('.app-container');
      if (!el || el.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        setPulling(true);
        setPullDist(Math.min(dy, THRESHOLD + 20));
      }
    };

    const onTouchEnd = () => {
      if (pullDist >= THRESHOLD) {
        haptic(40);
        onRefresh();
      }
      startYRef.current = null;
      setPulling(false);
      setPullDist(0);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, pullDist, onRefresh]);

  return { pulling, pullDist };
}
