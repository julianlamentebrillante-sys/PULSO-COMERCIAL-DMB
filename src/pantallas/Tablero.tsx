/**
 * Dashboard general (administración y dirección comercial): resultado del equipo,
 * alertas, cumplimiento por comercial, comparación y tendencias.
 */
import { Link } from 'react-router-dom';
import { useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as C from '../core/catalogo';
import * as F from '../core/fechas';
import { indiceCumplimiento } from '../core/motor';
import { Cargando, Encabezado, ErrorCarga, ListaAlertas, Semaforo, Tarjeta, Vacio } from '../ui/componentes';
import { FiltroPeriodo, PERIODOS_TENDENCIA, usePeriodo } from '../ui/Controles';
import { num, pct } from '../ui/formato';
import { COLORES_SERIE, GraficaLineas, type SerieLinea } from '../ui/graficas';
import { Cifra, estadoIndice, INDICADORES_CLAVE, ResumenCorte, TarjetaKpi } from '../ui/Indicadores';

export function Tablero() {
  const { usuario, servicios: s, hoy } = useSesion();
  const per = usePeriodo(hoy);

  const datos = useCarga(async () => {
    const [tablero, tendencia, alertas] = await Promise.all([
      s.evaluarEquipo(usuario, per.tipo, per.periodo),
      s.serieEquipo(usuario, per.tipo, per.fecha, PERIODOS_TENDENCIA[per.tipo]),
      s.alertas(usuario),
    ]);
    return { tablero, tendencia, alertas };
  }, [s, usuario, per.tipo, per.fecha]);

  const encabezado = <Encabezado titulo="Tablero del equipo" subtitulo="Actividad, cumplimiento y brechas del equipo comercial." />;
  const controles = <div className="controles"><FiltroPeriodo estado={per} /></div>;
  if (datos.error) return <>{encabezado}{controles}<ErrorCarga error={datos.error} /></>;
  if (!datos.datos) return <>{encabezado}{controles}<Cargando /></>;

  const { tablero, tendencia, alertas } = datos.datos;
  const { filas, equipo } = tablero;
  if (!filas.length || !equipo) return <>{encabezado}<Vacio>No hay comerciales activos. Créalos en la sección Equipo.</Vacio></>;

  const indiceEquipo = indiceCumplimiento(equipo);
  const registraronHoy = filas.filter((f) => f.registroHoy).length;
  const sinRegistro = filas.reduce((n, f) => n + f.evaluacion.diasSinRegistro.length, 0);
  const criticas = alertas.filter((a) => a.severidad === 'critica').length;
  const nombres = Object.fromEntries(filas.map((f) => [f.comercial.id, f.comercial.nombre]));

  // El color sigue a la persona (orden fijo del equipo), nunca a su posición en un ranking.
  const series: SerieLinea[] = tendencia.porComercial.slice(0, COLORES_SERIE.length).map((p, i) => ({
    id: p.comercial.id, nombre: p.comercial.nombre, color: COLORES_SERIE[i], valores: p.serie.map(indiceCumplimiento),
  }));
  if (tendencia.porComercial.length > 1) {
    series.push({ id: 'equipo', nombre: 'Equipo', color: 'var(--serie-equipo)', valores: tendencia.equipo.map((e) => (e ? indiceCumplimiento(e) : null)) });
  }

  return (
    <>
      {encabezado}
      {controles}
      <div className={`pila ${datos.cargando ? 'pila--recargando' : ''}`}>
        <div className="cifras">
          <Cifra principal titulo="Índice de cumplimiento del equipo" valor={indiceEquipo === null ? '—' : pct(indiceEquipo)}
            estado={estadoIndice(indiceEquipo, equipo)} detalle={<ResumenCorte ev={equipo} />} />
          <Cifra titulo="Registro de hoy" valor={`${registraronHoy} de ${filas.length}`}
            detalle={registraronHoy === filas.length ? 'Todo el equipo registró' : `Pendiente: ${filas.filter((f) => !f.registroHoy).map((f) => f.comercial.nombre).join(', ')}`} />
          <Cifra titulo="Días sin registro" valor={String(sinRegistro)} detalle="en el periodo, sumando al equipo" />
          <Cifra titulo="Alertas vigentes" valor={String(alertas.length)} detalle={criticas ? `${criticas} críticas` : 'Ninguna crítica'} />
        </div>

        <div className="kpis">
          {INDICADORES_CLAVE.map((id) => <TarjetaKpi key={id} r={equipo.indicadores.find((i) => i.id === id)!} />)}
        </div>

        <Tarjeta titulo="Cumplimiento por comercial">
          <div className="tabla-contenedor">
            <table className="tabla tabla--comparativa">
              <thead>
                <tr>
                  <th scope="col">Comercial</th>
                  <th scope="col" className="num">Índice</th>
                  <th scope="col">Hoy</th>
                  <th scope="col" className="num">Sin registro</th>
                  {INDICADORES_CLAVE.map((id) => <th key={id} scope="col" className="num">{C.nombreCorto(id)}</th>)}
                  <th scope="col"><span className="solo-lector">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const indice = indiceCumplimiento(f.evaluacion);
                  return (
                    <tr key={f.comercial.id}>
                      <th scope="row">{f.comercial.nombre}</th>
                      <td className="num">
                        <span className="celda-estado">{pct(indice)}<Semaforo estado={estadoIndice(indice, f.evaluacion)} /></span>
                      </td>
                      <td>{f.registroHoy ? <span className="etiqueta etiqueta--vigente">Registró</span> : <span className="etiqueta etiqueta--atencion">Pendiente</span>}</td>
                      <td className="num">{f.evaluacion.diasSinRegistro.length}</td>
                      {INDICADORES_CLAVE.map((id) => {
                        const r = f.evaluacion.indicadores.find((i) => i.id === id)!;
                        const realizado = r.estado === 'en_curso' ? r.realizadoActual : r.realizado;
                        return (
                          <td key={id} className="num">
                            {r.cumplimientoEsperado !== null ? (
                              <span className="celda-estado" title={`${num(realizado, 0)} de ${num(r.esperado)} esperados · meta del periodo ${num(r.meta)}`}>
                                <span className={`punto punto--${r.estado}`} aria-hidden="true" />
                                {pct(r.cumplimientoEsperado)}
                              </span>
                            ) : (
                              <span className="texto-suave" title={r.meta === null ? 'Sin meta' : 'En curso'}>{num(realizado, 0)}</span>
                            )}
                          </td>
                        );
                      })}
                      <td><Link to={`/comercial/${f.comercial.id}`} className="btn btn--suave btn--peq">Ver detalle</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="nota">Cada indicador muestra el % de cumplimiento frente al avance esperado (verde ≥ 100 %, amarillo ≥ 70 %, rojo &lt; 70 %). En gris, la cantidad realizada cuando no hay meta o el periodo está en curso. Pasa el cursor para ver el detalle.</p>
        </Tarjeta>

        <Tarjeta>
          <GraficaLineas
            titulo={`Tendencia del índice de cumplimiento · últimos ${tendencia.periodos.length} ${per.tipo === 'dia' ? 'días hábiles' : per.tipo === 'semana' ? 'semanas' : 'meses'}`}
            etiquetas={tendencia.periodos.map(F.etiquetaCorta)}
            series={series}
            formato={(n) => `${num(n, 0)} %`}
            referencia={{ valor: 100, etiqueta: 'Meta 100 %' }}
            minimoMaximo={100}
          />
          {tendencia.porComercial.length > COLORES_SERIE.length ? (
            <p className="nota">La gráfica muestra los primeros {COLORES_SERIE.length} comerciales; la tabla de cumplimiento incluye a todo el equipo.</p>
          ) : null}
        </Tarjeta>

        <Tarjeta titulo="Alertas del equipo">
          <p className="nota">Calculadas con los registros hasta ayer.</p>
          <ListaAlertas alertas={alertas} nombres={nombres} />
        </Tarjeta>
      </div>
    </>
  );
}
