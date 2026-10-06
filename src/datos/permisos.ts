/**
 * Reglas de permisos. Son las mismas que se replicarán como Row Level Security
 * en Supabase, para que la seguridad no dependa de la pantalla.
 */
import type { FechaISO, Rol, Usuario } from '../core/tipos';

type Actor = Pick<Usuario, 'id' | 'roles'> | null | undefined;

export const ROLES: { id: Rol; nombre: string }[] = [
  { id: 'admin', nombre: 'Administrador' },
  { id: 'director', nombre: 'Director(a) comercial' },
  { id: 'comercial', nombre: 'Comercial' },
];

export function tieneRol(u: Actor, rol: Rol): boolean {
  return !!u && Array.isArray(u.roles) && u.roles.includes(rol);
}

export const esAdmin = (u: Actor) => tieneRol(u, 'admin');
export const esDirector = (u: Actor) => tieneRol(u, 'director');
export const esComercial = (u: Actor) => tieneRol(u, 'comercial');

/** Administrador y director(a) ven al equipo completo. */
export const veEquipo = (u: Actor) => esAdmin(u) || esDirector(u);

export const puedeVerComercial = (u: Actor, comercialId: string) => veEquipo(u) || (!!u && u.id === comercialId);

/** El comercial solo edita su registro de HOY. El administrador puede corregir cualquier día. */
export const puedeEditarRegistro = (u: Actor, comercialId: string, fecha: FechaISO, hoy: FechaISO) =>
  esAdmin(u) || (!!u && u.id === comercialId && esComercial(u) && fecha === hoy);
