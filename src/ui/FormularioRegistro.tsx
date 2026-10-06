/**
 * Formulario de registro diario.
 * Pensado para completarse en menos de 5 minutos: un campo por indicador,
 * botones − / + para el celular, Enter salta al siguiente campo y los
 * totales de reuniones se calculan solos.
 */
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import * as C from '../core/catalogo';
import type { Valores } from '../core/tipos';
import { MAX_VALOR_REGISTRO } from '../datos/servicios';
import { num } from './formato';

interface Props {
  valores?: Valores | null;
  /** Meta del día por indicador, como referencia. */
  metasDia?: Record<string, number>;
  soloLectura?: boolean;
  textoBoton?: string;
  onGuardar?: (valores: Valores) => Promise<void>;
}

function aTexto(valores: Valores | null | undefined): Record<string, string> {
  const v = C.calcularTotales(valores);
  return Object.fromEntries(C.INDICADORES_BASE.map((i) => [i.id, String(v[i.id])]));
}

export function FormularioRegistro({ valores, metasDia, soloLectura, textoBoton, onGuardar }: Props) {
  const [texto, setTexto] = useState(() => aTexto(valores));
  const [guardando, setGuardando] = useState(false);
  const entradas = useRef<(HTMLInputElement | null)[]>([]);

  const numericos: Valores = Object.fromEntries(Object.entries(texto).map(([k, v]) => [k, v === '' ? 0 : Number(v)]));
  const totales = C.calcularTotales(numericos);
  const incoherente = totales.contactos_efectivos > totales.contactos;

  const cambiar = (id: string, valor: string) => setTexto((t) => ({ ...t, [id]: valor }));
  const ajustar = (id: string, delta: number) =>
    setTexto((t) => ({ ...t, [id]: String(Math.min(MAX_VALOR_REGISTRO, Math.max(0, (Number(t[id]) || 0) + delta))) }));

  const alTeclado = (e: KeyboardEvent<HTMLInputElement>, indice: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    entradas.current[indice + 1]?.focus();
  };

  const alEnviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!onGuardar) return;
    setGuardando(true);
    try { await onGuardar(numericos); } finally { setGuardando(false); }
  };

  let indice = 0;
  return (
    <form className="formulario-registro" onSubmit={alEnviar}>
      {C.GRUPOS.map((g) => (
        <fieldset key={g.id} className="grupo">
          <legend>{g.nombre}</legend>
          {C.indicadoresDelGrupo(g.id).map((ind) => {
            const meta = metasDia?.[ind.id];
            if (ind.tipo === 'total') {
              return (
                <div key={ind.id} className="fila fila--total">
                  <span className="fila__etiqueta">
                    {ind.nombre}
                    <span className="fila__meta">Calculado automáticamente{meta ? ` · Meta del día: ${num(meta)}` : ''}</span>
                  </span>
                  <strong className="fila__total">{num(totales[ind.id], 0)}</strong>
                </div>
              );
            }
            const i = indice++;
            const idCampo = `ind-${ind.id}`;
            return (
              <div key={ind.id} className="fila">
                <label htmlFor={idCampo} className="fila__etiqueta">
                  {ind.nombre}
                  {meta ? <span className="fila__meta">Meta del día: {num(meta)}</span> : null}
                </label>
                <div className="stepper">
                  {soloLectura ? null : (
                    <button type="button" className="stepper__btn" tabIndex={-1} aria-label={`Restar uno a ${ind.corto}`} onClick={() => ajustar(ind.id, -1)}>−</button>
                  )}
                  <input
                    ref={(el) => { entradas.current[i] = el; }}
                    id={idCampo}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_VALOR_REGISTRO}
                    step={1}
                    value={texto[ind.id]}
                    disabled={soloLectura}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => cambiar(ind.id, e.target.value)}
                    onKeyDown={(e) => alTeclado(e, i)}
                  />
                  {soloLectura ? null : (
                    <button type="button" className="stepper__btn" tabIndex={-1} aria-label={`Sumar uno a ${ind.corto}`} onClick={() => ajustar(ind.id, 1)}>+</button>
                  )}
                </div>
              </div>
            );
          })}
        </fieldset>
      ))}
      {incoherente ? <p className="aviso aviso--atencion">Los contactos efectivos superan a los contactos realizados. Revisa los valores.</p> : null}
      {soloLectura ? null : (
        <div className="barra-guardar">
          <button type="submit" className="btn btn--primario btn--bloque" disabled={guardando}>
            {guardando ? 'Guardando…' : (textoBoton ?? 'Guardar registro')}
          </button>
        </div>
      )}
    </form>
  );
}
