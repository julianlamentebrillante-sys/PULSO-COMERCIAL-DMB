import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Carga datos asíncronos y se vuelve a ejecutar cuando cambian las dependencias.
 * Ignora respuestas viejas si el usuario cambia de filtro antes de que terminen.
 */
export function useCarga<T>(cargar: () => Promise<T>, deps: DependencyList) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [cargando, setCargando] = useState(true);
  const turno = useRef(0);

  const ejecutar = useCallback(cargar, deps);

  const recargar = useCallback(async () => {
    const mio = ++turno.current;
    setCargando(true);
    try {
      const r = await ejecutar();
      if (mio === turno.current) { setDatos(r); setError(null); }
    } catch (e) {
      if (mio === turno.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [ejecutar]);

  useEffect(() => { void recargar(); }, [recargar]);

  return { datos, error, cargando, recargar };
}
