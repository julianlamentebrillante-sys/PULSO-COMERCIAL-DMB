/** Mi actividad: registro diario del comercial (solo el día de hoy). */
import { useApp, useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as F from '../core/fechas';
import type { FechaISO, Registro } from '../core/tipos';
import { Aviso, Cargando, Encabezado, ErrorCarga, Tarjeta, useAvisos, Vacio } from '../ui/componentes';
import { FormularioRegistro } from '../ui/FormularioRegistro';
import { hora } from '../ui/formato';

const DIAS_RECIENTES = 10;

function ultimosDiasHabiles(hoy: FechaISO, desde: FechaISO): FechaISO[] {
  const dias: FechaISO[] = [];
  for (let f = F.sumarDias(hoy, -1); dias.length < DIAS_RECIENTES && f >= desde; f = F.sumarDias(f, -1)) {
    if (F.esHabil(f)) dias.push(f);
  }
  return dias;
}

export function MiActividad() {
  const { usuario, servicios: s, hoy } = useSesion();
  const { refrescarNotificaciones } = useApp();
  const { toast } = useAvisos();

  const { datos, error, recargar } = useCarga(async () => {
    const [registro, evHoy, recientes] = await Promise.all([
      s.obtenerRegistro(usuario, usuario.id, hoy),
      s.evaluar(usuario, usuario.id, 'dia', F.periodo('dia', hoy)),
      s.listarRegistros(usuario, usuario.id, F.sumarDias(hoy, -30), hoy),
    ]);
    // Solo metas diarias explícitas: una meta semanal repartida ("0,4 propuestas") confunde en el formulario.
    const metasDia = Object.fromEntries(evHoy.indicadores.filter((i) => i.meta && !i.metaDerivada).map((i) => [i.id, i.meta as number]));
    return { registro, metasDia, recientes };
  }, [s, usuario, hoy]);

  if (error) return <ErrorCarga error={error} />;
  if (!datos) return <Cargando />;

  const { registro, metasDia, recientes } = datos;
  const conRegistro = new Set(recientes.map((r: Registro) => r.fecha));
  const dias = ultimosDiasHabiles(hoy, usuario.fechaInicio);
  const motivo = F.motivoNoHabil(hoy);

  return (
    <>
      <Encabezado titulo="Mi actividad" subtitulo={F.formatoLargo(hoy)} />
      {motivo ? (
        <Aviso tipo="atencion">
          <strong>Hoy no es día hábil ({motivo}). </strong>
          Puedes registrar actividad, pero quedará marcada como excepcional y se notificará al administrador.
        </Aviso>
      ) : null}
      <p className={`estado-guardado ${registro ? 'estado-guardado--ok' : 'estado-guardado--pendiente'}`}>
        {registro
          ? `Registro de hoy guardado (última actualización: ${hora(registro.actualizado)}) · puedes modificarlo hasta el final del día.`
          : 'Aún no has registrado tu actividad de hoy.'}
      </p>
      <div className="columnas">
        <div className="columnas__principal">
          <FormularioRegistro
            key={registro?.actualizado ?? 'nuevo'}
            valores={registro?.valores}
            metasDia={metasDia}
            textoBoton={registro ? 'Actualizar registro de hoy' : 'Guardar registro de hoy'}
            onGuardar={async (valores) => {
              try {
                await s.guardarRegistro(usuario, usuario.id, hoy, valores);
                toast('Registro guardado.');
                await recargar();
                await refrescarNotificaciones();
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), 'error');
              }
            }}
          />
        </div>
        <aside className="columnas__lateral">
          <Tarjeta titulo="Mis últimos días hábiles">
            {dias.length ? (
              <ul className="recientes">
                {dias.map((f) => (
                  <li key={f} className={`reciente ${conRegistro.has(f) ? 'reciente--ok' : 'reciente--falta'}`}>
                    <span className="reciente__icono" aria-hidden="true">{conRegistro.has(f) ? '✓' : '✕'}</span>
                    <span>{F.formatoMedio(f)}</span>
                    <span className="reciente__estado">{conRegistro.has(f) ? 'Registrado' : 'Sin registro'}</span>
                  </li>
                ))}
              </ul>
            ) : <Vacio>Aquí verás tus últimos días hábiles.</Vacio>}
            <p className="nota">Solo puedes registrar o modificar el día de hoy. Los días anteriores solo los corrige el administrador.</p>
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}
