/**
 * Servicios de negocio.
 *
 * Toda operación pasa por aquí y se valida contra el usuario que la ejecuta ("actor").
 * Las pantallas nunca hablan directamente con el repositorio.
 */
import * as F from '../core/fechas';
import * as C from '../core/catalogo';
import * as M from '../core/motor';
import type { FechaISO, Meta, Periodicidad, Periodo, Registro, Rol, TipoPeriodo, Usuario, UsuarioGuardado, Valores } from '../core/tipos';
import * as perm from './permisos';
import { generarId, type Repositorio } from './repositorio';

export const MAX_VALOR_REGISTRO = 9999;
export const MAX_VALOR_META = 99999;
export const MIN_LONGITUD_CLAVE = 6;

export class ErrorNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}

function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorNegocio(mensaje);
}

// ---------- Contraseñas (SOLO PROTOTIPO) ----------
// Hash simple para no guardar contraseñas en texto plano en el navegador.
// No es seguridad real: en producción la autenticación la hace Supabase Auth.
export function hashClave(clave: string, sal: string): string {
  const texto = `${sal}:${clave}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let ronda = 0; ronda < 500; ronda++) {
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822519);
    }
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

function normalizarUsuario(usuario: unknown): string {
  return String(usuario ?? '').trim().toLowerCase();
}

/** Quita los datos sensibles antes de entregar un usuario a la interfaz. */
function limpiar(u: UsuarioGuardado): Usuario {
  const { claveHash: _h, sal: _s, ...resto } = u;
  return resto;
}

export interface DatosUsuario {
  nombre: string;
  usuario: string;
  roles: Rol[];
  fechaInicio: FechaISO;
  clave?: string;
}

export interface DatosMeta {
  userId: string;
  indicador: string;
  periodicidad: Periodicidad;
  valor: number;
  desde: FechaISO;
}

export type Servicios = ReturnType<typeof crearServicios>;

/**
 * @param repo  almacenamiento (local o Supabase)
 * @param reloj devuelve la fecha de "hoy" (Bogotá, o la fecha simulada en pruebas)
 */
export function crearServicios(repo: Repositorio, reloj: () => FechaISO) {
  const hoy = () => reloj();
  const ahora = () => new Date().toISOString();

  async function obtenerComercial(id: string): Promise<UsuarioGuardado> {
    const c = await repo.obtenerUsuario(id);
    exigir(c && perm.esComercial(c), 'El usuario indicado no es un comercial.');
    return c;
  }

  // ===== Sesión =====

  async function iniciarSesion(usuario: string, clave: string): Promise<Usuario> {
    const u = await repo.buscarUsuarioPorNombre(normalizarUsuario(usuario));
    exigir(u && u.claveHash === hashClave(String(clave ?? ''), u.sal), 'Usuario o contraseña incorrectos.');
    exigir(u.activo, 'Este usuario está inactivo. Comunícate con el administrador.');
    return limpiar(u);
  }

  async function obtenerSesion(id: string): Promise<Usuario | null> {
    const u = await repo.obtenerUsuario(id);
    return u && u.activo ? limpiar(u) : null;
  }

  async function cambiarMiClave(actor: Usuario, actual: string, nueva: string): Promise<void> {
    const u = await repo.obtenerUsuario(actor.id);
    exigir(u && u.claveHash === hashClave(String(actual ?? ''), u.sal), 'La contraseña actual no es correcta.');
    exigir(String(nueva ?? '').length >= MIN_LONGITUD_CLAVE, `La nueva contraseña debe tener al menos ${MIN_LONGITUD_CLAVE} caracteres.`);
    const sal = generarId('sal');
    await repo.actualizarUsuario(actor.id, { sal, claveHash: hashClave(nueva, sal) });
  }

  // ===== Usuarios y equipo comercial =====

  function validarDatosUsuario(datos: DatosUsuario) {
    const nombre = String(datos.nombre ?? '').trim();
    const usuario = normalizarUsuario(datos.usuario);
    const roles = [...new Set(datos.roles ?? [])];
    exigir(nombre.length >= 2, 'Escribe el nombre de la persona.');
    exigir(/^[a-z0-9._-]{3,30}$/.test(usuario), 'El usuario debe tener entre 3 y 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
    exigir(roles.length > 0, 'Selecciona al menos un rol.');
    exigir(roles.every((r) => perm.ROLES.some((x) => x.id === r)), 'Rol no válido.');
    exigir(F.esFechaValida(datos.fechaInicio), 'Indica una fecha de inicio válida.');
    return { nombre, usuario, roles, fechaInicio: datos.fechaInicio };
  }

  async function listarUsuarios(actor: Usuario): Promise<Usuario[]> {
    const todos = (await repo.listarUsuarios()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (perm.esAdmin(actor)) return todos.map(limpiar);
    if (perm.veEquipo(actor)) return todos.filter((u) => perm.esComercial(u) || u.id === actor.id).map(limpiar);
    return todos.filter((u) => u.id === actor.id).map(limpiar);
  }

  async function listarComerciales(actor: Usuario, { incluirInactivos = false } = {}): Promise<Usuario[]> {
    return (await listarUsuarios(actor)).filter((u) => perm.esComercial(u) && (incluirInactivos || u.activo));
  }

  async function crearUsuario(actor: Usuario, datos: DatosUsuario): Promise<Usuario> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede crear usuarios.');
    const v = validarDatosUsuario(datos);
    exigir(!(await repo.buscarUsuarioPorNombre(v.usuario)), 'Ya existe una persona con ese usuario de acceso.');
    exigir(String(datos.clave ?? '').length >= MIN_LONGITUD_CLAVE, `La contraseña debe tener al menos ${MIN_LONGITUD_CLAVE} caracteres.`);
    const sal = generarId('sal');
    const u = await repo.crearUsuario({
      ...v, activo: true, sal, claveHash: hashClave(datos.clave ?? '', sal), creado: ahora(), creadoPor: actor.id,
    });
    return limpiar(u);
  }

  async function actualizarUsuario(actor: Usuario, id: string, datos: DatosUsuario): Promise<Usuario> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede editar usuarios.');
    exigir(await repo.obtenerUsuario(id), 'Usuario no encontrado.');
    const v = validarDatosUsuario(datos);
    const otro = await repo.buscarUsuarioPorNombre(v.usuario);
    exigir(!otro || otro.id === id, 'Ya existe una persona con ese usuario de acceso.');
    if (id === actor.id) exigir(v.roles.includes('admin'), 'No puedes quitarte a ti mismo el rol de administrador.');
    return limpiar(await repo.actualizarUsuario(id, v));
  }

  async function cambiarEstadoUsuario(actor: Usuario, id: string, activo: boolean): Promise<Usuario> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede activar o desactivar usuarios.');
    exigir(id !== actor.id, 'No puedes desactivar tu propio usuario.');
    exigir(await repo.obtenerUsuario(id), 'Usuario no encontrado.');
    return limpiar(await repo.actualizarUsuario(id, { activo, inactivoDesde: activo ? null : hoy() }));
  }

  async function restablecerClave(actor: Usuario, id: string, nueva: string): Promise<void> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede restablecer contraseñas.');
    exigir(String(nueva ?? '').length >= MIN_LONGITUD_CLAVE, `La contraseña debe tener al menos ${MIN_LONGITUD_CLAVE} caracteres.`);
    const sal = generarId('sal');
    await repo.actualizarUsuario(id, { sal, claveHash: hashClave(nueva, sal) });
  }

  // ===== Registro diario =====

  async function obtenerRegistro(actor: Usuario, comercialId: string, fecha: FechaISO): Promise<Registro | null> {
    exigir(perm.puedeVerComercial(actor, comercialId), 'No tienes permiso para ver la actividad de otro comercial.');
    return repo.obtenerRegistro(comercialId, fecha);
  }

  async function listarRegistros(actor: Usuario, comercialId: string, desde?: FechaISO, hasta?: FechaISO): Promise<Registro[]> {
    exigir(perm.puedeVerComercial(actor, comercialId), 'No tienes permiso para ver la actividad de otro comercial.');
    return repo.listarRegistros({ userId: comercialId, desde, hasta });
  }

  async function guardarRegistro(actor: Usuario, comercialId: string, fecha: FechaISO, valores: Partial<Valores>): Promise<Registro> {
    const comercial = await obtenerComercial(comercialId);
    exigir(F.esFechaValida(fecha), 'Fecha no válida.');
    const h = hoy();
    exigir(fecha <= h, 'No se puede registrar actividad en fechas futuras.');
    if (!perm.puedeEditarRegistro(actor, comercialId, fecha, h)) {
      exigir(actor.id === comercialId, 'Solo puedes registrar tu propia actividad.');
      throw new ErrorNegocio('Solo puedes registrar o modificar la actividad del día de hoy. Para corregir un día anterior, comunícate con el administrador.');
    }
    exigir(comercial.activo || perm.esAdmin(actor), 'El comercial está inactivo.');

    const limpios: Valores = {};
    for (const ind of C.INDICADORES_BASE) {
      const bruto: unknown = valores?.[ind.id];
      const n = bruto === '' || bruto === null || bruto === undefined ? 0 : Number(bruto);
      exigir(Number.isInteger(n) && n >= 0 && n <= MAX_VALOR_REGISTRO,
        `"${ind.nombre}" debe ser un número entero entre 0 y ${MAX_VALOR_REGISTRO}.`);
      limpios[ind.id] = n;
    }

    const previo = await repo.obtenerRegistro(comercialId, fecha);
    const excepcional = !F.esHabil(fecha);
    const momento = ahora();
    const esCorreccion = actor.id !== comercialId || fecha !== h;
    const registro = await repo.guardarRegistro({
      userId: comercialId,
      fecha,
      valores: limpios,
      excepcional,
      creado: previo ? previo.creado : momento,
      actualizado: momento,
      actualizadoPor: actor.id,
      corregidoPorAdmin: !!previo?.corregidoPorAdmin || esCorreccion,
      historial: [...(previo?.historial ?? []), {
        momento, por: actor.id, accion: previo ? 'editado' : 'creado', correccion: esCorreccion,
      }],
    });

    // Registrar en sábado, domingo o festivo es excepcional: se notifica al administrador.
    if (!previo && excepcional && !perm.esAdmin(actor)) {
      await repo.crearNotificacion({
        tipo: 'registro_excepcional', userId: comercialId, fecha,
        motivo: F.motivoNoHabil(fecha), creado: momento, leida: false,
      });
    }
    return registro;
  }

  // ===== Metas =====

  async function listarMetas(actor: Usuario, comercialId: string): Promise<Meta[]> {
    exigir(perm.puedeVerComercial(actor, comercialId), 'No tienes permiso para ver las metas de otro comercial.');
    return repo.listarMetas({ userId: comercialId });
  }

  /**
   * Define una meta nueva para (comercial, indicador, periodicidad) desde una fecha.
   * - La meta anterior NO se modifica: se cierra su vigencia el día anterior.
   * - Si ya existen metas para esa combinación, la nueva solo puede empezar hoy o
   *   después (protege el histórico). La primera meta sí puede empezar en el pasado.
   * - Si ya hay una meta que empieza exactamente ese día, se actualiza su valor.
   */
  async function definirMeta(actor: Usuario, { userId, indicador, periodicidad, valor, desde }: DatosMeta): Promise<Meta> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede configurar metas.');
    await obtenerComercial(userId);
    const item = C.buscar(indicador);
    exigir(item, 'Indicador no válido.');
    if (item.tipo === 'ratio') {
      exigir(periodicidad === C.PERIODICIDAD_UMBRAL, 'Los ratios usan un umbral, no una periodicidad.');
    } else {
      exigir(C.PERIODICIDADES.some((p) => p.id === periodicidad), 'Periodicidad no válida.');
    }
    const v = Number(valor);
    exigir(Number.isFinite(v) && v > 0 && v <= MAX_VALOR_META, 'La meta debe ser un número mayor que cero.');
    exigir(F.esFechaValida(desde), 'Indica una fecha de inicio válida.');

    const h = hoy();
    const existentes = (await repo.listarMetas({ userId }))
      .filter((m) => m.indicador === indicador && m.periodicidad === periodicidad)
      .sort((a, b) => (a.desde < b.desde ? -1 : 1));
    if (existentes.length) {
      exigir(desde >= h, 'Para proteger el histórico, una nueva meta solo puede empezar a regir desde hoy o una fecha futura.');
    }

    const mismaFecha = existentes.find((m) => m.desde === desde);
    if (mismaFecha) {
      return repo.actualizarMeta(mismaFecha.id, { valor: v, actualizado: ahora(), actualizadoPor: actor.id });
    }

    const anterior = existentes.filter((m) => m.desde < desde).pop();
    const siguiente = existentes.find((m) => m.desde > desde);
    if (anterior && (!anterior.hasta || anterior.hasta >= desde)) {
      await repo.actualizarMeta(anterior.id, { hasta: F.sumarDias(desde, -1) });
    }
    return repo.crearMeta({
      userId, indicador, periodicidad, valor: v, desde,
      hasta: siguiente ? F.sumarDias(siguiente.desde, -1) : null,
      creado: ahora(), creadoPor: actor.id,
    });
  }

  /** Finaliza una meta: si aún no ha empezado a regir se elimina; si no, se cierra ayer. */
  async function finalizarMeta(actor: Usuario, metaId: string): Promise<'eliminada' | 'finalizada'> {
    exigir(perm.esAdmin(actor), 'Solo el administrador puede configurar metas.');
    const m = await repo.obtenerMeta(metaId);
    exigir(m, 'Meta no encontrada.');
    const h = hoy();
    if (m.desde >= h) {
      await repo.eliminarMeta(metaId);
      return 'eliminada';
    }
    exigir(!m.hasta || m.hasta >= h, 'Esta meta ya no está vigente.');
    await repo.actualizarMeta(metaId, { hasta: F.sumarDias(h, -1) });
    return 'finalizada';
  }

  // ===== Evaluación y alertas =====

  async function datosComercial(actor: Usuario, comercialId: string) {
    exigir(perm.puedeVerComercial(actor, comercialId), 'No tienes permiso para ver el desempeño de otro comercial.');
    const usuario = limpiar(await obtenerComercial(comercialId));
    const [metas, registros] = await Promise.all([
      repo.listarMetas({ userId: comercialId }),
      repo.listarRegistros({ userId: comercialId }),
    ]);
    return { usuario, metas, registros };
  }

  async function evaluar(actor: Usuario, comercialId: string, tipo: TipoPeriodo, periodo: Pick<Periodo, 'ini' | 'fin'>): Promise<M.Evaluacion> {
    const d = await datosComercial(actor, comercialId);
    return M.evaluarPeriodo({ ...d, tipo, periodo, hoy: hoy() });
  }

  /** Tendencia de un comercial: los últimos `n` periodos hasta el que contiene `fecha`. */
  async function serie(actor: Usuario, comercialId: string, tipo: 'dia' | 'semana' | 'mes', fecha: FechaISO, n: number): Promise<M.Evaluacion[]> {
    const d = await datosComercial(actor, comercialId);
    return M.evaluarSerie({ ...d, tipo, fecha, n, hoy: hoy() });
  }

  async function exigirEquipo(actor: Usuario) {
    exigir(perm.veEquipo(actor), 'Solo el administrador y la dirección comercial ven al equipo completo.');
    const comerciales = await listarComerciales(actor);
    return Promise.all(comerciales.map((c) => datosComercial(actor, c.id)));
  }

  /** Tablero del equipo: evaluación de cada comercial activo y el consolidado. */
  async function evaluarEquipo(actor: Usuario, tipo: TipoPeriodo, periodo: Pick<Periodo, 'ini' | 'fin'>) {
    const datos = await exigirEquipo(actor);
    const h = hoy();
    const filas = datos.map((d) => ({
      comercial: d.usuario,
      evaluacion: M.evaluarPeriodo({ ...d, tipo, periodo, hoy: h }),
      registroHoy: d.registros.some((r) => r.fecha === h),
    }));
    return { filas, equipo: M.consolidarEquipo(filas.map((f) => f.evaluacion)) };
  }

  /** Tendencia del equipo: serie de cada comercial activo y la consolidada. */
  async function serieEquipo(actor: Usuario, tipo: 'dia' | 'semana' | 'mes', fecha: FechaISO, n: number) {
    const datos = await exigirEquipo(actor);
    const h = hoy();
    const porComercial = datos.map((d) => ({ comercial: d.usuario, serie: M.evaluarSerie({ ...d, tipo, fecha, n, hoy: h }) }));
    const periodos = F.periodosHasta(tipo, fecha, n);
    const equipo = periodos.map((_, i) => M.consolidarEquipo(porComercial.map((p) => p.serie[i])));
    return { periodos, porComercial, equipo };
  }

  async function alertas(actor: Usuario, comercialId?: string): Promise<M.Alerta[]> {
    const ids = comercialId ? [comercialId] : (await listarComerciales(actor)).map((c) => c.id);
    const out: M.Alerta[] = [];
    for (const id of ids) {
      const d = await datosComercial(actor, id);
      out.push(...M.generarAlertas({ ...d, hoy: hoy() }));
    }
    return out;
  }

  // ===== Notificaciones (administrador) =====

  async function listarNotificaciones(actor: Usuario) {
    exigir(perm.esAdmin(actor), 'Solo el administrador recibe notificaciones.');
    return repo.listarNotificaciones();
  }

  async function contarNotificacionesNoLeidas(actor: Usuario): Promise<number> {
    if (!perm.esAdmin(actor)) return 0;
    return (await repo.listarNotificaciones()).filter((n) => !n.leida).length;
  }

  async function marcarNotificacion(actor: Usuario, id: string, leida = true) {
    exigir(perm.esAdmin(actor), 'Solo el administrador recibe notificaciones.');
    return repo.actualizarNotificacion(id, { leida });
  }

  return {
    hoy,
    iniciarSesion, obtenerSesion, cambiarMiClave,
    listarUsuarios, listarComerciales, crearUsuario, actualizarUsuario, cambiarEstadoUsuario, restablecerClave,
    obtenerRegistro, listarRegistros, guardarRegistro,
    listarMetas, definirMeta, finalizarMeta,
    evaluar, serie, evaluarEquipo, serieEquipo, alertas,
    listarNotificaciones, contarNotificacionesNoLeidas, marcarNotificacion,
  };
}
