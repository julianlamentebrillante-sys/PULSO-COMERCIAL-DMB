/**
 * Motor de cálculo.
 *
 * Funciones puras: reciben metas y registros de UN comercial y devuelven resultados.
 * No leen ni escriben datos, por eso se prueban de forma aislada y funcionan igual
 * con el almacenamiento local o con Supabase.
 *
 * Conceptos clave
 * ---------------
 * - Corte de evaluación: la evaluación llega hasta el día ANTERIOR a hoy.
 *   El día en curso se muestra "en curso" y nunca genera semáforo rojo.
 * - Aporte diario de una meta: cada meta reparte su valor entre los días hábiles
 *   de su periodo. Meta semanal 10 en una semana de 5 días hábiles = 2 por día;
 *   en una semana con festivo (4 días) = 2,5 por día. Así:
 *     · Meta del periodo   = suma de aportes de todos los días hábiles del periodo.
 *     · Avance esperado    = suma de aportes de los días hábiles hasta el corte.
 *     · Un cambio de meta a mitad de periodo se prorratea solo, y los periodos
 *       anteriores siguen usando la meta que estaba vigente (histórico intacto).
 * - Semáforo: Realizado ÷ Avance esperado × 100 → verde ≥ 100, amarillo ≥ 70, rojo < 70.
 * - Meta derivada: si la vista no tiene meta con su misma periodicidad, se usa otra
 *   como referencia (p. ej. semana sin meta semanal → suma de metas diarias).
 *   Las ALERTAS, en cambio, solo usan metas configuradas explícitamente para su periodo.
 */
import * as F from './fechas';
import * as C from './catalogo';
import type { Estado, FechaISO, Meta, Periodicidad, Periodo, Registro, TipoPeriodo, Usuario, Valores } from './tipos';

export const UMBRAL_VERDE = 100;
export const UMBRAL_AMARILLO = 70;
const VENTANA_DIAS_SIN_REGISTRO = 30;

const TIPO_PERIODO: Record<string, TipoPeriodo> = { diaria: 'dia', semanal: 'semana', mensual: 'mes' };

/** Orden en que se busca meta para cada tipo de vista. */
export const PRIORIDAD: Record<TipoPeriodo, Periodicidad[]> = {
  dia: ['diaria', 'semanal', 'mensual'],
  semana: ['semanal', 'diaria', 'mensual'],
  mes: ['mensual', 'semanal', 'diaria'],
  anio: ['mensual', 'semanal', 'diaria'],
  rango: ['mensual', 'semanal', 'diaria'],
};

/** Para alertas: solo metas configuradas explícitamente con esa periodicidad. */
export const PRIORIDAD_ALERTAS = {
  dia: ['diaria'] as Periodicidad[],
  semana: ['semanal'] as Periodicidad[],
  mes: ['mensual'] as Periodicidad[],
};

export function redondear(n: number, decimales: number): number {
  const f = Math.pow(10, decimales);
  return Math.round(n * f) / f;
}

/** Porcentaje redondeado a 4 decimales para evitar errores de coma flotante en los umbrales. */
export function porcentaje(parte: number, total: number): number | null {
  return total > 0 ? redondear((parte / total) * 100, 4) : null;
}

export function semaforo(pct: number | null | undefined): Estado {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 'sin_meta';
  if (pct >= UMBRAL_VERDE) return 'verde';
  if (pct >= UMBRAL_AMARILLO) return 'amarillo';
  return 'rojo';
}

// ---------- Registros ----------

function sumasVacias(): Valores {
  return Object.fromEntries(C.INDICADORES.map((i) => [i.id, 0]));
}

/** Suma los registros (de un comercial) entre ini y fin, incluyendo totales calculados. */
export function sumarRegistros(registros: Registro[], ini: FechaISO, fin: FechaISO): Valores {
  const suma = sumasVacias();
  if (ini > fin) return suma;
  for (const r of registros) {
    if (r.fecha < ini || r.fecha > fin) continue;
    const v = C.calcularTotales(r.valores);
    for (const id in suma) suma[id] += v[id];
  }
  return suma;
}

/** Días hábiles sin registro, desde la fecha de inicio del comercial. */
export function diasSinRegistro(usuario: Pick<Usuario, 'fechaInicio'> | null, registros: Registro[], ini: FechaISO, fin: FechaISO): FechaISO[] {
  const desde = usuario?.fechaInicio ? F.mayor(ini, usuario.fechaInicio) : ini;
  if (desde > fin) return [];
  const conRegistro = new Set(registros.map((r) => r.fecha));
  return F.diasHabiles(desde, fin).filter((f) => !conRegistro.has(f));
}

// ---------- Metas ----------

export function metaVigente(metas: Meta[], indicador: string, periodicidad: Periodicidad, fecha: FechaISO): Meta | null {
  return metas.find((m) => m.indicador === indicador && m.periodicidad === periodicidad
    && m.desde <= fecha && (!m.hasta || m.hasta >= fecha)) ?? null;
}

/** Parte de la meta que corresponde a un día hábil concreto. */
export function aporteDiario(meta: Meta, fecha: FechaISO): number {
  if (!F.esHabil(fecha)) return 0;
  if (meta.periodicidad === 'diaria') return meta.valor;
  const tipo = TIPO_PERIODO[meta.periodicidad];
  if (tipo !== 'semana' && tipo !== 'mes') return 0;
  const per = F.periodo(tipo, fecha);
  const n = F.contarDiasHabiles(per.ini, per.fin);
  return n > 0 ? meta.valor / n : 0;
}

/** Meta de un indicador en un rango, día a día, según el orden de prioridad. */
export function metaDelPeriodo(metas: Meta[], indicador: string, ini: FechaISO, fin: FechaISO, prioridad: Periodicidad[]) {
  let total = 0;
  const porDia: Record<FechaISO, number> = {};
  const fuentes = new Set<Periodicidad>();
  for (const f of F.diasHabiles(ini, fin)) {
    for (const p of prioridad) {
      const m = metaVigente(metas, indicador, p, f);
      if (m) {
        const aporte = aporteDiario(m, f);
        porDia[f] = aporte;
        total += aporte;
        fuentes.add(p);
        break;
      }
    }
  }
  return { total: redondear(total, 6), porDia, fuentes: [...fuentes] };
}

// ---------- Evaluación ----------

export interface ResultadoIndicador {
  id: string;
  tipo: 'base' | 'total';
  /** Meta total del periodo (null si no hay meta). */
  meta: number | null;
  /** Avance esperado al corte (null si no hay meta o el periodo no ha empezado a evaluarse). */
  esperado: number | null;
  /** Realizado hasta el corte (ayer). */
  realizado: number;
  /** Realizado incluyendo hoy. */
  realizadoActual: number;
  /** Realizado ÷ esperado × 100: base del semáforo. */
  cumplimientoEsperado: number | null;
  /** Realizado ÷ meta total × 100. */
  cumplimientoMeta: number | null;
  /** Realizado incluyendo hoy ÷ meta total × 100. */
  avanceActual: number | null;
  diferenciaMeta: number | null;
  diferenciaEsperado: number | null;
  fuentes: Periodicidad[];
  metaDerivada: boolean;
  estado: Estado;
}

export interface ResultadoRatio {
  id: string;
  tipo: 'ratio';
  numerador: number;
  denominador: number;
  /** Valor del ratio en porcentaje. */
  valor: number | null;
  /** Umbral mínimo en porcentaje. */
  umbral: number | null;
  cumplimiento: number | null;
  estado: Estado;
}

export interface Evaluacion {
  tipo: TipoPeriodo;
  periodo: Periodo;
  hoy: FechaISO;
  corte: FechaISO;
  /** Último día evaluado del periodo; null si el periodo aún no tiene días evaluables. */
  evalFin: FechaISO | null;
  diasHabiles: number;
  diasHabilesTranscurridos: number;
  avanceEsperado: number | null;
  diasSinRegistro: FechaISO[];
  diasExcepcionales: FechaISO[];
  indicadores: ResultadoIndicador[];
  ratios: ResultadoRatio[];
  resumen: Record<Estado, number>;
}

interface Contexto {
  metas: Meta[];
  tipo: TipoPeriodo;
  periodo: Periodo;
  evalFin: FechaISO | null;
  hoy: FechaISO;
  prioridad: Periodicidad[];
  sumasCorte: Valores;
  sumasActual: Valores;
}

function evaluarIndicador(ind: C.Indicador, ctx: Contexto): ResultadoIndicador {
  const m = metaDelPeriodo(ctx.metas, ind.id, ctx.periodo.ini, ctx.periodo.fin, ctx.prioridad);
  let esperado = 0;
  if (ctx.evalFin) {
    for (const f in m.porDia) if (f <= ctx.evalFin) esperado += m.porDia[f];
  }
  esperado = redondear(esperado, 6);

  const realizado = ctx.sumasCorte[ind.id];
  const realizadoActual = ctx.sumasActual[ind.id];
  const tieneMeta = m.total > 0;

  let estado: Estado = 'sin_meta';
  let cumplimientoEsperado: number | null = null;
  if (tieneMeta) {
    if (ctx.evalFin && esperado > 0) {
      cumplimientoEsperado = porcentaje(realizado, esperado);
      estado = semaforo(cumplimientoEsperado);
    } else {
      estado = 'en_curso';
    }
  }

  return {
    id: ind.id,
    tipo: ind.tipo,
    meta: tieneMeta ? m.total : null,
    esperado: tieneMeta && ctx.evalFin ? esperado : null,
    realizado,
    realizadoActual,
    cumplimientoEsperado,
    cumplimientoMeta: tieneMeta ? porcentaje(realizado, m.total) : null,
    avanceActual: tieneMeta ? porcentaje(realizadoActual, m.total) : null,
    diferenciaMeta: tieneMeta ? redondear(realizado - m.total, 2) : null,
    diferenciaEsperado: tieneMeta && ctx.evalFin ? redondear(realizado - esperado, 2) : null,
    fuentes: m.fuentes,
    metaDerivada: tieneMeta && m.fuentes.some((f) => TIPO_PERIODO[f] !== ctx.tipo),
    estado,
  };
}

function evaluarRatio(r: C.Ratio, ctx: Contexto): ResultadoRatio {
  const enCurso = !ctx.evalFin;
  const sumas = enCurso ? ctx.sumasActual : ctx.sumasCorte;
  const numerador = sumas[r.numerador];
  const denominador = sumas[r.denominador];
  const valor = denominador > 0 ? porcentaje(numerador, denominador) : null;
  const fechaUmbral = ctx.evalFin ?? F.menor(ctx.periodo.fin, ctx.hoy);
  const meta = metaVigente(ctx.metas, r.id, C.PERIODICIDAD_UMBRAL, fechaUmbral);
  const umbral = meta ? meta.valor : null;

  let estado: Estado;
  let cumplimiento: number | null = null;
  if (umbral === null) estado = 'sin_meta';
  else if (valor === null) estado = 'sin_datos';
  else if (enCurso) estado = 'en_curso';
  else {
    cumplimiento = porcentaje(valor, umbral);
    estado = semaforo(cumplimiento);
  }
  return { id: r.id, tipo: 'ratio', numerador, denominador, valor, umbral, cumplimiento, estado };
}

function resumirEstados(items: { estado: Estado }[]): Record<Estado, number> {
  const r: Record<Estado, number> = { verde: 0, amarillo: 0, rojo: 0, en_curso: 0, sin_meta: 0, sin_datos: 0 };
  for (const i of items) r[i.estado] += 1;
  return r;
}

export interface ParametrosEvaluacion {
  /** Comercial evaluado (se usa su fecha de inicio). */
  usuario: Pick<Usuario, 'fechaInicio'> | null;
  /** Metas de ese comercial. */
  metas: Meta[];
  /** Registros diarios de ese comercial. */
  registros: Registro[];
  tipo: TipoPeriodo;
  periodo: Pick<Periodo, 'ini' | 'fin'>;
  /** Fecha actual (Bogotá). */
  hoy: FechaISO;
  /** Último día evaluado; por defecto, ayer. */
  corte?: FechaISO;
  /** Orden de búsqueda de metas; por defecto, el del tipo de vista. */
  prioridad?: Periodicidad[];
}

/** Evalúa un periodo completo para un comercial. */
export function evaluarPeriodo({ usuario, metas, registros, tipo, periodo, hoy, corte, prioridad }: ParametrosEvaluacion): Evaluacion {
  const fechaCorte = corte ?? F.sumarDias(hoy, -1);
  const evalFin = fechaCorte >= periodo.ini ? F.menor(periodo.fin, fechaCorte) : null;
  const finActual = F.menor(periodo.fin, hoy);
  const per: Periodo = { tipo, ini: periodo.ini, fin: periodo.fin };

  const ctx: Contexto = {
    metas, tipo, periodo: per, evalFin, hoy,
    prioridad: prioridad ?? PRIORIDAD[tipo],
    sumasCorte: evalFin ? sumarRegistros(registros, per.ini, evalFin) : sumasVacias(),
    sumasActual: sumarRegistros(registros, per.ini, finActual),
  };

  const total = F.contarDiasHabiles(per.ini, per.fin);
  const transcurridos = evalFin ? F.contarDiasHabiles(per.ini, evalFin) : 0;
  const indicadores = C.INDICADORES.map((i) => evaluarIndicador(i, ctx));
  const ratios = C.RATIOS.map((r) => evaluarRatio(r, ctx));

  return {
    tipo,
    periodo: per,
    hoy,
    corte: fechaCorte,
    evalFin,
    diasHabiles: total,
    diasHabilesTranscurridos: transcurridos,
    avanceEsperado: porcentaje(transcurridos, total),
    diasSinRegistro: evalFin ? diasSinRegistro(usuario, registros, per.ini, evalFin) : [],
    diasExcepcionales: registros
      .filter((r) => r.fecha >= per.ini && r.fecha <= finActual && !F.esHabil(r.fecha))
      .map((r) => r.fecha),
    indicadores,
    ratios,
    resumen: resumirEstados([...indicadores, ...ratios]),
  };
}

// ---------- Índice, consolidado de equipo y series ----------

/** Tope por indicador en el índice: sobrecumplir uno no tapa la brecha de otro. */
export const TOPE_INDICE = 100;

/**
 * Índice de cumplimiento: promedio del cumplimiento vs esperado de los indicadores
 * con meta evaluada, cada uno topado en 100 %. null si no hay nada que evaluar.
 */
export function indiceCumplimiento(ev: Evaluacion): number | null {
  const valores = ev.indicadores
    .filter((i) => i.cumplimientoEsperado !== null)
    .map((i) => Math.min(i.cumplimientoEsperado as number, TOPE_INDICE));
  if (!valores.length) return null;
  return redondear(valores.reduce((a, b) => a + b, 0) / valores.length, 4);
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Consolida las evaluaciones de varios comerciales (mismo periodo) en una del equipo.
 * - Meta y esperado del equipo = suma de las de cada comercial.
 * - El cumplimiento solo compara lo realizado por quienes tienen meta en ese indicador.
 * - Ratios: se recalculan con numeradores y denominadores sumados; el umbral es el promedio.
 */
export function consolidarEquipo(evs: Evaluacion[]): Evaluacion | null {
  if (!evs.length) return null;
  const base = evs[0];

  const indicadores = C.INDICADORES.map((ind): ResultadoIndicador => {
    const rs = evs.map((e) => e.indicadores.find((i) => i.id === ind.id) as ResultadoIndicador);
    const conMeta = rs.filter((r) => r.meta !== null);
    const evaluables = conMeta.filter((r) => r.esperado !== null);
    const meta = conMeta.length ? redondear(suma(conMeta.map((r) => r.meta as number)), 6) : null;
    const esperado = evaluables.length ? redondear(suma(evaluables.map((r) => r.esperado as number)), 6) : null;
    const realizadoEvaluable = suma(evaluables.map((r) => r.realizado));
    const realizadoConMeta = suma(conMeta.map((r) => r.realizado));

    let estado: Estado = 'sin_meta';
    let cumplimientoEsperado: number | null = null;
    if (conMeta.length) {
      if (esperado !== null && esperado > 0) {
        cumplimientoEsperado = porcentaje(realizadoEvaluable, esperado);
        estado = semaforo(cumplimientoEsperado);
      } else {
        estado = 'en_curso';
      }
    }
    const fuentes = [...new Set(conMeta.flatMap((r) => r.fuentes))];
    return {
      id: ind.id,
      tipo: ind.tipo,
      meta,
      esperado,
      realizado: suma(rs.map((r) => r.realizado)),
      realizadoActual: suma(rs.map((r) => r.realizadoActual)),
      cumplimientoEsperado,
      cumplimientoMeta: meta ? porcentaje(realizadoConMeta, meta) : null,
      avanceActual: meta ? porcentaje(suma(conMeta.map((r) => r.realizadoActual)), meta) : null,
      diferenciaMeta: meta !== null ? redondear(realizadoConMeta - meta, 2) : null,
      diferenciaEsperado: esperado !== null ? redondear(realizadoEvaluable - esperado, 2) : null,
      fuentes,
      metaDerivada: conMeta.some((r) => r.metaDerivada),
      estado,
    };
  });

  const ratios = C.RATIOS.map((def): ResultadoRatio => {
    const rs = evs.map((e) => e.ratios.find((r) => r.id === def.id) as ResultadoRatio);
    const numerador = suma(rs.map((r) => r.numerador));
    const denominador = suma(rs.map((r) => r.denominador));
    const umbrales = rs.map((r) => r.umbral).filter((u): u is number => u !== null);
    const umbral = umbrales.length ? redondear(suma(umbrales) / umbrales.length, 2) : null;
    const valor = denominador > 0 ? porcentaje(numerador, denominador) : null;
    let estado: Estado;
    let cumplimiento: number | null = null;
    if (umbral === null) estado = 'sin_meta';
    else if (valor === null) estado = 'sin_datos';
    else if (!base.evalFin) estado = 'en_curso';
    else {
      cumplimiento = porcentaje(valor, umbral);
      estado = semaforo(cumplimiento);
    }
    return { id: def.id, tipo: 'ratio', numerador, denominador, valor, umbral, cumplimiento, estado };
  });

  return {
    ...base,
    diasSinRegistro: [],
    diasExcepcionales: [...new Set(evs.flatMap((e) => e.diasExcepcionales))].sort(),
    indicadores,
    ratios,
    resumen: resumirEstados([...indicadores, ...ratios]),
  };
}

/** Evalúa los últimos `n` periodos (del más antiguo al más reciente) hasta el que contiene `fecha`. */
export function evaluarSerie(p: Omit<ParametrosEvaluacion, 'tipo' | 'periodo' | 'corte' | 'prioridad'> & {
  tipo: 'dia' | 'semana' | 'mes'; fecha: FechaISO; n: number;
}): Evaluacion[] {
  return F.periodosHasta(p.tipo, p.fecha, p.n).map((periodo) => evaluarPeriodo({
    usuario: p.usuario, metas: p.metas, registros: p.registros, hoy: p.hoy, tipo: p.tipo, periodo,
  }));
}

// ---------- Alertas ----------

export type Severidad = 'critica' | 'atencion';

export type Alerta =
  | { userId: string; tipo: 'sin_registro'; severidad: Severidad; fechas: FechaISO[] }
  | {
    userId: string; tipo: 'indicador'; severidad: Severidad; periodoTipo: TipoPeriodo; periodo: Periodo;
    indicador: string; realizado: number; esperado: number | null; meta: number | null; cumplimiento: number | null;
  }
  | {
    userId: string; tipo: 'ratio'; severidad: Severidad; periodoTipo: TipoPeriodo; periodo: Periodo;
    indicador: string; valor: number | null; umbral: number | null; cumplimiento: number | null;
  };

const SEVERIDAD: Partial<Record<Estado, Severidad>> = { rojo: 'critica', amarillo: 'atencion' };

function alertasDeEvaluacion(ev: Evaluacion, userId: string, incluirRatios: boolean): Alerta[] {
  const out: Alerta[] = [];
  for (const i of ev.indicadores) {
    const severidad = SEVERIDAD[i.estado];
    if (!severidad) continue;
    out.push({
      userId, tipo: 'indicador', severidad, periodoTipo: ev.tipo, periodo: ev.periodo,
      indicador: i.id, realizado: i.realizado, esperado: i.esperado, meta: i.meta, cumplimiento: i.cumplimientoEsperado,
    });
  }
  if (incluirRatios) {
    for (const r of ev.ratios) {
      const severidad = SEVERIDAD[r.estado];
      if (!severidad) continue;
      out.push({
        userId, tipo: 'ratio', severidad, periodoTipo: ev.tipo, periodo: ev.periodo,
        indicador: r.id, valor: r.valor, umbral: r.umbral, cumplimiento: r.cumplimiento,
      });
    }
  }
  return out;
}

/**
 * Alertas vigentes de un comercial, evaluadas con los registros hasta ayer:
 *  1. Días hábiles sin registro (últimos 30 días).
 *  2. Metas diarias incumplidas el último día hábil.
 *  3. Metas semanales y mensuales por debajo del avance esperado.
 *  4. Ratios por debajo de su umbral (semana y mes).
 */
export function generarAlertas({ usuario, metas, registros, hoy }: {
  usuario: Usuario; metas: Meta[]; registros: Registro[]; hoy: FechaISO;
}): Alerta[] {
  if (!usuario.activo) return [];
  const corte = F.sumarDias(hoy, -1);
  const inicio = usuario.fechaInicio || hoy;
  if (inicio > corte) return [];

  const alertas: Alerta[] = [];

  const faltantes = diasSinRegistro(usuario, registros, F.mayor(F.sumarDias(hoy, -VENTANA_DIAS_SIN_REGISTRO), inicio), corte);
  if (faltantes.length) {
    alertas.push({ userId: usuario.id, tipo: 'sin_registro', severidad: 'critica', fechas: faltantes });
  }

  const ultimoHabil = F.ultimoDiaHabilHasta(corte);
  if (ultimoHabil >= inicio && !faltantes.includes(ultimoHabil)) {
    const ev = evaluarPeriodo({
      usuario, metas, registros, tipo: 'dia', periodo: F.periodo('dia', ultimoHabil),
      hoy, corte, prioridad: PRIORIDAD_ALERTAS.dia,
    });
    alertas.push(...alertasDeEvaluacion(ev, usuario.id, false));
  }

  for (const tipo of ['semana', 'mes'] as const) {
    const ev = evaluarPeriodo({
      usuario, metas, registros, tipo, periodo: F.periodo(tipo, corte),
      hoy, corte, prioridad: PRIORIDAD_ALERTAS[tipo],
    });
    alertas.push(...alertasDeEvaluacion(ev, usuario.id, true));
  }

  const orden: Record<Severidad, number> = { critica: 0, atencion: 1 };
  return alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}
