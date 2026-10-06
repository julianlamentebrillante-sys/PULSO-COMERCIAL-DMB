/**
 * Gráficas en SVG, sin librerías.
 * Reglas: marcas finas (líneas 2px, columnas ≤ 24px con extremo redondeado), rejilla
 * en hairline sólida, leyenda siempre con ≥ 2 series, etiquetas directas selectivas,
 * tooltip al pasar el cursor o con el teclado, y una vista de tabla equivalente.
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

/** Colores categóricos en orden fijo (validados contra daltonismo para hasta 4 series). */
export const COLORES_SERIE = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)'];

const ALTO = 220;
const MARGEN = { arriba: 14, abajo: 28, izq: 52 };
/** Ancho aproximado de un texto de 12px (para reservar espacio sin medir el DOM). */
const anchoTexto = (t: string) => t.length * 6.6;

/** Índices del eje X a rotular: espaciado uniforme contado desde el último, que siempre se muestra. */
function indicesEjeX(n: number, anchoPlot: number): Set<number> {
  const paso = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(anchoPlot / 64))));
  const out = new Set<number>();
  for (let i = n - 1; i >= 0; i -= paso) out.add(i);
  return out;
}

/** El primer y el último rótulo se alinean hacia dentro para no invadir los márgenes. */
function anclaEjeX(i: number, n: number, pegadoAlBorde: boolean): 'start' | 'middle' | 'end' {
  if (!pegadoAlBorde) return 'middle';
  if (i === 0) return 'start';
  if (i === n - 1) return 'end';
  return 'middle';
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Medida inmediata (sin esperar al observador) y luego seguimiento de cambios de tamaño.
    setAncho(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

/** Marcas de eje "limpias" (0, 25, 50…) que cubren el máximo. */
function marcasEje(maximo: number): number[] {
  if (maximo <= 0) return [0, 1];
  const crudo = maximo / 4;
  const potencia = Math.pow(10, Math.floor(Math.log10(crudo)));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo) ?? crudo;
  const out: number[] = [];
  for (let v = 0; v <= maximo + paso * 0.001; v += paso) out.push(Math.round(v * 1000) / 1000);
  if (out[out.length - 1] < maximo) out.push(out[out.length - 1] + paso);
  return out;
}

function Tooltip({ x, ancho, titulo, filas }: { x: number; ancho: number; titulo: string; filas: { clave: ReactNode; valor: string; nombre: string }[] }) {
  const izquierda = Math.min(Math.max(x + 12, 0), Math.max(0, ancho - 190));
  return (
    <div className="grafica__tooltip" style={{ left: izquierda }} role="status">
      <div className="grafica__tooltip-titulo">{titulo}</div>
      {filas.map((f, i) => (
        <div key={i} className="grafica__tooltip-fila">
          {f.clave}
          <strong>{f.valor}</strong>
          <span>{f.nombre}</span>
        </div>
      ))}
    </div>
  );
}

const ClaveLinea = ({ color }: { color: string }) => <span className="clave-linea" style={{ background: color }} aria-hidden="true" />;
const ClaveBarra = ({ color }: { color: string }) => <span className="clave-barra" style={{ background: color }} aria-hidden="true" />;

function Marco({ titulo, leyenda, tabla, children }: { titulo: string; leyenda?: ReactNode; tabla: ReactNode; children: ReactNode }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <figure className="grafica">
      <figcaption className="grafica__cabecera">
        <span className="grafica__titulo">{titulo}</span>
        <button type="button" className="btn btn--suave btn--peq" aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </figcaption>
      {leyenda && !verTabla ? <div className="grafica__leyenda">{leyenda}</div> : null}
      {verTabla ? <div className="tabla-contenedor">{tabla}</div> : children}
    </figure>
  );
}

// ---------- Líneas ----------

export interface SerieLinea { id: string; nombre: string; color: string; valores: (number | null)[] }

export function GraficaLineas({ titulo, etiquetas, series, formato, referencia, minimoMaximo = 0 }: {
  titulo: string;
  etiquetas: string[];
  series: SerieLinea[];
  formato: (n: number) => string;
  /** Línea horizontal de referencia (p. ej. 100 %). */
  referencia?: { valor: number; etiqueta: string };
  /** El eje Y llega al menos hasta este valor. */
  minimoMaximo?: number;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const n = etiquetas.length;
  const altoPlot = ALTO - MARGEN.arriba - MARGEN.abajo;

  // Etiqueta directa al final de cada línea: solo con ≤ 4 series y si cabe en el margen derecho.
  const textoFinal = (s: SerieLinea) => {
    const ult = [...s.valores].reverse().find((v) => v !== null);
    return ult === undefined || ult === null ? '' : `${formato(ult)}${series.length > 1 ? ` · ${s.nombre}` : ''}`;
  };
  const necesario = Math.max(0, ...series.map((s) => anchoTexto(textoFinal(s)))) + 14;
  const conEtiquetas = series.length <= 4 && necesario <= ancho * 0.35;
  const derecha = conEtiquetas ? necesario : 16;
  const anchoPlot = Math.max(0, ancho - MARGEN.izq - derecha);

  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const marcas = marcasEje(Math.max(minimoMaximo, referencia?.valor ?? 0, ...todos, 0));
  const maxY = marcas[marcas.length - 1];
  const x = (i: number) => MARGEN.izq + (n <= 1 ? anchoPlot / 2 : (i * anchoPlot) / (n - 1));
  const y = (v: number) => MARGEN.arriba + altoPlot - (v / maxY) * altoPlot;

  const tramos = (valores: (number | null)[]) => {
    const out: string[] = [];
    let actual = '';
    valores.forEach((v, i) => {
      if (v === null) { if (actual) out.push(actual); actual = ''; return; }
      actual += `${actual ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    if (actual) out.push(actual);
    return out;
  };

  // Etiquetas directas al final, solo si no se pisan.
  const finales = series.map((s) => {
    let i = s.valores.length - 1;
    while (i >= 0 && s.valores[i] === null) i--;
    return i >= 0 ? { s, i, y: y(s.valores[i] as number) } : null;
  }).filter((f): f is { s: SerieLinea; i: number; y: number } => f !== null);
  const ordenados = [...finales].sort((a, b) => a.y - b.y);
  const sinChoque = ordenados.every((f, k) => k === 0 || f.y - ordenados[k - 1].y >= 14);

  const mover = (e: PointerEvent<SVGRectElement>) => {
    const caja = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - caja.left;
    const i = n <= 1 ? 0 : Math.round(((px - MARGEN.izq) / anchoPlot) * (n - 1));
    setActivo(Math.min(n - 1, Math.max(0, i)));
  };
  const teclado = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActivo((a) => Math.min(n - 1, (a ?? -1) + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActivo((a) => Math.max(0, (a ?? n) - 1)); }
    if (e.key === 'Escape') setActivo(null);
  };

  const leyenda = series.length >= 2 ? series.map((s) => (
    <span key={s.id} className="leyenda-item"><ClaveLinea color={s.color} />{s.nombre}</span>
  )) : null;

  const tabla = (
    <table className="tabla">
      <thead><tr><th scope="col">Periodo</th>{series.map((s) => <th key={s.id} scope="col" className="num">{s.nombre}</th>)}</tr></thead>
      <tbody>
        {etiquetas.map((et, i) => (
          <tr key={et + i}><th scope="row">{et}</th>{series.map((s) => <td key={s.id} className="num">{s.valores[i] === null ? '—' : formato(s.valores[i] as number)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );

  const ejeX = indicesEjeX(n, anchoPlot);

  return (
    <Marco titulo={titulo} leyenda={leyenda} tabla={tabla}>
      <div className="grafica__lienzo" ref={ref}>
        {ancho > 0 ? (
          <svg width={ancho} height={ALTO} role="img" aria-label={`${titulo}. Usa las flechas para recorrer los periodos.`} tabIndex={0}
            onKeyDown={teclado} onBlur={() => setActivo(null)}>
            {marcas.map((m) => (
              <g key={m}>
                <line x1={MARGEN.izq} x2={MARGEN.izq + anchoPlot} y1={y(m)} y2={y(m)} className={m === 0 ? 'grafica__base' : 'grafica__rejilla'} />
                <text x={MARGEN.izq - 8} y={y(m)} className="grafica__eje" textAnchor="end" dominantBaseline="middle">{formato(m)}</text>
              </g>
            ))}
            {referencia ? (
              <g>
                <line x1={MARGEN.izq} x2={MARGEN.izq + anchoPlot} y1={y(referencia.valor)} y2={y(referencia.valor)} className="grafica__referencia" />
                <text x={MARGEN.izq + 4} y={y(referencia.valor) - 5} className="grafica__eje">{referencia.etiqueta}</text>
              </g>
            ) : null}
            {etiquetas.map((et, i) => ejeX.has(i) ? (
              <text key={i} x={x(i)} y={ALTO - 8} className="grafica__eje" textAnchor={anclaEjeX(i, n, true)}>{et}</text>
            ) : null)}
            {activo !== null ? <line x1={x(activo)} x2={x(activo)} y1={MARGEN.arriba} y2={MARGEN.arriba + altoPlot} className="grafica__cruz" /> : null}
            {series.map((s) => (
              <g key={s.id}>
                {tramos(s.valores).map((d, k) => <path key={k} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
                {s.valores.map((v, i) => {
                  // Puntos aislados (sin vecinos) y el punto activo se dibujan para que no desaparezcan.
                  const aislado = v !== null && (s.valores[i - 1] ?? null) === null && (s.valores[i + 1] ?? null) === null;
                  return v !== null && (aislado || i === activo) ? (
                    <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="var(--color-superficie)" strokeWidth={2} />
                  ) : null;
                })}
              </g>
            ))}
            {finales.map((f) => (
              <circle key={f.s.id} cx={x(f.i)} cy={f.y} r={4} fill={f.s.color} stroke="var(--color-superficie)" strokeWidth={2} />
            ))}
            {conEtiquetas && sinChoque ? finales.map((f) => (
              <text key={f.s.id} x={x(f.i) + 9} y={f.y} className="grafica__etiqueta" dominantBaseline="middle">
                {textoFinal(f.s)}
              </text>
            )) : null}
            <rect x={MARGEN.izq - 10} y={MARGEN.arriba} width={anchoPlot + 20} height={altoPlot} fill="transparent"
              onPointerMove={mover} onPointerLeave={() => setActivo(null)} />
          </svg>
        ) : null}
        {activo !== null && ancho > 0 ? (
          <Tooltip x={x(activo)} ancho={ancho} titulo={etiquetas[activo]}
            filas={series.map((s) => ({ clave: <ClaveLinea color={s.color} />, valor: s.valores[activo] === null ? '—' : formato(s.valores[activo] as number), nombre: s.nombre }))} />
        ) : null}
      </div>
    </Marco>
  );
}

// ---------- Columnas con línea de meta ----------

export function GraficaColumnasMeta({ titulo, etiquetas, columnas, meta, nombreColumnas, nombreMeta, formato }: {
  titulo: string;
  etiquetas: string[];
  columnas: (number | null)[];
  meta: (number | null)[];
  nombreColumnas: string;
  nombreMeta: string;
  formato: (n: number) => string;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const n = etiquetas.length;
  const derecha = 16;
  const anchoPlot = Math.max(0, ancho - MARGEN.izq - derecha);
  const altoPlot = ALTO - MARGEN.arriba - MARGEN.abajo;
  const banda = n ? anchoPlot / n : 0;
  const anchoBarra = Math.min(24, banda * 0.6);

  const valores = [...columnas, ...meta].filter((v): v is number => v !== null);
  const marcas = marcasEje(Math.max(1, ...valores));
  const maxY = marcas[marcas.length - 1];
  const cx = (i: number) => MARGEN.izq + banda * i + banda / 2;
  const y = (v: number) => MARGEN.arriba + altoPlot - (v / maxY) * altoPlot;
  const base = y(0);

  const barra = (i: number, v: number) => {
    const x0 = cx(i) - anchoBarra / 2;
    const alto = base - y(v);
    if (alto <= 0) return null;
    const r = Math.min(4, alto, anchoBarra / 2);
    // Extremo de datos redondeado, base recta.
    const d = `M${x0},${base}V${base - alto + r}Q${x0},${base - alto} ${x0 + r},${base - alto}H${x0 + anchoBarra - r}Q${x0 + anchoBarra},${base - alto} ${x0 + anchoBarra},${base - alto + r}V${base}Z`;
    return <path key={i} d={d} fill="var(--serie-1)" opacity={activo === null || activo === i ? 1 : 0.55} />;
  };

  let lineaMeta = '';
  meta.forEach((v, i) => {
    if (v === null) return;
    lineaMeta += `${lineaMeta && meta[i - 1] !== null ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`;
  });

  const teclado = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActivo((a) => Math.min(n - 1, (a ?? -1) + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActivo((a) => Math.max(0, (a ?? n) - 1)); }
    if (e.key === 'Escape') setActivo(null);
  };

  const ultimo = columnas.length - 1;
  const tabla = (
    <table className="tabla">
      <thead><tr><th scope="col">Periodo</th><th scope="col" className="num">{nombreColumnas}</th><th scope="col" className="num">{nombreMeta}</th></tr></thead>
      <tbody>
        {etiquetas.map((et, i) => (
          <tr key={et + i}>
            <th scope="row">{et}</th>
            <td className="num">{columnas[i] === null ? '—' : formato(columnas[i] as number)}</td>
            <td className="num">{meta[i] === null ? '—' : formato(meta[i] as number)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const ejeX = indicesEjeX(n, anchoPlot);

  return (
    <Marco titulo={titulo} tabla={tabla} leyenda={<>
      <span className="leyenda-item"><ClaveBarra color="var(--serie-1)" />{nombreColumnas}</span>
      <span className="leyenda-item"><ClaveLinea color="var(--serie-meta)" />{nombreMeta}</span>
    </>}>
      <div className="grafica__lienzo" ref={ref}>
        {ancho > 0 ? (
          <svg width={ancho} height={ALTO} role="img" aria-label={`${titulo}. Usa las flechas para recorrer los periodos.`} tabIndex={0}
            onKeyDown={teclado} onBlur={() => setActivo(null)}>
            {marcas.map((m) => (
              <g key={m}>
                <line x1={MARGEN.izq} x2={MARGEN.izq + anchoPlot} y1={y(m)} y2={y(m)} className={m === 0 ? 'grafica__base' : 'grafica__rejilla'} />
                <text x={MARGEN.izq - 8} y={y(m)} className="grafica__eje" textAnchor="end" dominantBaseline="middle">{formato(m)}</text>
              </g>
            ))}
            {etiquetas.map((et, i) => ejeX.has(i) ? (
              <text key={i} x={cx(i)} y={ALTO - 8} className="grafica__eje" textAnchor={anclaEjeX(i, n, false)}>{et}</text>
            ) : null)}
            {columnas.map((v, i) => (v === null ? null : barra(i, v)))}
            {lineaMeta ? <path d={lineaMeta} fill="none" stroke="var(--serie-meta)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
            {meta.map((v, i) => (v === null ? null : (
              <circle key={i} cx={cx(i)} cy={y(v)} r={activo === i ? 5 : 3.5} fill="var(--serie-meta)" stroke="var(--color-superficie)" strokeWidth={2} />
            )))}
            {ultimo >= 0 && columnas[ultimo] !== null ? (
              <text x={cx(ultimo)} y={y(columnas[ultimo] as number) - 8} className="grafica__etiqueta" textAnchor="middle">{formato(columnas[ultimo] as number)}</text>
            ) : null}
            {etiquetas.map((_, i) => (
              <rect key={i} x={MARGEN.izq + banda * i} y={MARGEN.arriba} width={banda} height={altoPlot} fill="transparent"
                onPointerMove={() => setActivo(i)} onPointerLeave={() => setActivo(null)} />
            ))}
          </svg>
        ) : null}
        {activo !== null && ancho > 0 ? (
          <Tooltip x={cx(activo)} ancho={ancho} titulo={etiquetas[activo]} filas={[
            { clave: <ClaveBarra color="var(--serie-1)" />, valor: columnas[activo] === null ? '—' : formato(columnas[activo] as number), nombre: nombreColumnas },
            { clave: <ClaveLinea color="var(--serie-meta)" />, valor: meta[activo] === null ? '—' : formato(meta[activo] as number), nombre: nombreMeta },
          ]} />
        ) : null}
      </div>
    </Marco>
  );
}
