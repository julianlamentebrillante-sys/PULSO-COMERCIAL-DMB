/** Equipo comercial (solo administrador): crear, editar, activar y desactivar. */
import { useState, type FormEvent } from 'react';
import { useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as F from '../core/fechas';
import type { Rol, Usuario } from '../core/tipos';
import { ROLES } from '../datos/permisos';
import { MIN_LONGITUD_CLAVE } from '../datos/servicios';
import { Campo, Cargando, Encabezado, ErrorCarga, Modal, Tarjeta, useAvisos } from '../ui/componentes';

const nombreRol = (r: Rol) => ROLES.find((x) => x.id === r)?.nombre ?? r;

function FormularioUsuario({ existente, onCerrar, onGuardado }: { existente: Usuario | null; onCerrar: () => void; onGuardado: () => Promise<void> }) {
  const { usuario: actor, servicios: s, hoy } = useSesion();
  const { toast } = useAvisos();
  const [nombre, setNombre] = useState(existente?.nombre ?? '');
  const [usuario, setUsuario] = useState(existente?.usuario ?? '');
  const [roles, setRoles] = useState<Rol[]>(existente?.roles ?? ['comercial']);
  const [fechaInicio, setFechaInicio] = useState(existente?.fechaInicio ?? hoy);
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);

  const alternarRol = (r: Rol) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const datos = { nombre, usuario, roles, fechaInicio, clave };
      if (existente) await s.actualizarUsuario(actor, existente.id, datos);
      else await s.crearUsuario(actor, datos);
      toast(existente ? 'Cambios guardados.' : `${nombre.trim()} fue creado.`);
      await onGuardado();
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal titulo={existente ? `Editar · ${existente.nombre}` : 'Nueva persona'} onCerrar={onCerrar}>
      <form className="pila" onSubmit={guardar}>
        <Campo etiqueta="Nombre">{(id) => <input id={id} required value={nombre} onChange={(e) => setNombre(e.target.value)} />}</Campo>
        <Campo etiqueta="Usuario de acceso" ayuda="Minúsculas, sin espacios. Ej.: carlos.perez">
          {(id) => <input id={id} required autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} />}
        </Campo>
        <fieldset className="campo">
          <legend>Roles</legend>
          <div className="opciones">
            {ROLES.map((r) => (
              <label key={r.id} className="opcion">
                <input type="checkbox" checked={roles.includes(r.id)} onChange={() => alternarRol(r.id)} /> {r.nombre}
              </label>
            ))}
          </div>
          <small className="campo__ayuda">Comercial: registra actividad. Director(a): ve al equipo. Administrador: configura todo.</small>
        </fieldset>
        <Campo etiqueta="Fecha de inicio" ayuda="Desde esta fecha se le exige el registro diario.">
          {(id) => <input id={id} type="date" required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />}
        </Campo>
        {existente ? null : (
          <Campo etiqueta="Contraseña inicial" ayuda={`Mínimo ${MIN_LONGITUD_CLAVE} caracteres. Compártela por un canal privado.`}>
            {(id) => <input id={id} type="text" required autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />}
          </Campo>
        )}
        {error ? <p className="aviso aviso--error" role="alert">{error}</p> : null}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn--primario">{existente ? 'Guardar cambios' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RestablecerClave({ persona, onCerrar }: { persona: Usuario; onCerrar: () => void }) {
  const { usuario: actor, servicios: s } = useSesion();
  const { toast } = useAvisos();
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal titulo={`Restablecer contraseña · ${persona.nombre}`} onCerrar={onCerrar}>
      <form className="pila" onSubmit={async (e) => {
        e.preventDefault();
        try {
          await s.restablecerClave(actor, persona.id, clave);
          toast('Contraseña restablecida.');
          onCerrar();
        } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
      }}>
        <Campo etiqueta="Nueva contraseña" ayuda={`Mínimo ${MIN_LONGITUD_CLAVE} caracteres.`}>
          {(id) => <input id={id} type="text" required autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />}
        </Campo>
        {error ? <p className="aviso aviso--error" role="alert">{error}</p> : null}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn--primario">Restablecer</button>
        </div>
      </form>
    </Modal>
  );
}

export function Equipo() {
  const { usuario: actor, servicios: s } = useSesion();
  const { toast, confirmar } = useAvisos();
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);
  const [clave, setClave] = useState<Usuario | null>(null);
  const personas = useCarga(() => s.listarUsuarios(actor), [s, actor]);

  const cambiarEstado = async (p: Usuario) => {
    const ok = await confirmar(p.activo
      ? `${p.nombre} no podrá iniciar sesión y dejará de generar alertas. Su histórico se conserva. ¿Desactivar?`
      : `¿Reactivar a ${p.nombre}?`, { aceptar: p.activo ? 'Desactivar' : 'Reactivar', peligro: p.activo });
    if (!ok) return;
    try {
      await s.cambiarEstadoUsuario(actor, p.id, !p.activo);
      toast(p.activo ? `${p.nombre} fue desactivado.` : `${p.nombre} fue reactivado.`);
      await personas.recargar();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  if (personas.error) return <ErrorCarga error={personas.error} />;
  if (!personas.datos) return <Cargando />;

  return (
    <>
      <Encabezado titulo="Equipo comercial" subtitulo="Agrega nuevos comerciales sin modificar la aplicación.">
        <button type="button" className="btn btn--primario" onClick={() => setEditando('nuevo')}>+ Nueva persona</button>
      </Encabezado>
      <Tarjeta>
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Usuario</th>
                <th scope="col">Roles</th>
                <th scope="col">Inicio</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="solo-lector">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {personas.datos.map((p) => (
                <tr key={p.id} className={p.activo ? undefined : 'fila--inactiva'}>
                  <th scope="row">{p.nombre}{p.id === actor.id ? <span className="etiqueta">Tú</span> : null}</th>
                  <td>{p.usuario}</td>
                  <td>{p.roles.map(nombreRol).join(' · ')}</td>
                  <td>{F.formatoMedio(p.fechaInicio)}</td>
                  <td><span className={`etiqueta ${p.activo ? 'etiqueta--vigente' : 'etiqueta--historica'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="acciones-fila">
                    <button type="button" className="btn btn--suave btn--peq" onClick={() => setEditando(p)}>Editar</button>
                    <button type="button" className="btn btn--suave btn--peq" onClick={() => setClave(p)}>Contraseña</button>
                    {p.id !== actor.id ? (
                      <button type="button" className="btn btn--suave btn--peq" onClick={() => cambiarEstado(p)}>{p.activo ? 'Desactivar' : 'Reactivar'}</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      {editando ? (
        <FormularioUsuario existente={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} onGuardado={personas.recargar} />
      ) : null}
      {clave ? <RestablecerClave persona={clave} onCerrar={() => setClave(null)} /> : null}
    </>
  );
}
