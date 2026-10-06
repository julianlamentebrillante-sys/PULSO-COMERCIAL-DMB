/**
 * Fechas y calendario hábil de Colombia.
 *
 * Todas las fechas viajan como texto ISO 'AAAA-MM-DD' (sin hora) y la aritmética
 * se hace en UTC, de modo que ningún cálculo depende de la zona horaria del equipo.
 * "Hoy" se toma siempre en la zona horaria de Bogotá.
 *
 * Días hábiles: lunes a viernes, excluyendo los festivos de Colombia
 * (Ley 51 de 1983 — "Ley Emiliani" — y festivos religiosos ligados a la Pascua).
 */
import type { FechaISO, Periodo, TipoPeriodo } from './tipos';

export const ZONA_HORARIA = 'America/Bogota';

// ---------- Utilidades básicas ----------

export function iso(anio: number, mes: number, dia: number): FechaISO {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function aUTC(fecha: FechaISO): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function desdeUTC(date: Date): FechaISO {
  return date.toISOString().slice(0, 10);
}

export function esFechaValida(fecha: unknown): fecha is FechaISO {
  return typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && desdeUTC(aUTC(fecha)) === fecha;
}

export function sumarDias(fecha: FechaISO, n: number): FechaISO {
  const d = aUTC(fecha);
  d.setUTCDate(d.getUTCDate() + n);
  return desdeUTC(d);
}

/** 0 = domingo … 6 = sábado */
export function diaSemana(fecha: FechaISO): number {
  return aUTC(fecha).getUTCDay();
}

export function menor(a: FechaISO, b: FechaISO): FechaISO { return a < b ? a : b; }
export function mayor(a: FechaISO, b: FechaISO): FechaISO { return a > b ? a : b; }

export function hoyBogota(): FechaISO {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// ---------- Festivos de Colombia ----------

/** Domingo de Pascua (algoritmo gregoriano anónimo / Meeus). */
export function domingoPascua(anio: number): FechaISO {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes, dia);
}

/** Ley Emiliani: si el festivo no cae en lunes, se traslada al lunes siguiente. */
function trasladarALunes(fecha: FechaISO): FechaISO {
  return sumarDias(fecha, (8 - diaSemana(fecha)) % 7);
}

export interface Festivo { fecha: FechaISO; nombre: string }

const cacheFestivos = new Map<number, { lista: Festivo[]; mapa: Map<FechaISO, string> }>();

export function festivosColombia(anio: number) {
  const enCache = cacheFestivos.get(anio);
  if (enCache) return enCache;
  const pascua = domingoPascua(anio);
  const base: [FechaISO, string][] = [
    [iso(anio, 1, 1), 'Año Nuevo'],
    [trasladarALunes(iso(anio, 1, 6)), 'Día de los Reyes Magos'],
    [trasladarALunes(iso(anio, 3, 19)), 'Día de San José'],
    [sumarDias(pascua, -3), 'Jueves Santo'],
    [sumarDias(pascua, -2), 'Viernes Santo'],
    [iso(anio, 5, 1), 'Día del Trabajo'],
    [sumarDias(pascua, 43), 'Ascensión del Señor'],
    [sumarDias(pascua, 64), 'Corpus Christi'],
    [sumarDias(pascua, 71), 'Sagrado Corazón de Jesús'],
    [trasladarALunes(iso(anio, 6, 29)), 'San Pedro y San Pablo'],
    [iso(anio, 7, 20), 'Día de la Independencia'],
    [iso(anio, 8, 7), 'Batalla de Boyacá'],
    [trasladarALunes(iso(anio, 8, 15)), 'Asunción de la Virgen'],
    [trasladarALunes(iso(anio, 10, 12)), 'Día de la Raza'],
    [trasladarALunes(iso(anio, 11, 1)), 'Día de Todos los Santos'],
    [trasladarALunes(iso(anio, 11, 11)), 'Independencia de Cartagena'],
    [iso(anio, 12, 8), 'Inmaculada Concepción'],
    [iso(anio, 12, 25), 'Navidad'],
  ];
  // Dos festivos pueden caer el mismo lunes (p. ej. 30 de junio de 2025).
  const mapa = new Map<FechaISO, string>();
  for (const [fecha, nombre] of base) {
    mapa.set(fecha, mapa.has(fecha) ? `${mapa.get(fecha)} / ${nombre}` : nombre);
  }
  const lista = [...mapa.entries()]
    .map(([fecha, nombre]) => ({ fecha, nombre }))
    .sort((x, y) => (x.fecha < y.fecha ? -1 : 1));
  const resultado = { lista, mapa };
  cacheFestivos.set(anio, resultado);
  return resultado;
}

export function nombreFestivo(fecha: FechaISO): string | null {
  return festivosColombia(Number(fecha.slice(0, 4))).mapa.get(fecha) ?? null;
}

export function esFinDeSemana(fecha: FechaISO): boolean {
  const d = diaSemana(fecha);
  return d === 0 || d === 6;
}

export function esHabil(fecha: FechaISO): boolean {
  return !esFinDeSemana(fecha) && !nombreFestivo(fecha);
}

/** Motivo por el que una fecha no es hábil (o null si es hábil). */
export function motivoNoHabil(fecha: FechaISO): string | null {
  if (esHabil(fecha)) return null;
  const festivo = nombreFestivo(fecha);
  return festivo ? `festivo: ${festivo}` : 'fin de semana';
}

// ---------- Rangos y periodos ----------

export function listaFechas(ini: FechaISO, fin: FechaISO): FechaISO[] {
  const out: FechaISO[] = [];
  for (let f = ini; f <= fin; f = sumarDias(f, 1)) out.push(f);
  return out;
}

export function diasHabiles(ini: FechaISO, fin: FechaISO): FechaISO[] {
  return listaFechas(ini, fin).filter(esHabil);
}

const cacheConteo = new Map<string, number>();
export function contarDiasHabiles(ini: FechaISO, fin: FechaISO): number {
  if (ini > fin) return 0;
  const clave = `${ini}|${fin}`;
  let n = cacheConteo.get(clave);
  if (n === undefined) {
    n = diasHabiles(ini, fin).length;
    cacheConteo.set(clave, n);
  }
  return n;
}

/** Último día hábil igual o anterior a la fecha dada. */
export function ultimoDiaHabilHasta(fecha: FechaISO): FechaISO {
  let f = fecha;
  while (!esHabil(f)) f = sumarDias(f, -1);
  return f;
}

/** La semana va de lunes a domingo. */
export function inicioSemana(fecha: FechaISO): FechaISO {
  const d = diaSemana(fecha);
  return sumarDias(fecha, d === 0 ? -6 : 1 - d);
}
export function finSemana(fecha: FechaISO): FechaISO { return sumarDias(inicioSemana(fecha), 6); }
export function inicioMes(fecha: FechaISO): FechaISO { return fecha.slice(0, 8) + '01'; }
export function finMes(fecha: FechaISO): FechaISO {
  const [a, m] = fecha.split('-').map(Number);
  return desdeUTC(new Date(Date.UTC(a, m, 0)));
}

/** Periodo de tipo 'dia' | 'semana' | 'mes' | 'anio' que contiene la fecha. */
export function periodo(tipo: Exclude<TipoPeriodo, 'rango'>, fecha: FechaISO): Periodo {
  switch (tipo) {
    case 'dia': return { tipo, ini: fecha, fin: fecha };
    case 'semana': return { tipo, ini: inicioSemana(fecha), fin: finSemana(fecha) };
    case 'mes': return { tipo, ini: inicioMes(fecha), fin: finMes(fecha) };
    case 'anio': return { tipo, ini: `${fecha.slice(0, 4)}-01-01`, fin: `${fecha.slice(0, 4)}-12-31` };
  }
}

/**
 * Los últimos `n` periodos que terminan en el que contiene `fecha`, del más antiguo al más reciente.
 * Para 'dia' solo cuenta días hábiles.
 */
export function periodosHasta(tipo: 'dia' | 'semana' | 'mes', fecha: FechaISO, n: number): Periodo[] {
  const out: Periodo[] = [];
  let f = tipo === 'dia' ? ultimoDiaHabilHasta(fecha) : fecha;
  while (out.length < n) {
    const p = periodo(tipo, f);
    out.unshift(p);
    if (tipo === 'dia') f = ultimoDiaHabilHasta(sumarDias(f, -1));
    else f = sumarDias(p.ini, -1);
  }
  return out;
}

export function rango(ini: FechaISO, fin: FechaISO): Periodo {
  return { tipo: 'rango', ini, fin };
}

// ---------- Formato para mostrar ----------

const formato = (opciones: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', ...opciones });
const FMT_LARGO = formato({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const FMT_MEDIO = formato({ weekday: 'short', day: 'numeric', month: 'short' });
const FMT_DIA_MES = formato({ day: 'numeric', month: 'short' });
const FMT_MES = formato({ month: 'long', year: 'numeric' });

function mayuscula(t: string): string { return t.charAt(0).toUpperCase() + t.slice(1); }
export function formatoLargo(f: FechaISO): string { return mayuscula(FMT_LARGO.format(aUTC(f))); }
export function formatoMedio(f: FechaISO): string { return FMT_MEDIO.format(aUTC(f)); }
export function formatoDiaMes(f: FechaISO): string { return FMT_DIA_MES.format(aUTC(f)); }
export function formatoMes(f: FechaISO): string { return mayuscula(FMT_MES.format(aUTC(f))); }

/** Etiqueta breve para ejes de gráficas: "5 oct", "sem 28 sept", "oct 2026". */
export function etiquetaCorta(p: Periodo): string {
  switch (p.tipo) {
    case 'dia': return formatoDiaMes(p.ini);
    case 'semana': return formatoDiaMes(p.ini);
    case 'mes': return formato({ month: 'short', year: '2-digit' }).format(aUTC(p.ini));
    case 'anio': return p.ini.slice(0, 4);
    case 'rango': return `${formatoDiaMes(p.ini)}–${formatoDiaMes(p.fin)}`;
  }
}

export function etiquetaPeriodo(p: Periodo): string {
  switch (p.tipo) {
    case 'dia': return formatoLargo(p.ini);
    case 'semana': return `Semana del ${formatoDiaMes(p.ini)} al ${formatoDiaMes(p.fin)} de ${p.fin.slice(0, 4)}`;
    case 'mes': return formatoMes(p.ini);
    case 'anio': return `Año ${p.ini.slice(0, 4)}`;
    case 'rango': return `${formatoMedio(p.ini)} – ${formatoMedio(p.fin)}`;
  }
}
