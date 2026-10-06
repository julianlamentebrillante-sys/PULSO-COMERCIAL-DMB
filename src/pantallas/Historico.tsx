/**
 * Histórico: consulta por comercial (o equipo consolidado), día, semana, mes, año
 * o rango personalizado. Resumen del rango, tendencias, tabla por tramo y CSV.
 */
import { useState } from 'react';
import { useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as C from '../core/catalogo';
import * as F from '../core/fechas';
import { indiceCumplimiento, type Evaluacion } from '../core/motor';
import type { FechaISO } from '../core/tipos';
import * as perm from '../datos/permisos';
import { Campo, Cargando, Encabezado, ErrorCarga, Segmentado, Semaforo, Tarjeta } from '../ui/componentes';
import { num, pct } from '../ui/formato';
import { COLORES_SERIE, GraficaColumnasMeta, GraficaLineas } from '../ui/graficas';
import { Cifra, estadoIndice, INDICADORES_CLAVE, TablaIndicadores, TablaRatios, TarjetaKpi } from '../ui/Indicadores';

type Agrupacion = 'dia' | 'semana' | 'mes';
type Atajo = 'este_mes' | 'mes_anterior' | 'ultimos_30' | 'ultimos_90' | 'este_anio' | 'anio_anterior' | 'personalizado';

const ATAJOS: { valor: Atajo; texto: string; agrupacion: Agrupacion }[] = [
  { valor: 'este_mes', texto: 'Este mes', agrupacion: 'semana' },
  { valor: 'mes_anterior', texto: 'Mes anterior', agrupacion: 'semana' },
  { valor: 'ultimos_30', texto: 'Últimos 30 días', agrupacion: 'dia' },
  { valor: 'ultimos_90', texto: 'Últimos 3 meses', agrupacion: 'semana' },
  { valor: 'este_anio', texto: 'Este año', agrupacion: 'mes' },
  { valor: 'anio_anterior', texto: 'Año anterior', agrupacion: 'mes' },
  { valor: 'personalizado', texto: 'Rango personalizado', agrupacion: 'semana' },
];

const AGRUPACIONES: { valor: Agrupacion; texto: string }[] = [
  { valor: 'dia', texto: 'Día' },
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
];

function rangoDeAtajo(atajo: Exclude<Atajo, 'personalizado'>, hoy: FechaISO): { ini: FechaISO; fin: FechaISO } {
  const anio = Number(hoy.slice(0, 4));
  switch (atajo) {
    case 'este_mes': return { ini: F.inicioMes(hoy), fin: F.finMes(hoy) };
    case 'mes_anterior': { const f = F.sumarDias(F.inicioMes(hoy), -1); return { ini: F.inicioMes(f), fin: F.finMes(f) }; }
    case 'ultimos_30': return { ini: F.sumarDias(hoy, -29), fin: hoy };
    case 'ultimos_90': return { ini: F.sumarDias(hoy, -89), fin: hoy };
    case 'este_anio': return { ini: `${anio}-01-01`, fin: `${anio}-12-31` };
    case 'anio_anterior': return { ini: `${anio - 1}-01-01`, fin: `${anio - 1}-12-31` };
  }
}

/** Número para CSV con coma decimal (Excel en español). */
const csvNum = (n: number | null) => (n === null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

function descargarCsv(nombre: string, tramos: Evaluacion[]) {
  const encabezado = ['Desde', 'Hasta', 'Índice de cumplimiento (%)'];
  for (const ind of C.INDICADORES) encabezado.push(`${ind.nombre} - realizado`, `${ind.nombre} - meta`, `${ind.nombre} - % vs esperado`);
  for (const r of C.RATIOS) encabezado.push(`${r.nombre} (%)`);
  const filas = tramos.map((t) => {
    const fila = [t.periodo.ini, t.periodo.fin, csvNum(indiceCumplimiento(t))];
    for (const ind of C.INDICADORES) {
      const r = t.indicadores.find((i) => i.id === ind.id)!;
      fila.push(csvNum(t.evalFin ? r.realizado : r.realizadoActual), csvNum(r.meta), csvNum(r.cumplimientoEsperado));
    }
    for (const def of C.RATIOS) fila.push(csvNum(t.ratios.find((x) => x.id === def.id)!.valor));
    return fila;
  });
  const escapar = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const texto = [encabezado, ...filas].map((f) => f.map(escapar).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** "Octubre de 2026" para un mes completo; fechas explícitas para semanas y tramos recortados. */
function etiquetaTramo(t: Evaluacion): string {
  const p = t.periodo;
  if (p.tipo === 'dia') return F.formatoMedio(p.ini);
  if (p.tipo === 'mes' && p.ini === F.inicioMes(p.ini) && p.fin === F.finMes(p.ini)) return F.formatoMes(p.ini);
  return `${F.formatoMedio(p.ini)} – ${F.formatoMedio(p.fin)}`;
}

function TablaTramos({ tramos, todos }: { tramos: Evaluacion[]; todos: boolean }) {
  const columnas = todos ? C.INDICADORES.map((i) => i.id) : INDICADORES_CLAVE;
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla--historico">
        <thead>
          <tr>
            <th scope="col">Periodo</th>
            <th scope="col" className="num">Índice</th>
            {columnas.map((id) => <th key={id} scope="col" className="num">{C.nombreCorto(id)}</th>)}
          </tr>
        </thead>
        <tbody>
          {tramos.map((t) => {
            const indice = indiceCumplimiento(t);
            return (
              <tr key={t.periodo.ini}>
                <th scope="row">{etiquetaTramo(t)}</th>
                <td className="num">
                  {indice === null ? <span className="texto-suave">{t.evalFin ? '—' : 'En curso'}</span>
                    : <span className="celda-estado"><span className={`punto punto--${estadoIndice(indice, t)}`} aria-hidden="true" />{pct(indice)}</span>}
                </td>
                {columnas.map((id) => {
                  const r = t.indicadores.find((i) => i.id === id)!;
                  const realizado = t.evalFin ? r.realizado : r.realizadoActual;
                  return (
                    <td key={id} className="num" title={r.meta !== null ? `Meta ${num(r.meta)} · ${pct(r.cumplimientoEsperado)} del esperado` : 'Sin meta'}>
                      {r.cumplimientoEsperado !== null ? (
                        <span className="celda-estado"><span className={`punto punto--${r.estado}`} aria-hidden="true" />{num(realizado, 0)}</span>
                      ) : num(realizado, 0)}
                      {r.meta !== null ? <span className="celda-meta-texto">de {num(r.meta)}</span> : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Historico() {
  const { usuario, servicios: s, hoy } = useSesion();
  const veEquipo = perm.veEquipo(usuario);
  const [objetivo, setObjetivo] = useState<string>(veEquipo ? 'equipo' : usuario.id);
  const [atajo, setAtajo] = useState<Atajo>('este_mes');
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('semana');
  const [personalizado, setPersonalizado] = useState(() => ({ ini: F.inicioMes(hoy), fin: hoy }));
  const [borrador, setBorrador] = useState(personalizado);
  const [todos, setTodos] = useState(false);
  const [indicadorTendencia, setIndicadorTendencia] = useState('prospectos');

  const rango = atajo === 'personalizado' ? personalizado : rangoDeAtajo(atajo, hoy);

  const comerciales = useCarga(async () => (veEquipo ? s.listarComerciales(usuario, { incluirInactivos: true }) : []), [s, usuario, veEquipo]);
  const datos = useCarga(() => s.historico(usuario, objetivo, agrupacion, rango.ini, rango.fin), [s, usuario, objetivo, agrupacion, rango.ini, rango.fin]);

  const cambiarAtajo = (a: Atajo) => {
    setAtajo(a);
    setAgrupacion(ATAJOS.find((x) => x.valor === a)!.agrupacion);
  };

  const nombreObjetivo = objetivo === 'equipo' ? 'Equipo'
    : (comerciales.datos?.find((c) => c.id === objetivo)?.nombre ?? usuario.nombre);

  return (
    <>
      <Encabezado titulo="Histórico" subtitulo={veEquipo
        ? 'Consulta la evolución de cada comercial o del equipo por día, semana, mes, año o un rango personalizado.'
        : 'Consulta tu evolución por día, semana, mes, año o un rango personalizado.'} />

      <div className="controles">
        {veEquipo ? (
          <select aria-label="Comercial" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
            <option value="equipo">Equipo (consolidado)</option>
            {(comerciales.datos ?? []).map((c) => <option key={c.id} value={c.id}>{c.activo ? c.nombre : `${c.nombre} (inactivo)`}</option>)}
          </select>
        ) : null}
        <select aria-label="Rango" value={atajo} onChange={(e) => cambiarAtajo(e.target.value as Atajo)}>
          {ATAJOS.map((a) => <option key={a.valor} value={a.valor}>{a.texto}</option>)}
        </select>
        <Segmentado etiqueta="Agrupar por" opciones={AGRUPACIONES} valor={agrupacion} onCambio={setAgrupacion} />
        <button type="button" className="btn" disabled={!datos.datos}
          onClick={() => datos.datos && descargarCsv(`pulso-dmb-historico-${nombreObjetivo.toLowerCase().replace(/\s+/g, '-')}-${rango.ini}-a-${rango.fin}.csv`, datos.datos.tramos)}>
          Descargar CSV
        </button>
      </div>

      {atajo === 'personalizado' ? (
        <form className="controles controles--rango" onSubmit={(e) => { e.preventDefault(); setPersonalizado(borrador); }}>
          <Campo etiqueta="Desde">{(id) => <input id={id} type="date" required value={borrador.ini} onChange={(e) => setBorrador((b) => ({ ...b, ini: e.target.value }))} />}</Campo>
          <Campo etiqueta="Hasta">{(id) => <input id={id} type="date" required value={borrador.fin} onChange={(e) => setBorrador((b) => ({ ...b, fin: e.target.value }))} />}</Campo>
          <button type="submit" className="btn btn--primario">Consultar</button>
        </form>
      ) : null}

      <p className="nota">{F.formatoLargo(rango.ini)} — {F.formatoLargo(rango.fin)} · evaluado con registros hasta ayer.</p>

      {datos.error ? <ErrorCarga error={datos.error} /> : null}
      {!datos.datos ? (datos.error ? null : <Cargando />) : (() => {
        const { resumen, tramos } = datos.datos;
        const indice = indiceCumplimiento(resumen);
        const esEquipo = objetivo === 'equipo';
        const etiquetas = tramos.map((t) => F.etiquetaCorta(t.periodo));
        const resultados = tramos.map((t) => t.indicadores.find((i) => i.id === indicadorTendencia)!);
        return (
          <div className={`pila ${datos.cargando ? 'pila--recargando' : ''}`}>
            <div className="cifras">
              <Cifra principal titulo={`Índice de cumplimiento · ${nombreObjetivo}`} valor={indice === null ? '—' : pct(indice)} estado={estadoIndice(indice, resumen)}
                detalle={resumen.evalFin ? `${resumen.diasHabilesTranscurridos} de ${resumen.diasHabiles} días hábiles evaluados` : 'El rango aún no tiene días evaluados'} />
              <Cifra titulo="Días registrados" valor={`${resumen.diasRegistrados} de ${resumen.diasHabilesExigibles}`}
                detalle={esEquipo ? 'días hábiles exigibles, sumando al equipo' : 'días hábiles exigibles desde su fecha de inicio'} />
              <Cifra titulo="Días sin registro" valor={String(resumen.diasHabilesExigibles - resumen.diasRegistrados)}
                detalle={!esEquipo && resumen.diasSinRegistro.length ? resumen.diasSinRegistro.slice(-5).map(F.formatoMedio).join(', ') + (resumen.diasSinRegistro.length > 5 ? '…' : '') : esEquipo ? 'sumando al equipo' : 'Ninguno'} />
              <Cifra titulo="Registros en días no hábiles" valor={String(resumen.diasExcepcionales.length)} detalle="sábados, domingos o festivos" />
            </div>

            <div className="kpis">
              {INDICADORES_CLAVE.map((id) => <TarjetaKpi key={id} r={resumen.indicadores.find((i) => i.id === id)!} />)}
            </div>

            <div className="rejilla rejilla--graficas">
              <Tarjeta>
                <GraficaLineas
                  titulo={`Índice de cumplimiento por ${agrupacion === 'dia' ? 'día' : agrupacion}`}
                  etiquetas={etiquetas}
                  series={[{ id: 'indice', nombre: 'Índice', color: COLORES_SERIE[0], valores: tramos.map(indiceCumplimiento) }]}
                  formato={(n) => `${num(n, 0)} %`}
                  referencia={{ valor: 100, etiqueta: 'Meta 100 %' }}
                  minimoMaximo={100}
                />
              </Tarjeta>
              <Tarjeta>
                <div className="controles controles--compactos">
                  <label className="solo-lector" htmlFor="indicador-historico">Indicador</label>
                  <select id="indicador-historico" value={indicadorTendencia} onChange={(e) => setIndicadorTendencia(e.target.value)}>
                    {C.INDICADORES.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                  </select>
                </div>
                <GraficaColumnasMeta
                  titulo={C.buscar(indicadorTendencia)?.nombre ?? ''}
                  etiquetas={etiquetas}
                  columnas={resultados.map((r, k) => (tramos[k].evalFin ? r.realizado : r.realizadoActual))}
                  meta={resultados.map((r) => r.esperado)}
                  nombreColumnas="Realizado"
                  nombreMeta="Meta (al corte en el tramo actual)"
                  formato={(n) => num(n)}
                />
              </Tarjeta>
            </div>

            <Tarjeta titulo={`Detalle por ${agrupacion === 'dia' ? 'día' : agrupacion}`}>
              <label className="opcion">
                <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Mostrar todos los indicadores
              </label>
              <TablaTramos tramos={tramos} todos={todos} />
              <p className="nota">Cada celda muestra lo realizado y, si hay meta, la meta del tramo. El punto indica el semáforo frente al avance esperado. Los tramos de los extremos pueden ser parciales.</p>
            </Tarjeta>

            <TablaIndicadores ev={resumen} />
            <TablaRatios ev={resumen} />
            {esEquipo ? <p className="nota">En el consolidado del equipo, los ratios usan el promedio de los umbrales individuales. <Semaforo estado="en_curso" /> significa que el tramo aún no tiene días evaluados.</p> : null}
          </div>
        );
      })()}
    </>
  );
}
