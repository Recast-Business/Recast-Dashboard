import * as React from "react";

/**
 * Round-1 efficiency (friction audit #22): the year selector used to
 * be independent useState(currentYear) on every page — switch Finance
 * to 2025, hop to Payments, and you're back on 2026. This hook backs
 * the same [year, setYear] shape with localStorage so the pick
 * follows you across pages (and across sessions).
 *
 * The stored value is only honoured inside the same now-2 … now+2
 * window the YearSelector renders, so a stale localStorage entry
 * from last year can never pin the app to an unpickable year.
 */

const KEY = "recast.year";

export function useSharedYear(): [number, (y: number) => void] {
  const current = new Date().getFullYear();

  const [year, setYearState] = React.useState<number>(() => {
    try {
      const stored = Number(window.localStorage.getItem(KEY));
      if (Number.isInteger(stored) && stored >= current - 2 && stored <= current + 2) {
        return stored;
      }
    } catch {
      /* storage unavailable (private mode etc.) — fall through */
    }
    return current;
  });

  const setYear = React.useCallback((y: number) => {
    try {
      window.localStorage.setItem(KEY, String(y));
    } catch {
      /* best-effort persistence only */
    }
    setYearState(y);
  }, []);

  return [year, setYear];
}
