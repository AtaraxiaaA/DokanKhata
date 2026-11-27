import { useEffect, useState } from 'react';

// gives back the value only after it stops changing for `ms`, so search boxes
// don't fire a request on every key press
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
