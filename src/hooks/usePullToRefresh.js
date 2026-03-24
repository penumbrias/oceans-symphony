import { useEffect, useRef, useState } from 'react';

export function usePullToRefresh(onRefresh, threshold = 80) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollableRef = useRef(null);
  const startYRef = useRef(0);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    const el = scrollableRef.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      if (el.scrollTop === 0) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      if (el.scrollTop !== 0 || isRefreshing) return;
      const currentY = e.touches[0].clientY;
      pullDistanceRef.current = currentY - startYRef.current;
      if (pullDistanceRef.current > 0) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (pullDistanceRef.current > threshold && !isRefreshing) {
        setIsRefreshing(true);
        onRefresh().finally(() => setIsRefreshing(false));
      }
      pullDistanceRef.current = 0;
      startYRef.current = 0;
    };

    el.addEventListener('touchstart', handleTouchStart, false);
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, false);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh, threshold, isRefreshing]);

  return { scrollableRef, isRefreshing, pullDistance: pullDistanceRef.current };
}