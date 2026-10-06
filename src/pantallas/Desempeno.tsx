/**
 * Dashboard individual: "Mi desempeño" (comercial) y "Detalle de comercial" (administración / dirección).
 * Meta, realizado, cumplimiento, semáforo, tendencia e histórico personal.
 */
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as C from '../core/catalogo';
import * as F from '../core/fechas';
import { indiceCumplimiento } from '../core/motor';
import type { Usuario } from '../core/tipos';
import { Aviso, Cargando, Encabezado, ErrorCarga, ListaAlertas, Tarjeta, Vacio } from '../ui/componentes';
import { FiltroPeriodo, PERIODOS_TENDENCIA, SelectorComercial, usePeriodo } from '../ui/Controles';
import { num, pct } from '../ui/formato';
import { COLORES_SERIE, GraficaColumnasMeta, GraficaLineas } from '../ui/graficas';
import { Cifra, estadoIndice, INDICADORES_CLAVE, ResumenCorte, TablaIndicadores, TablaRatios, TarjetaKpi } from '../ui/Indicadores';

function PanelDesempeno({ comercial, controlesExtra }: { comercial: Usuario; controlesExtra?: ReactNode }) {
  const { usuario, servicios: s, hoy } = useSesion();
  const per = usePeriodo(hoy);
  const [indicadorTendencia, setIndicadorTendencia] = useState('prospectos');

  const datos = useCarga(async () => {
    const [ev, serie, alertas] = await Promise.all([
      s.evaluar(usuario, comercial.id, per.tipo, per.periodo),
      s.serie(usuario, comercial.id, per.tipo, per.fecha, PERIODOS_TENDENCIA[per.tipo]),
      s.alertas(usuario, comercial.id),
    ]);
    return { ev, serie, alertas };
  }, [s, usuario, comercial.id, per.tipo, per.fecha]);

  const controles = <div className="controles">{controlesExtra}<FiltroPeriodo estado={per} /></div>;
  if (datos.error) return <>{controles}<ErrorCarga error={datos.error} /></>;
  if (!datos.datos) return <>{controles}<Cargando /></>;

  const { ev, serie, alertas } = datos.datos;
  const indice = indiceCumplimiento(ev);
  const criticas = alertas.filter((a) => a.severidad === 'critica').length;
  const etiquetas = serie.map((e) => F.etiquetaCorta(e.periodo));
  const resultados = serie.map((e) => e.indicadores.find((i) => i.id === indicadorTendencia)!);
  const nombreIndicador = C.buscar(indicadorTendencia)?.nombre ?? '';

  return (
    <>
      {controles}
      <div className={`pila ${datos.cargando ? 'pila--recargando' : ''}`}>
        <div className="cifras">
          <Cifra principal titulo="Índice de cumplimiento" valor={indice === null ? '—' : pct(indice)} estado={estadoIndice(indice, ev)} detalle={<ResumenCorte ev={ev} />} />
          <Cifra titulo="Días sin registro" valor={String(ev.diasSinRegistro.length)}
            detalle={ev.diasSinRegistro.length ? ev.diasSinRegistro.map(F.formatoMedio).join(', ') : 'Todos los días hábiles registrados'} />
          <Cifra titulo="Alertas vigentes" valor={String(alertas.length)} detalle={criticas ? `${criticas} críticas` : 'Ninguna crítica'} />
        </div>
        {ev.diasExcepcionales.length ? (
          <Aviso tipo="info">
            Incluye actividad registrada en días no hábiles: {ev.diasExcepcionales.map(F.formatoMedio).join(', ')}. Suma a lo realizado, pero no al avance esperado.
          </Aviso>
        ) : null}
        <div className="kpis">
          {INDICADORES_CLAVE.map((id) => <TarjetaKpi key={id} r={ev.indicadores.find((i) => i.id === id)!} />)}
        </div>
        <div className="rejilla rejilla--graficas">
          <Tarjeta>
            <GraficaLineas
              titulo="Tendencia del índice de cumplimiento"
              etiquetas={etiquetas}
              series={[{ id: comercial.id, nombre: 'Índice', color: COLORES_SERIE[0], valores: serie.map(indiceCumplimiento) }]}
              formato={(n) => `${num(n, 0)} %`}
              referencia={{ valor: 100, etiqueta: 'Meta 100 %' }}
              minimoMaximo={100}
            />
          </Tarjeta>
          <Tarjeta>
            <div className="controles controles--compactos">
              <label className="solo-lector" htmlFor="indicador-tendencia">Indicador</label>
              <select id="indicador-tendencia" value={indicadorTendencia} onChange={(e) => setIndicadorTendencia(e.target.value)}>
                {C.INDICADORES.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </div>
            <GraficaColumnasMeta
              titulo={nombreIndicador}
              etiquetas={etiquetas}
              columnas={resultados.map((r, k) => (serie[k].evalFin ? r.realizado : r.realizadoActual))}
              meta={resultados.map((r) => r.esperado)}
              nombreColumnas="Realizado"
              nombreMeta="Meta (al corte en el periodo actual)"
              formato={(n) => num(n)}
            />
          </Tarjeta>
        </div>
        <Tarjeta titulo="Alertas vigentes">
          <p className="nota">Calculadas con los registros hasta ayer, para el día hábil anterior, la semana y el mes en curso.</p>
          <ListaAlertas alertas={alertas} />
        </Tarjeta>
        <TablaIndicadores ev={ev} />
        <TablaRatios ev={ev} />
      </div>
    </>
  );
}

export function MiDesempeno() {
  const { usuario } = useSesion();
  return (
    <>
      <Encabezado titulo="Mi desempeño" subtitulo="Tus metas, tu avance y tu histórico. Se evalúa con tus registros hasta el día anterior." />
      <PanelDesempeno comercial={usuario} />
    </>
  );
}

export function DetalleComercial() {
  const { usuario, servicios: s } = useSesion();
  const { id } = useParams();
  const navegar = useNavigate();
  const comerciales = useCarga(() => s.listarComerciales(usuario, { incluirInactivos: true }), [s, usuario]);

  if (comerciales.error) return <ErrorCarga error={comerciales.error} />;
  if (!comerciales.datos) return <Cargando />;
  const comercial = comerciales.datos.find((c) => c.id === id) ?? comerciales.datos[0];
  if (!comercial) return <><Encabezado titulo="Detalle de comercial" /><Vacio>Todavía no hay comerciales.</Vacio></>;

  return (
    <>
      <p className="miga"><Link to="/tablero">‹ Tablero del equipo</Link></p>
      <Encabezado titulo={comercial.nombre} subtitulo={comercial.activo ? 'Detalle de desempeño individual.' : 'Comercial inactivo · se conserva su histórico.'} />
      <PanelDesempeno
        key={comercial.id}
        comercial={comercial}
        controlesExtra={comerciales.datos.length > 1
          ? <SelectorComercial comerciales={comerciales.datos} valor={comercial.id} onCambio={(nuevo) => navegar(`/comercial/${nuevo}`)} />
          : null}
      />
    </>
  );
}
