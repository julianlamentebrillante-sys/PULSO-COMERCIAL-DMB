/**
 * Metas (solo administrador): por comercial, indicador, periodicidad y vigencia.
 * Las metas nunca se sobrescriben: cada cambio crea una nueva vigencia.
 */
import { useState, type FormEvent } from 'react';
import { useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as C from '../core/catalogo';
import * as F from '../core/fechas';
import { metaVigente } from '../core/motor';
import type { FechaISO, Meta, Periodicidad } from '../core/tipos';
import { Campo, Cargando, Encabezado, ErrorCarga, Modal, Tarjeta, useAvisos, Vacio } from '../ui/componentes';
import { SelectorComercial } from '../ui/Controles';
import { num, pct } from '../ui/formato';

interface Seleccion { indicador: string; periodicidad: Periodicidad }

function proximaProgramada(metas: Meta[], indicador: string, periodicidad: Periodicidad, hoy: FechaISO): Meta | null {
  return metas
    .filter((m) => m.indicador === indicador && m.periodicidad === periodicidad && m.desde > hoy)
    .sort((a, b) => (a.desde < b.desde ? -1 : 1))[0] ?? null;
}

function CeldaMeta({ metas, indicador, periodicidad, hoy, esRatio, onAbrir }: {
  metas: Meta[]; indicador: string; periodicidad: Periodicidad; hoy: FechaISO; esRatio?: boolean; onAbrir: () => void;
}) {
  const vigente = metaVigente(metas, indicador, periodicidad, hoy);
  const programada = proximaProgramada(metas, indicador, periodicidad, hoy);
  return (
    <button type="button" className={`celda-meta ${vigente ? 'celda-meta--con' : ''}`} onClick={onAbrir}>
      <span className="celda-meta__valor">{vigente ? (esRatio ? pct(vigente.valor) : num(vigente.valor)) : '—'}</span>
      {programada ? <span className="celda-meta__prog">→ {esRatio ? pct(programada.valor) : num(programada.valor)} desde {F.formatoDiaMes(programada.desde)}</span> : null}
    </button>
  );
}

function EditorMeta({ comercialId, seleccion, metas, onCerrar, onCambio }: {
  comercialId: string; seleccion: Seleccion; metas: Meta[]; onCerrar: () => void; onCambio: () => Promise<void>;
}) {
  const { usuario, servicios: s, hoy } = useSesion();
  const { toast, confirmar } = useAvisos();
  const item = C.buscar(seleccion.indicador)!;
  const esRatio = item.tipo === 'ratio';
  const historial = metas
    .filter((m) => m.indicador === seleccion.indicador && m.periodicidad === seleccion.periodicidad)
    .sort((a, b) => (a.desde < b.desde ? 1 : -1));
  const vigente = metaVigente(metas, seleccion.indicador, seleccion.periodicidad, hoy);
  const [valor, setValor] = useState(vigente ? String(vigente.valor) : '');
  const [desde, setDesde] = useState<FechaISO>(hoy);
  const [error, setError] = useState<string | null>(null);

  const nombrePeriodicidad = esRatio ? 'Umbral mínimo' : C.PERIODICIDADES.find((p) => p.id === seleccion.periodicidad)!.nombre;
  const fmt = (v: number) => (esRatio ? pct(v) : num(v));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await s.definirMeta(usuario, { userId: comercialId, ...seleccion, valor: Number(valor), desde });
      toast('Meta guardada.');
      await onCambio();
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const finalizar = async (m: Meta) => {
    const programada = m.desde >= hoy;
    const ok = await confirmar(programada
      ? '¿Eliminar esta meta programada? Aún no ha empezado a regir.'
      : 'La meta dejará de regir desde hoy. Los periodos anteriores conservan su evaluación. ¿Continuar?',
    { aceptar: programada ? 'Eliminar' : 'Finalizar vigencia', peligro: true });
    if (!ok) return;
    try {
      await s.finalizarMeta(usuario, m.id);
      toast(programada ? 'Meta programada eliminada.' : 'Vigencia finalizada.');
      await onCambio();
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const estadoMeta = (m: Meta) => (m.desde > hoy ? 'Programada' : !m.hasta || m.hasta >= hoy ? 'Vigente' : 'Histórica');

  return (
    <Modal titulo={`${item.nombre} · ${nombrePeriodicidad}`} onCerrar={onCerrar}>
      <form className="pila" onSubmit={guardar}>
        <div className="fila-campos">
          <Campo etiqueta={esRatio ? 'Umbral mínimo (%)' : 'Meta'}>
            {(id) => <input id={id} type="number" min="0" step="any" required value={valor} onChange={(e) => setValor(e.target.value)} />}
          </Campo>
          <Campo
            etiqueta="Rige desde"
            ayuda={historial.length
              ? 'Para proteger el histórico, una nueva meta rige desde hoy o una fecha futura. La anterior se conserva.'
              : 'Primera meta de este indicador: puedes fijar una fecha anterior para cargar la línea base.'}
          >
            {(id) => <input id={id} type="date" required min={historial.length ? hoy : undefined} value={desde} onChange={(e) => setDesde(e.target.value)} />}
          </Campo>
        </div>
        {error ? <p className="aviso aviso--error" role="alert">{error}</p> : null}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn--primario">Guardar meta</button>
        </div>
      </form>
      <h3 className="subtitulo">Historial de vigencias</h3>
      {historial.length ? (
        <ul className="historial">
          {historial.map((m) => (
            <li key={m.id} className="historial__item">
              <span className="historial__valor">{fmt(m.valor)}</span>
              <span>{F.formatoMedio(m.desde)} → {m.hasta ? F.formatoMedio(m.hasta) : 'sin fecha de fin'}</span>
              <span className={`etiqueta etiqueta--${estadoMeta(m).toLowerCase()}`}>{estadoMeta(m)}</span>
              {estadoMeta(m) !== 'Histórica' ? (
                <button type="button" className="btn btn--suave btn--peq" onClick={() => finalizar(m)}>
                  {estadoMeta(m) === 'Programada' ? 'Eliminar' : 'Finalizar'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <Vacio>Sin metas definidas todavía.</Vacio>}
    </Modal>
  );
}

export function Metas() {
  const { usuario, servicios: s, hoy } = useSesion();
  const [comercialId, setComercialId] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);

  const comerciales = useCarga(() => s.listarComerciales(usuario, { incluirInactivos: true }), [s, usuario]);
  const comercial = comerciales.datos?.find((c) => c.id === comercialId) ?? comerciales.datos?.[0];
  const metas = useCarga(async () => (comercial ? s.listarMetas(usuario, comercial.id) : []), [s, usuario, comercial?.id]);

  if (comerciales.error) return <ErrorCarga error={comerciales.error} />;
  if (!comerciales.datos) return <Cargando />;
  const encabezado = <Encabezado titulo="Metas" subtitulo="Define metas por comercial, indicador, periodicidad y vigencia. No todos los indicadores necesitan las tres periodicidades." />;
  if (!comercial) return <>{encabezado}<Vacio>Todavía no hay comerciales.</Vacio></>;

  const lista = metas.datos ?? [];
  return (
    <>
      {encabezado}
      <div className="controles">
        <SelectorComercial comerciales={comerciales.datos} valor={comercial.id} onCambio={setComercialId} />
        <span className="nota">Valores vigentes hoy · haz clic en una celda para cambiarla o ver su historial.</span>
      </div>
      {metas.error ? <ErrorCarga error={metas.error} /> : null}
      <Tarjeta titulo="Indicadores">
        <div className="tabla-contenedor">
          <table className="tabla tabla--metas">
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                {C.PERIODICIDADES.map((p) => <th key={p.id} scope="col" className="centro">{p.nombre}</th>)}
              </tr>
            </thead>
            <tbody>
              {C.GRUPOS.map((g) => [
                <tr key={`grupo-${g.id}`} className="tabla__grupo"><th colSpan={4} scope="colgroup">{g.nombre}</th></tr>,
                ...C.indicadoresDelGrupo(g.id).map((ind) => (
                  <tr key={ind.id} className={ind.tipo === 'total' ? 'tabla__total' : undefined}>
                    <th scope="row">{ind.nombre}</th>
                    {C.PERIODICIDADES.map((p) => (
                      <td key={p.id} className="centro">
                        <CeldaMeta metas={lista} indicador={ind.id} periodicidad={p.id} hoy={hoy}
                          onAbrir={() => setSeleccion({ indicador: ind.id, periodicidad: p.id })} />
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Ratios de efectividad">
        <div className="tabla-contenedor">
          <table className="tabla tabla--metas">
            <thead>
              <tr>
                <th scope="col">Ratio</th>
                <th scope="col" className="centro">Umbral mínimo</th>
              </tr>
            </thead>
            <tbody>
              {C.RATIOS.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.nombre}<span className="formula">{r.formula}</span></th>
                  <td className="centro">
                    <CeldaMeta metas={lista} indicador={r.id} periodicidad="umbral" hoy={hoy} esRatio
                      onAbrir={() => setSeleccion({ indicador: r.id, periodicidad: 'umbral' })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nota">El semáforo de un ratio compara su valor con el umbral: verde si lo alcanza, amarillo desde el 70 % del umbral, rojo por debajo.</p>
      </Tarjeta>
      {seleccion ? (
        <EditorMeta comercialId={comercial.id} seleccion={seleccion} metas={lista} onCerrar={() => setSeleccion(null)} onCambio={metas.recargar} />
      ) : null}
    </>
  );
}
