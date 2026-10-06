/**
 * Catálogo de indicadores y ratios.
 *
 * Los indicadores son datos, no columnas fijas: las metas, el formulario y los
 * cálculos se construyen recorriendo este catálogo. Agregar un indicador en el
 * futuro es agregar una entrada aquí (y una fila en la tabla de Supabase).
 */
import type { PeriodicidadMeta, Valores } from './tipos';

export interface Grupo { id: string; nombre: string }

export interface Indicador {
  id: string;
  nombre: string;
  corto: string;
  grupo: string;
  tipo: 'base' | 'total';
  /** Solo para totales: indicadores que suma. */
  componentes?: string[];
}

export interface Ratio {
  id: string;
  nombre: string;
  formula: string;
  numerador: string;
  denominador: string;
  tipo: 'ratio';
}

export const GRUPOS: Grupo[] = [
  { id: 'prospeccion', nombre: 'Prospección' },
  { id: 'contactos', nombre: 'Contactos' },
  { id: 'agendadas', nombre: 'Reuniones agendadas' },
  { id: 'realizadas', nombre: 'Reuniones realizadas' },
  { id: 'cierre', nombre: 'Propuestas y oportunidades' },
];

/** Indicadores que el comercial registra a diario. */
export const INDICADORES_BASE: Indicador[] = ([
  { id: 'invitaciones', nombre: 'Invitaciones a conectar enviadas', corto: 'Invitaciones', grupo: 'prospeccion' },
  { id: 'conexiones', nombre: 'Conexiones aceptadas', corto: 'Conexiones', grupo: 'prospeccion' },
  { id: 'prospectos', nombre: 'Prospectos obtenidos', corto: 'Prospectos', grupo: 'prospeccion' },
  { id: 'contactos', nombre: 'Contactos realizados', corto: 'Contactos', grupo: 'contactos' },
  { id: 'contactos_efectivos', nombre: 'Contactos efectivos', corto: 'Efectivos', grupo: 'contactos' },
  { id: 'sinergia_agendadas', nombre: 'Reuniones de Sinergia agendadas', corto: 'Sinergia', grupo: 'agendadas' },
  { id: 'presentacion_agendadas', nombre: 'Reuniones de presentación agendadas', corto: 'Presentación', grupo: 'agendadas' },
  { id: 'seguimiento_agendadas', nombre: 'Reuniones de seguimiento agendadas', corto: 'Seguimiento', grupo: 'agendadas' },
  { id: 'sinergia_realizadas', nombre: 'Reuniones de Sinergia realizadas', corto: 'Sinergia', grupo: 'realizadas' },
  { id: 'presentacion_realizadas', nombre: 'Reuniones de presentación realizadas', corto: 'Presentación', grupo: 'realizadas' },
  { id: 'seguimiento_realizadas', nombre: 'Reuniones de seguimiento realizadas', corto: 'Seguimiento', grupo: 'realizadas' },
  { id: 'propuestas', nombre: 'Propuestas comerciales presentadas', corto: 'Propuestas', grupo: 'cierre' },
  { id: 'oportunidades', nombre: 'Oportunidades comerciales reales', corto: 'Oportunidades', grupo: 'cierre' },
] as const).map((i) => ({ ...i, tipo: 'base' as const }));

/** Indicadores calculados automáticamente (también admiten metas). */
export const INDICADORES_TOTAL: Indicador[] = [
  {
    id: 'total_agendadas', nombre: 'Total reuniones comerciales agendadas', corto: 'Total agendadas', grupo: 'agendadas', tipo: 'total',
    componentes: ['sinergia_agendadas', 'presentacion_agendadas', 'seguimiento_agendadas'],
  },
  {
    id: 'total_realizadas', nombre: 'Total reuniones comerciales realizadas', corto: 'Total realizadas', grupo: 'realizadas', tipo: 'total',
    componentes: ['sinergia_realizadas', 'presentacion_realizadas', 'seguimiento_realizadas'],
  },
];

export const INDICADORES: Indicador[] = [...INDICADORES_BASE, ...INDICADORES_TOTAL];

/** Ratios de efectividad. Su meta es un umbral mínimo en porcentaje. */
export const RATIOS: Ratio[] = [
  { id: 'tasa_aceptacion', nombre: 'Tasa de aceptación', formula: 'Conexiones aceptadas ÷ Invitaciones enviadas', numerador: 'conexiones', denominador: 'invitaciones', tipo: 'ratio' },
  { id: 'tasa_prospeccion', nombre: 'Tasa de prospección', formula: 'Prospectos obtenidos ÷ Conexiones aceptadas', numerador: 'prospectos', denominador: 'conexiones', tipo: 'ratio' },
  { id: 'tasa_efectividad_contacto', nombre: 'Efectividad de contacto', formula: 'Contactos efectivos ÷ Contactos realizados', numerador: 'contactos_efectivos', denominador: 'contactos', tipo: 'ratio' },
  { id: 'tasa_realizacion_reuniones', nombre: 'Realización de reuniones', formula: 'Reuniones realizadas ÷ Reuniones agendadas', numerador: 'total_realizadas', denominador: 'total_agendadas', tipo: 'ratio' },
];

export const PERIODICIDADES: { id: PeriodicidadMeta; nombre: string }[] = [
  { id: 'diaria', nombre: 'Diaria' },
  { id: 'semanal', nombre: 'Semanal' },
  { id: 'mensual', nombre: 'Mensual' },
];

/** Periodicidad que usan las metas de los ratios. */
export const PERIODICIDAD_UMBRAL = 'umbral' as const;

const porId = new Map<string, Indicador | Ratio>([...INDICADORES, ...RATIOS].map((x) => [x.id, x]));

export function buscar(id: string): Indicador | Ratio | null {
  return porId.get(id) ?? null;
}

/** Nombre corto para tarjetas y encabezados de tabla. */
export function nombreCorto(id: string): string {
  const x = porId.get(id);
  if (!x) return id;
  return x.tipo === 'ratio' ? x.nombre : x.corto;
}

export function esRatio(id: string): boolean {
  return porId.get(id)?.tipo === 'ratio';
}

export function indicadoresDelGrupo(grupoId: string): Indicador[] {
  return INDICADORES.filter((i) => i.grupo === grupoId);
}

/** Completa los valores base (0 si faltan) y agrega los totales calculados. */
export function calcularTotales(valores: Partial<Valores> | null | undefined): Valores {
  const v: Valores = {};
  for (const i of INDICADORES_BASE) v[i.id] = Number(valores?.[i.id]) || 0;
  for (const t of INDICADORES_TOTAL) v[t.id] = (t.componentes ?? []).reduce((s, c) => s + v[c], 0);
  return v;
}
