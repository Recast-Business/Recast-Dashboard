import * as React from "react";

/**
 * Round-1 efficiency (friction audit #23): drop-in useState replacement
 * that mirrors the value into sessionStorage, so filter/search state
 * survives navigating away (e.g. Leads → a creator profile → back)
 * without persisting forever like localStorage would — a fresh browser
 * session starts clean.
 *
 * Pass `key = null` to behave exactly like plain useState (used when a
 * component is rendered somewhere that shouldn't share/persist state).
 */
export function useSessionState<T>(
  key: string | null,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => {
    if (!key) return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* corrupt entry or storage unavailable — start fresh */
    }
    return initial;
  });

  const set = React.useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (next) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (key) {
          try {
            window.sessionStorage.setItem(key, JSON.stringify(v));
          } catch {
            /* best-effort persistence only */
          }
        }
        return v;
      });
    },
    [key],
  );

  return [value, set];
}
