import { useState } from 'react';
import * as F from '../core/fechas';
import type { FechaISO, Usuario } from '../core/tipos';
import { Segmentado } from './componentes';

export function SelectorComercial({ comerciales, valor, onCambio }: { comerciales: Usuario[]; valor: string; onCambio: (id: string) => void }) {
  return (
    <select aria-label="Comercial" value={valor} onChange={(e) => onCambio(e.target.value)}>
      {comerciales.map((c) => <option key={c.id} value={c.id}>{c.activo ? c.nombre : `${c.nombre} (inactivo)`}</option>)}
    </select>
  );
}

export function NavegadorPeriodo({ etiqueta, onAnterior, onSiguiente, onHoy }: {
  etiqueta: string; onAnterior: () => void; onSiguiente: () => void; onHoy?: () => void;
}) {
  return (
    <div className="navegador">
      <button type="button" className="btn btn--suave" aria-label="Periodo anterior" onClick={onAnterior}>‹</button>
      <span className="navegador__etiqueta">{etiqueta}</span>
      <button type="button" className="btn btn--suave" aria-label="Periodo siguiente" onClick={onSiguiente}>›</button>
      {onHoy ? <button type="button" className="btn btn--suave" onClick={onHoy}>Volver a hoy</button> : null}
    </div>
  );
}

export type TipoVista = 'dia' | 'semana' | 'mes';

const TIPOS: { valor: TipoVista; texto: string }[] = [
  { valor: 'dia', texto: 'Hoy' },
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
];

/** Cantidad de periodos que muestran las tendencias según la vista. */
export const PERIODOS_TENDENCIA: Record<TipoVista, number> = { dia: 10, semana: 8, mes: 6 };

function moverFecha(tipo: TipoVista, fecha: FechaISO, paso: number): FechaISO {
  if (tipo === 'dia') return F.sumarDias(fecha, paso);
  if (tipo === 'semana') return F.sumarDias(fecha, 7 * paso);
  return paso < 0 ? F.inicioMes(F.sumarDias(F.inicioMes(fecha), -1)) : F.sumarDias(F.finMes(fecha), 1);
}

/** Estado del selector Hoy / Semana / Mes con navegación entre periodos. */
export function usePeriodo(hoy: FechaISO, inicial: TipoVista = 'semana') {
  const [tipo, setTipo] = useState<TipoVista>(inicial);
  const [fecha, setFecha] = useState<FechaISO>(hoy);
  return {
    tipo, fecha,
    periodo: F.periodo(tipo, fecha),
    cambiarTipo: (t: TipoVista) => { setTipo(t); setFecha(hoy); },
    anterior: () => setFecha(moverFecha(tipo, fecha, -1)),
    siguiente: () => setFecha(moverFecha(tipo, fecha, 1)),
    irAHoy: fecha === hoy ? undefined : () => setFecha(hoy),
  };
}

export function FiltroPeriodo({ estado }: { estado: ReturnType<typeof usePeriodo> }) {
  return (
    <>
      <Segmentado etiqueta="Periodo" opciones={TIPOS} valor={estado.tipo} onCambio={estado.cambiarTipo} />
      <NavegadorPeriodo etiqueta={F.etiquetaPeriodo(estado.periodo)} onAnterior={estado.anterior} onSiguiente={estado.siguiente} onHoy={estado.irAHoy} />
    </>
  );
}
