import type { Usuario } from '../core/tipos';

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
