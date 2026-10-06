/**
 * Herramientas de prueba (solo administrador, solo en el prototipo local).
 * Permiten validar las reglas de fechas sin esperar días reales.
 */
import { useRef, useState } from 'react';
import { useApp, useSesion } from '../app/contexto';
import * as F from '../core/fechas';
import { cargarDemo, sembrar } from '../datos/semilla';
import { Aviso, Campo, Encabezado, Tarjeta, useAvisos } from '../ui/componentes';

export function Pruebas() {
  const { repo, fechaSimulada, cambiarFechaSimulada, recargarTodo, hoy } = useSesion();
  const { almacenamientoPersistente } = useApp();
  const { toast, confirmar } = useAvisos();
  const [fecha, setFecha] = useState(fechaSimulada ?? F.hoyBogota());
  const archivo = useRef<HTMLInputElement>(null);

  const accion = async (fn: () => Promise<void>, mensaje: string) => {
    try { await fn(); toast(mensaje); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const exportar = async () => {
    const bd = await repo.exportar();
    const url = URL.createObjectURL(new Blob([JSON.stringify(bd, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulso-dmb-respaldo-${F.hoyBogota()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importar = async (file: File) => {
    if (!(await confirmar('Importar reemplaza TODOS los datos actuales por los del archivo. ¿Continuar?', { aceptar: 'Importar', peligro: true }))) return;
    await accion(async () => {
      await repo.importar(JSON.parse(await file.text()));
      await recargarTodo();
    }, 'Respaldo importado.');
  };

  return (
    <>
      <Encabezado titulo="Herramientas de prueba" subtitulo="Solo existen en el prototipo local, para validar la funcionalidad antes de pasar a Supabase." />
      {!almacenamientoPersistente ? (
        <Aviso tipo="error">Este navegador no permite guardar datos: lo que hagas se perderá al cerrar la pestaña.</Aviso>
      ) : null}
      <div className="rejilla">
        <Tarjeta titulo="Fecha simulada">
          <p>Hace que la aplicación funcione como si hoy fuera otra fecha. Sirve para probar el cambio de día, los fines de semana, los festivos y los cierres de semana y mes.</p>
          <p className="nota">Hoy en la aplicación: <strong>{F.formatoLargo(hoy)}</strong>{fechaSimulada ? ' (simulada)' : ''}.</p>
          <div className="fila-campos">
            <Campo etiqueta="Fecha">{(id) => <input id={id} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}</Campo>
          </div>
          <div className="acciones acciones--izq">
            <button type="button" className="btn btn--primario" disabled={!F.esFechaValida(fecha)}
              onClick={() => accion(() => cambiarFechaSimulada(fecha), `Fecha simulada: ${F.formatoLargo(fecha)}.`)}>Aplicar</button>
            {fechaSimulada ? (
              <button type="button" className="btn" onClick={() => accion(() => cambiarFechaSimulada(null), 'Volviste a la fecha real.')}>Volver a la fecha real</button>
            ) : null}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Datos de demostración">
          <p>Carga 7 semanas de historia para María Fernanda y para un «Comercial Demo» de bajo desempeño, con metas, umbrales, un cambio de meta hace dos semanas y un registro en sábado.</p>
          <p className="nota">El comercial demo inicia sesión con el usuario <code>demo</code> y la misma contraseña inicial del prototipo (ver README).</p>
          <div className="acciones acciones--izq">
            <button type="button" className="btn btn--primario" onClick={async () => {
              if (!(await confirmar('Esto reemplaza TODOS los datos actuales por datos de demostración y cierra la sesión. ¿Continuar?', { aceptar: 'Cargar demostración', peligro: true }))) return;
              await accion(async () => { await cargarDemo(repo, hoy); await recargarTodo(); }, 'Datos de demostración cargados.');
            }}>Cargar demostración</button>
            <button type="button" className="btn" onClick={async () => {
              if (!(await confirmar('Esto borra TODOS los datos, deja solo los usuarios iniciales y cierra la sesión. ¿Continuar?', { aceptar: 'Reiniciar', peligro: true }))) return;
              await accion(async () => { await repo.reiniciar(); await sembrar(repo, hoy); await recargarTodo(); }, 'Datos reiniciados.');
            }}>Reiniciar a estado inicial</button>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Respaldo">
          <p>Los datos del prototipo viven solo en este navegador. Exporta un respaldo antes de limpiar el navegador o para moverlos a otro equipo.</p>
          <div className="acciones acciones--izq">
            <button type="button" className="btn" onClick={exportar}>Exportar respaldo (JSON)</button>
            <button type="button" className="btn" onClick={() => archivo.current?.click()}>Importar respaldo</button>
            <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importar(f);
            }} />
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
