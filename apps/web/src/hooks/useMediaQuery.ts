import { useState, useEffect } from 'react';

/**
 * Hook to detect whether the current viewport width is below a given breakpoint.
 * Dynamically reacts to window resize and mobile orientation changes.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const updateMatch = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    // Set initial match from query
    setIsMobile(query.matches);

    // Modern event listener with fallback
    if (query.addEventListener) {
      query.addEventListener('change', updateMatch);
    } else {
      query.addListener(updateMatch);
    }

    const onResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      if (query.removeEventListener) {
        query.removeEventListener('change', updateMatch);
      } else {
        query.removeListener(updateMatch);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [breakpoint]);

  return isMobile;
}
