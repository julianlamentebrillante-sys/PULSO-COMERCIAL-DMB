/** Notificaciones del administrador (registros en días no hábiles). */
import { useApp, useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as F from '../core/fechas';
import { Cargando, Encabezado, ErrorCarga, Tarjeta, useAvisos, Vacio } from '../ui/componentes';
import { fechaHora } from '../ui/formato';

export function Notificaciones() {
  const { usuario, servicios: s } = useSesion();
  const { refrescarNotificaciones } = useApp();
  const { toast } = useAvisos();
  const datos = useCarga(async () => {
    const [notificaciones, usuarios] = await Promise.all([s.listarNotificaciones(usuario), s.listarUsuarios(usuario)]);
    return { notificaciones, nombres: Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])) };
  }, [s, usuario]);

  if (datos.error) return <ErrorCarga error={datos.error} />;
  if (!datos.datos) return <Cargando />;
  const { notificaciones, nombres } = datos.datos;
  const noLeidas = notificaciones.filter((n) => !n.leida);

  const marcar = async (ids: string[], leida: boolean) => {
    try {
      for (const id of ids) await s.marcarNotificacion(usuario, id, leida);
      await datos.recargar();
      await refrescarNotificaciones();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  return (
    <>
      <Encabezado titulo="Notificaciones" subtitulo="Registros de actividad hechos en sábado, domingo o festivo. Son excepcionales: no deberían volverse costumbre.">
        {noLeidas.length ? <button type="button" className="btn" onClick={() => marcar(noLeidas.map((n) => n.id), true)}>Marcar todas como leídas</button> : null}
      </Encabezado>
      <Tarjeta>
        {notificaciones.length ? (
          <ul className="notificaciones">
            {notificaciones.map((n) => (
              <li key={n.id} className={`notificacion ${n.leida ? '' : 'notificacion--nueva'}`}>
                <div>
                  <p><strong>{nombres[n.userId] ?? 'Un comercial'}</strong> registró actividad el {F.formatoLargo(n.fecha).toLowerCase()} ({n.motivo}).</p>
                  <p className="nota">Recibida {fechaHora(n.creado)}</p>
                </div>
                <button type="button" className="btn btn--suave btn--peq" onClick={() => marcar([n.id], !n.leida)}>
                  {n.leida ? 'Marcar no leída' : 'Marcar leída'}
                </button>
              </li>
            ))}
          </ul>
        ) : <Vacio>No hay notificaciones.</Vacio>}
      </Tarjeta>
    </>
  );
}
