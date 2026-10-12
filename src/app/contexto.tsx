/**
 * Contexto global: servicios, sesión, fecha de "hoy" y notificaciones.
 *
 * Modo de datos:
 *  · 'supabase' si están definidas VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY;
 *  · 'local' (prototipo en el navegador) si no.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as F from '../core/fechas';
import type { FechaISO, Usuario } from '../core/tipos';
import { AlmacenMemoria, RepositorioLocal, type Almacen, type Repositorio } from '../datos/repositorio';
import { crearServicios, type Servicios } from '../datos/servicios';
import { sembrar } from '../datos/semilla';
import { configSupabase, crearClienteSupabase, crearServiciosSupabase } from '../datos/supabase';

const CONFIG_SUPABASE = configSupabase();
export const MODO_DATOS: 'local' | 'supabase' = CONFIG_SUPABASE ? 'supabase' : 'local';

const CLAVE_BD = 'pulso-dmb:bd';
const CLAVE_SESION = 'pulso-dmb:sesion';

interface ValorApp {
  modo: 'local' | 'supabase';
  /** Repositorio local (solo se usa en modo prototipo: herramientas de prueba). */
  repo: Repositorio;
  servicios: Servicios;
  usuario: Usuario | null;
  hoy: FechaISO;
  fechaSimulada: FechaISO | null;
  almacenamientoPersistente: boolean;
  noLeidas: number;
  iniciarSesion(usuario: string, clave: string): Promise<void>;
  cerrarSesion(): Promise<void>;
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
  const [{ repo, persistente, cliente }] = useState(() => {
    const { almacen, persistente } = obtenerAlmacen();
    return {
      repo: new RepositorioLocal(CLAVE_BD, almacen),
      persistente,
      cliente: CONFIG_SUPABASE ? crearClienteSupabase(CONFIG_SUPABASE) : null,
    };
  });
  const [listo, setListo] = useState(false);
  const [fechaSimulada, setFechaSimulada] = useState<FechaISO | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const [hoyReal, setHoyReal] = useState(F.hoyBogota());

  const hoy = fechaSimulada ?? hoyReal;
  const servicios = useMemo(
    () => (cliente ? crearServiciosSupabase(cliente) : crearServicios(repo, () => fechaSimulada ?? F.hoyBogota())),
    [cliente, repo, fechaSimulada],
  );

  // Si la app queda abierta al cambiar el día, "hoy" se actualiza solo.
  useEffect(() => {
    const t = window.setInterval(() => setHoyReal(F.hoyBogota()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const recargarTodo = useCallback(async () => {
    if (cliente) {
      const { data } = await cliente.auth.getSession();
      const s = crearServiciosSupabase(cliente);
      const u = data.session ? await s.obtenerSesion(data.session.user.id) : null;
      setUsuario(u);
      setNoLeidas(u ? await s.contarNotificacionesNoLeidas(u).catch(() => 0) : 0);
      return;
    }
    if (await repo.estaVacio()) await sembrar(repo, F.hoyBogota());
    const config = await repo.obtenerConfig();
    setFechaSimulada(config.fechaSimulada ?? null);
    const id = leerSesion();
    const s = crearServicios(repo, () => config.fechaSimulada ?? F.hoyBogota());
    const u = id ? await s.obtenerSesion(id) : null;
    if (!u) guardarSesion(null);
    setUsuario(u);
    setNoLeidas(u ? await s.contarNotificacionesNoLeidas(u) : 0);
  }, [repo, cliente]);

  useEffect(() => {
    recargarTodo().finally(() => setListo(true));
  }, [recargarTodo]);

  // Supabase: si la sesión se cierra o expira (o se cierra en otra pestaña), volver al login.
  useEffect(() => {
    if (!cliente) return;
    const { data } = cliente.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') setUsuario(null);
    });
    return () => data.subscription.unsubscribe();
  }, [cliente]);

  const refrescarNotificaciones = useCallback(async () => {
    setNoLeidas(usuario ? await servicios.contarNotificacionesNoLeidas(usuario) : 0);
  }, [servicios, usuario]);

  const valor: ValorApp = {
    modo: MODO_DATOS, repo, servicios, usuario, hoy, fechaSimulada, noLeidas,
    almacenamientoPersistente: persistente,
    async iniciarSesion(nombre, clave) {
      const u = await servicios.iniciarSesion(nombre, clave);
      guardarSesion(u.id);
      setUsuario(u);
      setNoLeidas(await servicios.contarNotificacionesNoLeidas(u));
    },
    async cerrarSesion() {
      guardarSesion(null);
      setUsuario(null);
      await servicios.cerrarSesion();
    },
    async cambiarFechaSimulada(fecha) {
      if (cliente) return; // la fecha simulada solo existe en el prototipo local
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
