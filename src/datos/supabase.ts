/**
 * Servicios sobre Supabase: misma interfaz que el prototipo local (`crearServicios`).
 *
 * La seguridad real la imponen la base de datos (RLS, triggers y funciones, ver
 * supabase/migrations) y la Edge Function de usuarios. Las validaciones que se
 * repiten aquí solo sirven para dar mensajes claros antes de ir al servidor.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as C from '../core/catalogo';
import * as F from '../core/fechas';
import type { FechaISO, Meta, Notificacion, Periodicidad, Registro, Rol, Usuario, Valores } from '../core/tipos';
import { crearConsultas } from './consultas';
import { ErrorNegocio, exigir } from './errores';
import * as perm from './permisos';
import {
  MAX_VALOR_META, MAX_VALOR_REGISTRO, MIN_LONGITUD_CLAVE, MIN_LONGITUD_CLAVE_PROPIA,
  type AutorizacionPendiente, type DatosMeta, type DatosUsuario, type Servicios,
} from './servicios';

// ---------- Configuración ----------

export interface ConfigSupabase { url: string; clave: string }

/** Lee la configuración de las variables de entorno; null = modo prototipo local. */
export function configSupabase(): ConfigSupabase | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const clave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && clave ? { url, clave } : null;
}

export function crearClienteSupabase({ url, clave }: ConfigSupabase): SupabaseClient {
  return createClient(url, clave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
}

// ---------- Filas de la base de datos ----------

interface FilaPerfil {
  id: string; nombre: string; correo: string; roles: Rol[]; fecha_inicio: string;
  activo: boolean; inactivo_desde: string | null; creado: string; creado_por: string | null;
}
interface FilaHistorial { momento: string; por: string | null; accion: 'creado' | 'editado'; correccion: boolean }
interface FilaRegistro {
  id: string; user_id: string; fecha: string; valores: Valores; excepcional: boolean;
  creado: string; actualizado: string; actualizado_por: string | null; corregido_por_admin: boolean;
  registros_historial?: FilaHistorial[];
}
interface FilaMeta {
  id: string; user_id: string; indicador: string; periodicidad: Periodicidad; valor: number | string;
  desde: string; hasta: string | null; creado: string; creado_por: string | null;
  actualizado: string | null; actualizado_por: string | null;
}
interface FilaNotificacion { id: string; tipo: 'registro_excepcional'; user_id: string; fecha: string; motivo: string | null; creado: string; leida: boolean }

const aUsuario = (p: FilaPerfil): Usuario => ({
  id: p.id, nombre: p.nombre, usuario: p.correo, roles: p.roles, fechaInicio: p.fecha_inicio,
  activo: p.activo, inactivoDesde: p.inactivo_desde, creado: p.creado, creadoPor: p.creado_por ?? undefined,
});

const aRegistro = (r: FilaRegistro): Registro => ({
  id: r.id, userId: r.user_id, fecha: r.fecha, valores: r.valores, excepcional: r.excepcional,
  creado: r.creado, actualizado: r.actualizado, actualizadoPor: r.actualizado_por ?? '',
  corregidoPorAdmin: r.corregido_por_admin,
  historial: (r.registros_historial ?? [])
    .sort((a, b) => (a.momento < b.momento ? -1 : 1))
    .map((h) => ({ momento: h.momento, por: h.por ?? '', accion: h.accion, correccion: h.correccion })),
});

const aMeta = (m: FilaMeta): Meta => ({
  id: m.id, userId: m.user_id, indicador: m.indicador, periodicidad: m.periodicidad, valor: Number(m.valor),
  desde: m.desde, hasta: m.hasta, creado: m.creado, creadoPor: m.creado_por ?? '',
  actualizado: m.actualizado ?? undefined, actualizadoPor: m.actualizado_por ?? undefined,
});

const aNotificacion = (n: FilaNotificacion): Notificacion => ({
  id: n.id, tipo: n.tipo, userId: n.user_id, fecha: n.fecha, motivo: n.motivo, creado: n.creado, leida: n.leida,
});

// ---------- Errores ----------

/** Convierte errores de Supabase en mensajes comprensibles. */
export function traducirError(error: { message?: string } | null | undefined): ErrorNegocio {
  const m = error?.message ?? 'Error desconocido.';
  if (/invalid login credentials/i.test(m)) return new ErrorNegocio('Correo o contraseña incorrectos.');
  if (/email not confirmed/i.test(m)) return new ErrorNegocio('El correo aún no está confirmado. Comunícate con el administrador.');
  if (/row-level security|permission denied/i.test(m)) return new ErrorNegocio('No tienes permiso para realizar esta acción.');
  if (/metas_sin_solapes/.test(m)) return new ErrorNegocio('Ya existe una meta vigente en esas fechas para este indicador.');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return new ErrorNegocio('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  if (/jwt expired/i.test(m)) return new ErrorNegocio('Tu sesión expiró. Vuelve a iniciar sesión.');
  return new ErrorNegocio(m);
}

async function ok<T>(consulta: PromiseLike<{ data: T; error: { message?: string } | null }>): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw traducirError(error);
  return data;
}

const PAGINA = 1000;

/** Trae todas las filas, página por página (Supabase entrega máximo 1000 por consulta). */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const filas = (await ok(consulta(desde, desde + PAGINA - 1))) ?? [];
    out.push(...filas);
    if (filas.length < PAGINA) return out;
  }
}

// ---------- Servicios ----------

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function crearServiciosSupabase(sb: SupabaseClient, reloj: () => FechaISO = F.hoyBogota): Servicios {
  const hoy = () => reloj();

  async function perfil(id: string): Promise<Usuario | null> {
    const fila = await ok(sb.from('perfiles').select('*').eq('id', id).maybeSingle());
    return fila ? aUsuario(fila as FilaPerfil) : null;
  }

  async function obtenerComercial(id: string): Promise<Usuario> {
    const u = await perfil(id);
    exigir(u && perm.esComercial(u), 'El usuario indicado no es un comercial.');
    return u;
  }

  function validarDatosUsuario(datos: DatosUsuario) {
    const nombre = String(datos.nombre ?? '').trim();
    const correo = String(datos.usuario ?? '').trim().toLowerCase();
    const roles = [...new Set(datos.roles ?? [])];
    exigir(nombre.length >= 2, 'Escribe el nombre de la persona.');
    exigir(CORREO_VALIDO.test(correo), 'Escribe un correo electrónico válido.');
    exigir(roles.length > 0, 'Selecciona al menos un rol.');
    exigir(roles.every((r) => perm.ROLES.some((x) => x.id === r)), 'Rol no válido.');
    exigir(F.esFechaValida(datos.fechaInicio), 'Indica una fecha de inicio válida.');
    return { nombre, correo, roles, fechaInicio: datos.fechaInicio };
  }

  // ===== Sesión =====

  async function iniciarSesion(correo: string, clave: string): Promise<Usuario> {
    const { data, error } = await sb.auth.signInWithPassword({ email: String(correo ?? '').trim().toLowerCase(), password: String(clave ?? '') });
    if (error) throw traducirError(error);
    const u = await perfil(data.user.id);
    if (!u || !u.activo) {
      await sb.auth.signOut();
      throw new ErrorNegocio('Este usuario está inactivo. Comunícate con el administrador.');
    }
    return u;
  }

  async function obtenerSesion(id: string): Promise<Usuario | null> {
    const u = await perfil(id).catch(() => null);
    if (!u || !u.activo) {
      await sb.auth.signOut();
      return null;
    }
    return u;
  }

  async function cerrarSesion(): Promise<void> {
    await sb.auth.signOut();
  }

  async function cambiarMiClave(actor: Usuario, actual: string, nueva: string): Promise<void> {
    exigir(String(nueva ?? '').length >= MIN_LONGITUD_CLAVE, `La nueva contraseña debe tener al menos ${MIN_LONGITUD_CLAVE} caracteres.`);
    const { error } = await sb.auth.signInWithPassword({ email: actor.usuario, password: String(actual ?? '') });
    if (error) throw new ErrorNegocio('La contraseña actual no es correcta.');
    const { error: errorCambio } = await sb.auth.updateUser({ password: nueva });
    if (errorCambio) throw traducirError(errorCambio);
  }

  // ===== Usuarios y equipo comercial =====

  async function listarUsuarios(_actor: Usuario): Promise<Usuario[]> {
    // RLS ya filtra: cada quien ve lo que le corresponde según su rol.
    const filas = await todas<FilaPerfil>((d, h) => sb.from('perfiles').select('*').order('nombre').range(d, h));
    return filas.map(aUsuario).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function listarComerciales(actor: Usuario, { incluirInactivos = false } = {}): Promise<Usuario[]> {
    return (await listarUsuarios(actor)).filter((u) => perm.esComercial(u) && (incluirInactivos || u.activo));
  }

  async function crearUsuario(_actor: Usuario, _datos: DatosUsuario): Promise<Usuario> {
    throw new ErrorNegocio('En esta versión las personas se autorizan con un código de activación.');
  }

  /** Autoriza un correo y devuelve el código de activación (solo se muestra una vez). */
  async function autorizarAcceso(actor: Usuario, datos: DatosUsuario): Promise<string> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede autorizar accesos.');
    const v = validarDatosUsuario(datos);
    return (await ok(sb.rpc('autorizar_acceso', {
      p_correo: v.correo, p_nombre: v.nombre, p_roles: v.roles, p_fecha_inicio: v.fechaInicio,
    }))) as string;
  }

  async function listarAutorizaciones(actor: Usuario): Promise<AutorizacionPendiente[]> {
    if (!perm.esAdmin(actor)) return [];
    const filas = await ok(sb.from('codigos_acceso')
      .select('correo, nombre, roles, fecha_inicio, creado, expira')
      .eq('tipo', 'activacion').is('usado', null).order('creado', { ascending: false }));
    return ((filas ?? []) as { correo: string; nombre: string; roles: Rol[]; fecha_inicio: string; creado: string; expira: string }[])
      .map((f) => ({ correo: f.correo, nombre: f.nombre, roles: f.roles, fechaInicio: f.fecha_inicio, creado: f.creado, expira: f.expira }));
  }

  async function cancelarAutorizacion(actor: Usuario, correo: string): Promise<void> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede gestionar accesos.');
    await ok(sb.rpc('cancelar_autorizacion', { p_correo: correo }));
  }

  async function generarCodigoRestablecer(actor: Usuario, id: string): Promise<string> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede restablecer contraseñas.');
    return (await ok(sb.rpc('generar_codigo_restablecer', { p_user_id: id }))) as string;
  }

  function validarClavePropia(clave: string) {
    exigir(String(clave ?? '').length >= MIN_LONGITUD_CLAVE_PROPIA, `La contraseña debe tener al menos ${MIN_LONGITUD_CLAVE_PROPIA} caracteres.`);
  }

  /** La persona activa su cuenta con el código que le dio el administrador. */
  async function activarCuenta(correo: string, codigo: string, clave: string): Promise<void> {
    validarClavePropia(clave);
    exigir(String(codigo ?? '').trim().length > 0, 'Escribe el código de activación.');
    const { data, error } = await sb.auth.signUp({
      email: String(correo ?? '').trim().toLowerCase(),
      password: clave,
      options: { data: { codigo_activacion: String(codigo).trim().toUpperCase() } },
    });
    if (error) {
      if (/database error saving new user/i.test(error.message)) {
        throw new ErrorNegocio('El correo no está autorizado, o el código no es válido o ya venció. Pide uno nuevo al administrador.');
      }
      if (/already registered|already exists/i.test(error.message)) {
        throw new ErrorNegocio('Esta cuenta ya está activada. Inicia sesión, o usa «Olvidé mi contraseña» si no la recuerdas.');
      }
      if (/signups? not allowed|signup is disabled/i.test(error.message)) {
        throw new ErrorNegocio('La activación de cuentas está deshabilitada en Supabase. Avísale al administrador.');
      }
      throw traducirError(error);
    }
    if (!data.session) {
      throw new ErrorNegocio('Tu cuenta quedó creada, pero Supabase pide confirmar el correo. Avísale al administrador para que desactive «Confirm email».');
    }
  }

  async function restablecerConCodigo(correo: string, codigo: string, clave: string): Promise<void> {
    validarClavePropia(clave);
    await ok(sb.rpc('restablecer_clave_con_codigo', { p_correo: correo, p_codigo: codigo, p_clave: clave }));
  }

  async function actualizarUsuario(actor: Usuario, id: string, datos: DatosUsuario): Promise<Usuario> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede editar usuarios.');
    const v = validarDatosUsuario(datos);
    if (id === actor.id) exigir(v.roles.includes('admin'), 'No puedes quitarte a ti mismo el rol de administrador.');
    // El correo no se cambia aquí: es la identidad de acceso en Supabase Auth.
    const fila = await ok(sb.from('perfiles').update({ nombre: v.nombre, roles: v.roles, fecha_inicio: v.fechaInicio }).eq('id', id).select('*').single());
    return aUsuario(fila as FilaPerfil);
  }

  async function cambiarEstadoUsuario(actor: Usuario, id: string, activo: boolean): Promise<Usuario> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede activar o desactivar usuarios.');
    exigir(id !== actor.id, 'No puedes desactivar tu propio usuario.');
    const fila = await ok(sb.from('perfiles').update({ activo }).eq('id', id).select('*').single());
    return aUsuario(fila as FilaPerfil);
  }

  async function restablecerClave(_actor: Usuario, _id: string, _nueva: string): Promise<void> {
    throw new ErrorNegocio('En esta versión las contraseñas se restablecen con un código.');
  }

  // ===== Registro diario =====

  async function obtenerRegistro(actor: Usuario, comercialId: string, fecha: FechaISO): Promise<Registro | null> {
    exigir(perm.puedeVerComercial(actor, comercialId), 'No tienes permiso para ver la actividad de otro comercial.');
    const fila = await ok(sb.from('registros').select('*, registros_historial(*)').eq('user_id', comercialId).eq('fecha', fecha).maybeSingle());
    return fila ? aRegistro(fila as FilaRegistro) : null;
  }

  async function listarRegistros(actor: Usuario, comercialId: string, desde?: FechaISO, hasta?: FechaISO): Promise<Registro[]> {
    exigir(perm.puedeVerComercial(actor, comercialId), 'No tienes permiso para ver la actividad de otro comercial.');
    const filas = await todas<FilaRegistro>((d, h) => {
      let q = sb.from('registros').select('*').eq('user_id', comercialId);
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q.order('fecha').range(d, h);
    });
    return filas.map(aRegistro);
  }

  async function guardarRegistro(actor: Usuario, comercialId: string, fecha: FechaISO, valores: Partial<Valores>): Promise<Registro> {
    exigir(F.esFechaValida(fecha), 'Fecha no válida.');
    const h = hoy();
    exigir(fecha <= h, 'No se puede registrar actividad en fechas futuras.');
    if (!perm.puedeEditarRegistro(actor, comercialId, fecha, h)) {
      exigir(actor.id === comercialId, 'Solo puedes registrar tu propia actividad.');
      throw new ErrorNegocio('Solo puedes registrar o modificar la actividad del día de hoy. Para corregir un día anterior, comunícate con el administrador.');
    }
    const limpios: Valores = {};
    for (const ind of C.INDICADORES_BASE) {
      const bruto: unknown = valores?.[ind.id];
      const n = bruto === '' || bruto === null || bruto === undefined ? 0 : Number(bruto);
      exigir(Number.isInteger(n) && n >= 0 && n <= MAX_VALOR_REGISTRO, `"${ind.nombre}" debe ser un número entero entre 0 y ${MAX_VALOR_REGISTRO}.`);
      limpios[ind.id] = n;
    }
    // El servidor calcula: día excepcional, autor, fechas, corrección, historial y notificación.
    const fila = await ok(sb.from('registros')
      .upsert({ user_id: comercialId, fecha, valores: limpios }, { onConflict: 'user_id,fecha' })
      .select('*, registros_historial(*)')
      .single());
    return aRegistro(fila as FilaRegistro);
  }

  // ===== Metas =====

  async function listarMetas(actor: Usuario, comercialId: string): Promise<Meta[]> {
    exigir(perm.puedeVerComercial(actor, comercialId), 'No tienes permiso para ver las metas de otro comercial.');
    const filas = await todas<FilaMeta>((d, h) => sb.from('metas').select('*').eq('user_id', comercialId).order('desde').range(d, h));
    return filas.map(aMeta);
  }

  async function definirMeta(actor: Usuario, { userId, indicador, periodicidad, valor, desde }: DatosMeta): Promise<Meta> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede configurar metas.');
    const v = Number(valor);
    exigir(Number.isFinite(v) && v > 0 && v <= MAX_VALOR_META, 'La meta debe ser un número mayor que cero.');
    exigir(F.esFechaValida(desde), 'Indica una fecha de inicio válida.');
    const fila = await ok(sb.rpc('definir_meta', {
      p_user_id: userId, p_indicador: indicador, p_periodicidad: periodicidad, p_valor: v, p_desde: desde,
    }).single());
    return aMeta(fila as FilaMeta);
  }

  async function finalizarMeta(actor: Usuario, metaId: string): Promise<'eliminada' | 'finalizada'> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede configurar metas.');
    return (await ok(sb.rpc('finalizar_meta', { p_meta_id: metaId }))) as 'eliminada' | 'finalizada';
  }

  // ===== Evaluación =====

  async function datosComercial(actor: Usuario, comercialId: string) {
    exigir(perm.puedeVerComercial(actor, comercialId), 'No tienes permiso para ver el desempeño de otro comercial.');
    const [usuario, metas, registros] = await Promise.all([
      obtenerComercial(comercialId),
      listarMetas(actor, comercialId),
      listarRegistros(actor, comercialId),
    ]);
    return { usuario, metas, registros };
  }

  const consultas = crearConsultas({ hoy, datosComercial, listarComerciales: (actor) => listarComerciales(actor) });

  // ===== Notificaciones (administrador) =====

  async function listarNotificaciones(actor: Usuario): Promise<Notificacion[]> {
    exigir(perm.esAdmin(actor), 'Solo el administrador recibe notificaciones.');
    const filas = await todas<FilaNotificacion>((d, h) => sb.from('notificaciones').select('*').order('creado', { ascending: false }).range(d, h));
    return filas.map(aNotificacion);
  }

  async function contarNotificacionesNoLeidas(actor: Usuario): Promise<number> {
    if (!perm.esAdmin(actor)) return 0;
    const { count, error } = await sb.from('notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false);
    if (error) throw traducirError(error);
    return count ?? 0;
  }

  async function marcarNotificacion(actor: Usuario, id: string, leida = true): Promise<Notificacion> {
    exigir(perm.esAdmin(actor), 'Solo el administrador recibe notificaciones.');
    const fila = await ok(sb.from('notificaciones').update({ leida }).eq('id', id).select('*').single());
    return aNotificacion(fila as FilaNotificacion);
  }

  return {
    hoy,
    iniciarSesion, obtenerSesion, cerrarSesion, cambiarMiClave,
    listarUsuarios, listarComerciales, crearUsuario, actualizarUsuario, cambiarEstadoUsuario, restablecerClave,
    obtenerRegistro, listarRegistros, guardarRegistro,
    listarMetas, definirMeta, finalizarMeta,
    ...consultas,
    listarNotificaciones, contarNotificacionesNoLeidas, marcarNotificacion,
    accesoConCodigo: true,
    autorizarAcceso, listarAutorizaciones, cancelarAutorizacion, generarCodigoRestablecer,
    activarCuenta, restablecerConCodigo,
  };
}
