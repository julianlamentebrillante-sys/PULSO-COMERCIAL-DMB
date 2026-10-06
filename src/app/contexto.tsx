/**
 * Contexto global: repositorio, servicios, sesión, fecha de "hoy" y notificaciones.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as F from '../core/fechas';
import type { FechaISO, Usuario } from '../core/tipos';
import { AlmacenMemoria, RepositorioLocal, type Almacen, type Repositorio } from '../datos/repositorio';
import { crearServicios, type Servicios } from '../datos/servicios';
import { sembrar } from '../datos/semilla';

const CLAVE_BD = 'pulso-dmb:bd';
const CLAVE_SESION = 'pulso-dmb:sesion';

interface ValorApp {
  repo: Repositorio;
  servicios: Servicios;
  usuario: Usuario | null;
  hoy: FechaISO;
  fechaSimulada: FechaISO | null;
  almacenamientoPersistente: boolean;
  noLeidas: number;
  iniciarSesion(usuario: string, clave: string): Promise<void>;
  cerrarSesion(): void;
  cambiarFechaSimulada(fecha: FechaISO | null): Promise<void>;
  refrescarNotificaciones(): Promise<void>;
  /** Vuelve a leer todo desde el repositorio (tras importar o reiniciar datos). */
  recargarTodo(): Promise<void>;
}

const Contexto = createContext<ValorApp | null>(null);

function obtenerAlmacen(): { almacen: Almacen; persistente: boolean } {
  try {
    const prueba = 'pulso-dmb:prueba';
    window.localStorage.setItem(prueba, '1');
    window.localStorage.removeItem(prueba);
    return { almacen: window.localStorage, persistente: true };
  } catch {
    return { almacen: new AlmacenMemoria(), persistente: false };
  }
}

function leerSesion(): string | null {
  try { return window.localStorage.getItem(CLAVE_SESION); } catch { return null; }
}
function guardarSesion(id: string | null) {
  try {
    if (id) window.localStorage.setItem(CLAVE_SESION, id);
    else window.localStorage.removeItem(CLAVE_SESION);
  } catch { /* sin almacenamiento: la sesión dura lo que dure la pestaña */ }
}

export function ProveedorApp({ children }: { children: ReactNode }) {
  const [{ repo, persistente }] = useState(() => {
    const { almacen, persistente } = obtenerAlmacen();
    return { repo: new RepositorioLocal(CLAVE_BD, almacen), persistente };
  });
  const [listo, setListo] = useState(false);
  const [fechaSimulada, setFechaSimulada] = useState<FechaISO | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const [hoyReal, setHoyReal] = useState(F.hoyBogota());

  const hoy = fechaSimulada ?? hoyReal;
  const servicios = useMemo(() => crearServicios(repo, () => fechaSimulada ?? F.hoyBogota()), [repo, fechaSimulada]);

  // Si la app queda abierta al cambiar el día, "hoy" se actualiza solo.
  useEffect(() => {
    const t = window.setInterval(() => setHoyReal(F.hoyBogota()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const recargarTodo = useCallback(async () => {
    if (await repo.estaVacio()) await sembrar(repo, F.hoyBogota());
    const config = await repo.obtenerConfig();
    setFechaSimulada(config.fechaSimulada ?? null);
    const id = leerSesion();
    const s = crearServicios(repo, () => config.fechaSimulada ?? F.hoyBogota());
    const u = id ? await s.obtenerSesion(id) : null;
    if (!u) guardarSesion(null);
    setUsuario(u);
    setNoLeidas(u ? await s.contarNotificacionesNoLeidas(u) : 0);
  }, [repo]);

  useEffect(() => {
    recargarTodo().finally(() => setListo(true));
  }, [recargarTodo]);

  const refrescarNotificaciones = useCallback(async () => {
    setNoLeidas(usuario ? await servicios.contarNotificacionesNoLeidas(usuario) : 0);
  }, [servicios, usuario]);

  const valor: ValorApp = {
    repo, servicios, usuario, hoy, fechaSimulada, noLeidas,
    almacenamientoPersistente: persistente,
    async iniciarSesion(nombre, clave) {
      const u = await servicios.iniciarSesion(nombre, clave);
      guardarSesion(u.id);
      setUsuario(u);
      setNoLeidas(await servicios.contarNotificacionesNoLeidas(u));
    },
    cerrarSesion() {
      guardarSesion(null);
      setUsuario(null);
    },
    async cambiarFechaSimulada(fecha) {
      await repo.actualizarConfig({ fechaSimulada: fecha });
      setFechaSimulada(fecha);
    },
    refrescarNotificaciones,
    recargarTodo,
  };

  if (!listo) return null;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApp(): ValorApp {
  const v = useContext(Contexto);
  if (!v) throw new Error('useApp debe usarse dentro de <ProveedorApp>.');
  return v;
}

/** useApp() para pantallas que requieren sesión iniciada. */
export function useSesion(): ValorApp & { usuario: Usuario } {
  const v = useApp();
  if (!v.usuario) throw new Error('Se requiere una sesión iniciada.');
  return v as ValorApp & { usuario: Usuario };
}
