import { useEffect, useRef } from "react";

/** Devuelve una función que ejecuta `fn` sólo tras `ms` sin nuevas llamadas. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => () => clearTimeout(timer.current), []);
  return (...args: A) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(...args), ms);
  };
}
