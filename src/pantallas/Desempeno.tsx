/**
 * Desempeño — vista de validación del motor (Etapa 3).
 * Meta, avance esperado, realizado, cumplimiento y semáforo por indicador.
 * En la Etapa 4 evoluciona a los dashboards con gráficas y tendencias.
 */
import { useState } from 'react';
import { useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as C from '../core/catalogo';
import * as F from '../core/fechas';
import type { Evaluacion } from '../core/motor';
import type { FechaISO, TipoPeriodo } from '../core/tipos';
import * as perm from '../datos/permisos';
import { Aviso, Cargando, Encabezado, ErrorCarga, ListaAlertas, Segmentado, Semaforo, Tarjeta, Vacio } from '../ui/componentes';
import { num, pct } from '../ui/formato';
import { SelectorComercial, NavegadorPeriodo } from '../ui/Controles';

type TipoVista = Extract<TipoPeriodo, 'dia' | 'semana' | 'mes'>;

const TIPOS: { valor: TipoVista; texto: string }[] = [
  { valor: 'dia', texto: 'Hoy' },
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
];

function moverFecha(tipo: TipoVista, fecha: FechaISO, paso: number): FechaISO {
  if (tipo === 'dia') return F.sumarDias(fecha, paso);
  if (tipo === 'semana') return F.sumarDias(fecha, 7 * paso);
  return paso < 0 ? F.inicioMes(F.sumarDias(F.inicioMes(fecha), -1)) : F.sumarDias(F.finMes(fecha), 1);
}

function Resumen({ ev }: { ev: Evaluacion }) {
  const enCurso = !ev.evalFin;
  const datos: [string, string, string][] = [
    ['Evaluado hasta', enCurso ? 'En curso' : F.formatoMedio(ev.evalFin!), enCurso ? 'Se evalúa desde mañana' : 'Registros hasta el día anterior'],
    ['Días hábiles', `${ev.diasHabilesTranscurridos} de ${ev.diasHabiles}`, 'transcurridos al corte'],
    ['Avance esperado', pct(ev.avanceEsperado), 'del periodo'],
    ['Días sin registro', String(ev.diasSinRegistro.length), ev.diasSinRegistro.length ? ev.diasSinRegistro.map(F.formatoMedio).join(', ') : 'Ninguno'],
    ['Semáforos', `${ev.resumen.verde} · ${ev.resumen.amarillo} · ${ev.resumen.rojo}`, 'verde · amarillo · rojo'],
  ];
  return (
    <div className="datos">
      {datos.map(([titulo, valor, detalle]) => (
        <div key={titulo} className="dato">
          <span className="dato__titulo">{titulo}</span>
          <strong className="dato__valor">{valor}</strong>
          <span className="dato__detalle">{detalle}</span>
        </div>
      ))}
    </div>
  );
}

function TablaIndicadores({ ev }: { ev: Evaluacion }) {
  const porId = Object.fromEntries(ev.indicadores.map((i) => [i.id, i]));
  return (
    <Tarjeta titulo="Indicadores">
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

function TablaRatios({ ev }: { ev: Evaluacion }) {
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

export function Desempeno() {
  const { usuario, servicios: s, hoy } = useSesion();
  const veEquipo = perm.veEquipo(usuario);
  const [comercialId, setComercialId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoVista>('semana');
  const [fecha, setFecha] = useState<FechaISO>(hoy);

  const comerciales = useCarga(() => s.listarComerciales(usuario, { incluirInactivos: true }), [s, usuario]);
  const lista = comerciales.datos ?? [];
  const seleccionado = lista.find((c) => c.id === comercialId) ?? lista.find((c) => c.id === usuario.id) ?? lista[0];

  const evaluacion = useCarga(async () => {
    if (!seleccionado) return null;
    const [ev, alertas] = await Promise.all([
      s.evaluar(usuario, seleccionado.id, tipo, F.periodo(tipo, fecha)),
      s.alertas(usuario, seleccionado.id),
    ]);
    return { ev, alertas };
  }, [s, usuario, seleccionado?.id, tipo, fecha]);

  const titulo = veEquipo ? 'Desempeño' : 'Mi desempeño';
  if (comerciales.error) return <ErrorCarga error={comerciales.error} />;
  if (!comerciales.datos) return <Cargando />;
  if (!seleccionado) {
    return <><Encabezado titulo={titulo} /><Vacio>Todavía no hay comerciales. Créalos en la sección Equipo.</Vacio></>;
  }

  const datos = evaluacion.datos;
  return (
    <>
      <Encabezado titulo={titulo} subtitulo="Vista de validación del motor de cálculo. Los dashboards con gráficas y tendencias llegan en la Etapa 4." />
      <div className="controles">
        {veEquipo && lista.length > 1 ? <SelectorComercial comerciales={lista} valor={seleccionado.id} onCambio={setComercialId} /> : null}
        <Segmentado etiqueta="Periodo" opciones={TIPOS} valor={tipo} onCambio={(v) => { setTipo(v); setFecha(hoy); }} />
        <NavegadorPeriodo
          etiqueta={F.etiquetaPeriodo(F.periodo(tipo, fecha))}
          onAnterior={() => setFecha(moverFecha(tipo, fecha, -1))}
          onSiguiente={() => setFecha(moverFecha(tipo, fecha, 1))}
          onHoy={fecha === hoy ? undefined : () => setFecha(hoy)}
        />
      </div>
      {evaluacion.error ? <ErrorCarga error={evaluacion.error} /> : null}
      {!datos ? <Cargando /> : (
        <div className="pila">
          <Resumen ev={datos.ev} />
          {datos.ev.diasExcepcionales.length ? (
            <Aviso tipo="info">
              Incluye actividad registrada en días no hábiles: {datos.ev.diasExcepcionales.map(F.formatoMedio).join(', ')}.
              Suma a lo realizado, pero no al avance esperado.
            </Aviso>
          ) : null}
          <TablaIndicadores ev={datos.ev} />
          <TablaRatios ev={datos.ev} />
          <Tarjeta titulo="Alertas vigentes">
            <p className="nota">Calculadas con los registros hasta ayer, para el día hábil anterior, la semana y el mes en curso. Solo usan metas configuradas con esa periodicidad.</p>
            <ListaAlertas alertas={datos.alertas} />
          </Tarjeta>
        </div>
      )}
    </>
  );
}
