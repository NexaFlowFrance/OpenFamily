import { useEffect, useRef } from 'react';

interface UseWeekSwipeProps {
  onSwipeLeft: () => void;  // Semaine suivante
  onSwipeRight: () => void; // Semaine précédente
  enabled?: boolean;
}

export function useWeekSwipe({ onSwipeLeft, onSwipeRight, enabled = true }: UseWeekSwipeProps) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Ignorer si le toucher commence sur un élément interactif
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="button"]') ||
        target.closest('[data-no-swipe]')
      ) {
        return;
      }

      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      isSwiping.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartX.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;

      // Déterminer si c'est un swipe horizontal (plus horizontal que vertical)
      if (!isSwiping.current && Math.abs(deltaX) > 10) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          isSwiping.current = true;
        }
      }

      // Prévenir le scroll si on est en train de swiper horizontalement
      if (isSwiping.current && Math.abs(deltaX) > Math.abs(deltaY)) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartX.current || !isSwiping.current) {
        touchStartX.current = 0;
        touchStartY.current = 0;
        isSwiping.current = false;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;

      // Threshold de 100px pour déclencher le swipe
      const SWIPE_THRESHOLD = 100;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
        if (deltaX > 0) {
          // Swipe vers la droite -> semaine précédente
          onSwipeRight();
        } else {
          // Swipe vers la gauche -> semaine suivante
          onSwipeLeft();
        }
      }

      touchStartX.current = 0;
      touchStartY.current = 0;
      isSwiping.current = false;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, enabled]);
}
