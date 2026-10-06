/** Piezas compartidas por los tableros: cifra principal, tarjetas KPI y tablas de detalle. */
import type { ReactNode } from 'react';
import * as C from '../core/catalogo';
import * as F from '../core/fechas';
import { semaforo, type Evaluacion, type ResultadoIndicador } from '../core/motor';
import type { Estado } from '../core/tipos';
import { Semaforo, Tarjeta } from './componentes';
import { num, pct } from './formato';

/** Indicadores que resumen la gestión en los tableros. */
export const INDICADORES_CLAVE = ['prospectos', 'total_agendadas', 'total_realizadas', 'propuestas', 'oportunidades'];

export function estadoIndice(indice: number | null, ev: Evaluacion): Estado {
  if (indice !== null) return semaforo(indice);
  return ev.evalFin ? 'sin_meta' : 'en_curso';
}

export function Cifra({ titulo, valor, estado, detalle, principal }: {
  titulo: string; valor: string; estado?: Estado; detalle?: ReactNode; principal?: boolean;
}) {
  return (
    <div className={`cifra ${principal ? 'cifra--principal' : ''}`}>
      <span className="cifra__titulo">{titulo}</span>
      <span className="cifra__valor">{valor}</span>
      {estado ? <Semaforo estado={estado} /> : null}
      {detalle ? <span className="cifra__detalle">{detalle}</span> : null}
    </div>
  );
}

export function TarjetaKpi({ r }: { r: ResultadoIndicador }) {
  const enCurso = r.estado === 'en_curso';
  const realizado = enCurso ? r.realizadoActual : r.realizado;
  return (
    <div className="kpi">
      <span className="kpi__nombre">{C.nombreCorto(r.id)}</span>
      <span className="kpi__valor">{num(realizado, 0)}{r.meta !== null ? <span className="kpi__meta"> / {num(r.meta)}</span> : null}</span>
      <span className="kpi__pie">
        <Semaforo estado={r.estado} />
        {r.cumplimientoEsperado !== null ? <span className="kpi__pct">{pct(r.cumplimientoEsperado)} del esperado</span> : null}
      </span>
    </div>
  );
}

export function ResumenCorte({ ev }: { ev: Evaluacion }) {
  return ev.evalFin
    ? <>Evaluado con registros hasta el {F.formatoMedio(ev.evalFin)} · {ev.diasHabilesTranscurridos} de {ev.diasHabiles} días hábiles</>
    : <>Periodo en curso: se evalúa desde mañana con el registro de hoy</>;
}

export function TablaIndicadores({ ev }: { ev: Evaluacion }) {
  const porId = Object.fromEntries(ev.indicadores.map((i) => [i.id, i]));
  return (
    <Tarjeta titulo="Detalle por indicador">
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Indicador</th>
              <th scope="col" className="num">Meta periodo</th>
              <th scope="col" className="num">Esperado al corte</th>
              <th scope="col" className="num">Realizado</th>
              <th scope="col" className="num">% vs esperado</th>
              <th scope="col">Semáforo</th>
              <th scope="col" className="num">% de la meta</th>
              <th scope="col" className="num">Dif. vs meta</th>
            </tr>
          </thead>
          <tbody>
            {C.GRUPOS.map((g) => [
              <tr key={`grupo-${g.id}`} className="tabla__grupo"><th colSpan={8} scope="colgroup">{g.nombre}</th></tr>,
              ...C.indicadoresDelGrupo(g.id).map((ind) => {
                const r = porId[ind.id];
                const enCurso = r.estado === 'en_curso';
                const realizado = enCurso ? r.realizadoActual : r.realizado;
                const hoyExtra = !enCurso ? r.realizadoActual - r.realizado : 0;
                return (
                  <tr key={ind.id} className={ind.tipo === 'total' ? 'tabla__total' : undefined}>
                    <th scope="row">{ind.nombre}</th>
                    <td className="num">
                      {num(r.meta)}
                      {r.metaDerivada ? <span className="derivada" title={`Derivada de la meta ${r.fuentes.join(' / ')}`}> *</span> : null}
                    </td>
                    <td className="num">{num(r.esperado)}</td>
                    <td className="num">
                      {num(realizado, 0)}
                      {hoyExtra > 0 ? <span className="hoy-extra"> +{num(hoyExtra, 0)} hoy</span> : null}
                    </td>
                    <td className="num">{pct(r.cumplimientoEsperado)}</td>
                    <td><Semaforo estado={r.estado} /></td>
                    <td className="num">{pct(enCurso ? r.avanceActual : r.cumplimientoMeta)}</td>
                    <td className="num">{r.meta === null ? '—' : num(enCurso ? realizado - r.meta : r.diferenciaMeta)}</td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      <p className="nota">
        * Meta derivada: el indicador no tiene meta con esta periodicidad y se toma como referencia otra (p. ej. la suma de las metas diarias).
        El semáforo compara lo realizado con el avance esperado al corte, para no penalizar antes de tiempo una meta semanal o mensual.
      </p>
    </Tarjeta>
  );
}

export function TablaRatios({ ev }: { ev: Evaluacion }) {
  const porId = Object.fromEntries(ev.ratios.map((r) => [r.id, r]));
  return (
    <Tarjeta titulo="Ratios de efectividad">
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Ratio</th>
              <th scope="col" className="num">Valor</th>
              <th scope="col" className="num">Umbral mínimo</th>
              <th scope="col" className="num">Cumplimiento</th>
              <th scope="col">Semáforo</th>
            </tr>
          </thead>
          <tbody>
            {C.RATIOS.map((def) => {
              const r = porId[def.id];
              return (
                <tr key={def.id}>
                  <th scope="row">{def.nombre}<span className="formula">{def.formula} · {num(r.numerador, 0)} / {num(r.denominador, 0)}</span></th>
                  <td className="num">{pct(r.valor)}</td>
                  <td className="num">{pct(r.umbral)}</td>
                  <td className="num">{pct(r.cumplimiento)}</td>
                  <td><Semaforo estado={r.estado} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
