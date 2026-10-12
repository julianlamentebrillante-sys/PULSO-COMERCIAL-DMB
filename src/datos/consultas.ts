/**
 * Consultas de evaluación (desempeño, tendencias, tablero, histórico y alertas).
 * Son iguales para el prototipo local y para Supabase: solo cambia de dónde
 * salen los datos de cada comercial (`datosComercial`).
 */
import * as F from '../core/fechas';
import * as M from '../core/motor';
import type { FechaISO, Meta, Periodo, Registro, TipoPeriodo, Usuario } from '../core/tipos';
import * as perm from './permisos';
import { ErrorNegocio } from './errores';

export const MAX_DIAS_HISTORICO = 3 * 366;
export const MAX_DIAS_AGRUPADO_POR_DIA = 92;

export interface DatosComercial {
  usuario: Usuario;
  metas: Meta[];
  registros: Registro[];
}

export interface FuenteConsultas {
  hoy: () => FechaISO;
  /** Metas y registros de un comercial (valida que el actor pueda verlo). */
  datosComercial: (actor: Usuario, comercialId: string) => Promise<DatosComercial>;
  /** Comerciales activos visibles para el actor. */
  listarComerciales: (actor: Usuario) => Promise<Usuario[]>;
}

function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorNegocio(mensaje);
}

export function crearConsultas({ hoy, datosComercial, listarComerciales }: FuenteConsultas) {
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

  /**
   * Histórico de un comercial o del equipo consolidado ('equipo') en un rango,
   * agrupado por día, semana o mes.
   */
  async function historico(actor: Usuario, objetivo: string, agrupacion: 'dia' | 'semana' | 'mes', ini: FechaISO, fin: FechaISO): Promise<M.Historico> {
    exigir(F.esFechaValida(ini) && F.esFechaValida(fin), 'Indica un rango de fechas válido.');
    exigir(ini <= fin, 'La fecha inicial debe ser anterior o igual a la final.');
    exigir(F.sumarDias(ini, MAX_DIAS_HISTORICO) >= fin, 'El rango máximo de consulta es de 3 años.');
    if (agrupacion === 'dia') exigir(F.sumarDias(ini, MAX_DIAS_AGRUPADO_POR_DIA) >= fin, `Para ver día por día, el rango puede tener máximo ${MAX_DIAS_AGRUPADO_POR_DIA + 1} días. Agrupa por semana o mes.`);
    const h = hoy();
    if (objetivo === 'equipo') {
      const datos = await exigirEquipo(actor);
      exigir(datos.length, 'No hay comerciales activos.');
      return M.consolidarHistoricos(datos.map((d) => M.evaluarHistorico({ ...d, agrupacion, ini, fin, hoy: h }))) as M.Historico;
    }
    const d = await datosComercial(actor, objetivo);
    return M.evaluarHistorico({ ...d, agrupacion, ini, fin, hoy: h });
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

  return { evaluar, serie, evaluarEquipo, serieEquipo, historico, alertas };
}
