import * as F from '../core/fechas';
import { buscar } from '../core/catalogo';
import type { Alerta } from '../core/motor';

const formatosNumero = new Map<number, Intl.NumberFormat>();

export function num(n: number | null | undefined, decimales = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  let f = formatosNumero.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat('es-CO', { maximumFractionDigits: decimales });
    formatosNumero.set(decimales, f);
  }
  return f.format(n);
}

export function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${num(n, 1)} %`;
}

export function hora(momento: string): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: F.ZONA_HORARIA, hour: 'numeric', minute: '2-digit' }).format(new Date(momento));
}

export function fechaHora(momento: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: F.ZONA_HORARIA, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(momento));
}

export function textoAlerta(a: Alerta): string {
  if (a.tipo === 'sin_registro') {
    const n = a.fechas.length;
    return n === 1
      ? `No registró actividad el ${F.formatoMedio(a.fechas[0])}.`
      : `No registró actividad en ${n} días hábiles (el más reciente: ${F.formatoMedio(a.fechas[n - 1])}).`;
  }
  const nombre = buscar(a.indicador)?.nombre ?? a.indicador;
  const periodo = F.etiquetaPeriodo(a.periodo);
  if (a.tipo === 'ratio') return `${nombre}: ${pct(a.valor)} frente a un umbral de ${pct(a.umbral)} · ${periodo}.`;
  return `${nombre}: ${num(a.realizado)} de ${num(a.esperado)} esperados (${pct(a.cumplimiento)}) · ${periodo}.`;
}
