/**
 * Registros del equipo: calendario mensual por comercial.
 * Administrador: consulta y corrige cualquier día. Director(a): solo consulta.
 */
import { useState } from 'react';
import { useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as F from '../core/fechas';
import type { FechaISO, Registro, Usuario } from '../core/tipos';
import * as perm from '../datos/permisos';
import { Aviso, Cargando, Encabezado, ErrorCarga, Tarjeta, useAvisos, Vacio } from '../ui/componentes';
import { NavegadorPeriodo, SelectorComercial } from '../ui/Controles';
import { FormularioRegistro } from '../ui/FormularioRegistro';
import { fechaHora } from '../ui/formato';

const NOMBRES_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type EstadoDia = 'registrado' | 'excepcional' | 'faltante' | 'pendiente' | 'nohabil' | 'futuro' | 'previo';

const ETIQUETAS: Record<EstadoDia, string> = {
  registrado: 'Registrado',
  excepcional: 'Excepcional (día no hábil)',
  faltante: 'Sin registro',
  pendiente: 'Hoy, pendiente',
  nohabil: 'No hábil',
  futuro: 'Futuro',
  previo: 'Antes del inicio',
};

function estadoDia(f: FechaISO, reg: Registro | undefined, comercial: Usuario, hoy: FechaISO): EstadoDia {
  if (reg) return reg.excepcional ? 'excepcional' : 'registrado';
  if (f > hoy) return 'futuro';
  if (f < comercial.fechaInicio) return 'previo';
  if (!F.esHabil(f)) return 'nohabil';
  return f === hoy ? 'pendiente' : 'faltante';
}

export function Registros() {
  const { usuario, servicios: s, hoy } = useSesion();
  const { toast } = useAvisos();
  const esAdmin = perm.esAdmin(usuario);
  const [comercialId, setComercialId] = useState<string | null>(null);
  const [mes, setMes] = useState<FechaISO>(F.inicioMes(hoy));
  const [dia, setDia] = useState<FechaISO | null>(null);

  const base = useCarga(async () => {
    const [comerciales, usuarios] = await Promise.all([
      s.listarComerciales(usuario, { incluirInactivos: true }),
      s.listarUsuarios(usuario),
    ]);
    return { comerciales, nombres: Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])) };
  }, [s, usuario]);

  const comercial = base.datos?.comerciales.find((c) => c.id === comercialId) ?? base.datos?.comerciales[0];
  const ini = F.inicioMes(mes);
  const fin = F.finMes(mes);

  const registros = useCarga(
    async () => (comercial ? s.listarRegistros(usuario, comercial.id, ini, fin) : []),
    [s, usuario, comercial?.id, ini, fin],
  );

  const subtitulo = esAdmin
    ? 'Consulta el registro diario de cada comercial y corrige días anteriores cuando sea necesario.'
    : 'Consulta el registro diario de cada comercial.';

  if (base.error) return <ErrorCarga error={base.error} />;
  if (!base.datos) return <Cargando />;
  if (!comercial) return <><Encabezado titulo="Registros del equipo" subtitulo={subtitulo} /><Vacio>Todavía no hay comerciales.</Vacio></>;

  const porFecha: Record<FechaISO, Registro> = Object.fromEntries((registros.datos ?? []).map((r) => [r.fecha, r]));
  const faltantes = F.listaFechas(ini, F.menor(fin, F.sumarDias(hoy, -1)))
    .filter((f) => estadoDia(f, porFecha[f], comercial, hoy) === 'faltante').length;
  const reg = dia ? porFecha[dia] : undefined;

  return (
    <>
      <Encabezado titulo="Registros del equipo" subtitulo={subtitulo} />
      <div className="controles">
        <SelectorComercial comerciales={base.datos.comerciales} valor={comercial.id} onCambio={(id) => { setComercialId(id); setDia(null); }} />
        <NavegadorPeriodo
          etiqueta={F.formatoMes(ini)}
          onAnterior={() => { setMes(F.inicioMes(F.sumarDias(ini, -1))); setDia(null); }}
          onSiguiente={() => { setMes(F.sumarDias(fin, 1)); setDia(null); }}
          onHoy={ini === F.inicioMes(hoy) ? undefined : () => { setMes(F.inicioMes(hoy)); setDia(null); }}
        />
      </div>
      {registros.error ? <ErrorCarga error={registros.error} /> : null}
      <div className="columnas columnas--parejas">
        <div className="columnas__principal">
          <Tarjeta>
            <p className="resumen-mes">
              <strong>{registros.datos?.length ?? 0}</strong> {registros.datos?.length === 1 ? 'día registrado' : 'días registrados'} ·{' '}
              <strong className={faltantes ? 'texto-rojo' : undefined}>{faltantes}</strong> {faltantes === 1 ? 'día hábil sin registro' : 'días hábiles sin registro'}
            </p>
            <div className="calendario">
              {NOMBRES_DIAS.map((d) => <div key={d} className="calendario__cabecera">{d}</div>)}
              {F.listaFechas(F.inicioSemana(ini), F.finSemana(fin)).map((f) => {
                if (f < ini || f > fin) return <div key={f} className="dia dia--fuera" aria-hidden="true" />;
                const estado = estadoDia(f, porFecha[f], comercial, hoy);
                const festivo = F.nombreFestivo(f);
                return (
                  <button
                    key={f}
                    type="button"
                    className={`dia dia--${estado}${f === hoy ? ' dia--hoy' : ''}${f === dia ? ' dia--sel' : ''}`}
                    disabled={f > hoy}
                    title={`${F.formatoLargo(f)} · ${ETIQUETAS[estado]}${festivo ? ` · ${festivo}` : ''}`}
                    onClick={() => setDia(f)}
                  >
                    <span className="dia__numero">{Number(f.slice(8))}</span>
                    {festivo ? <span className="dia__festivo">Festivo</span> : null}
                  </button>
                );
              })}
            </div>
            <ul className="leyenda">
              {(['registrado', 'excepcional', 'faltante', 'pendiente', 'nohabil'] as EstadoDia[]).map((e) => (
                <li key={e}><span className={`leyenda__muestra dia--${e}`} />{ETIQUETAS[e]}</li>
              ))}
            </ul>
          </Tarjeta>
        </div>
        <div className="columnas__lateral">
          {!dia ? <Vacio>Selecciona un día del calendario para ver su detalle.</Vacio> : (
            <Tarjeta titulo={`${comercial.nombre} · ${F.formatoLargo(dia)}`}>
              {F.motivoNoHabil(dia) ? <Aviso tipo="info">Día no hábil ({F.motivoNoHabil(dia)}).</Aviso> : null}
              {reg?.corregidoPorAdmin ? <Aviso tipo="atencion">Este registro tiene correcciones del administrador.</Aviso> : null}
              {reg ? (
                <ul className="auditoria">
                  {reg.historial.map((x, i) => (
                    <li key={i}>
                      {x.accion === 'creado' ? 'Creado' : 'Editado'} por {base.datos!.nombres[x.por] ?? 'usuario'} · {fechaHora(x.momento)}
                      {x.correccion ? <span className="etiqueta etiqueta--atencion">Corrección</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {reg || esAdmin ? (
                <FormularioRegistro
                  key={`${comercial.id}-${dia}-${reg?.actualizado ?? 'nuevo'}`}
                  valores={reg?.valores}
                  soloLectura={!esAdmin}
                  textoBoton={reg ? 'Guardar corrección' : 'Registrar como corrección administrativa'}
                  onGuardar={async (valores) => {
                    try {
                      await s.guardarRegistro(usuario, comercial.id, dia, valores);
                      toast('Registro guardado como corrección del administrador.');
                      await registros.recargar();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : String(e), 'error');
                    }
                  }}
                />
              ) : <Vacio>No hay registro para este día.</Vacio>}
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}
