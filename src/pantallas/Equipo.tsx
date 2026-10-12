/**
 * Equipo comercial (solo administrador): autorizar o crear personas, editar,
 * activar, desactivar y restablecer contraseñas.
 *
 * Versión con Supabase (acceso con código): el administrador autoriza un correo y
 * entrega un código de activación; la persona crea su propia contraseña.
 * Prototipo local: el administrador crea la cuenta con una contraseña inicial.
 */
import { useState, type FormEvent } from 'react';
import { useSesion } from '../app/contexto';
import { useCarga } from '../app/useCarga';
import * as F from '../core/fechas';
import type { Rol, Usuario } from '../core/tipos';
import { ROLES } from '../datos/permisos';
import { MIN_LONGITUD_CLAVE, type AutorizacionPendiente } from '../datos/servicios';
import { ModalCodigo, type CodigoGenerado } from '../ui/CodigoAcceso';
import { Campo, Cargando, Encabezado, ErrorCarga, Modal, Tarjeta, useAvisos } from '../ui/componentes';
import { fechaHora } from '../ui/formato';

const nombreRol = (r: Rol) => ROLES.find((x) => x.id === r)?.nombre ?? r;

interface Inicial { nombre: string; correo: string; roles: Rol[]; fechaInicio: string }

function FormularioUsuario({ existente, inicial, onCerrar, onGuardado, onCodigo }: {
  existente: Usuario | null;
  inicial?: Inicial;
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
  onCodigo: (c: CodigoGenerado) => void;
}) {
  const { usuario: actor, servicios: s, hoy } = useSesion();
  const conCodigo = s.accesoConCodigo;
  const { toast } = useAvisos();
  const [nombre, setNombre] = useState(existente?.nombre ?? inicial?.nombre ?? '');
  const [usuario, setUsuario] = useState(existente?.usuario ?? inicial?.correo ?? '');
  const [roles, setRoles] = useState<Rol[]>(existente?.roles ?? inicial?.roles ?? ['comercial']);
  const [fechaInicio, setFechaInicio] = useState(existente?.fechaInicio ?? inicial?.fechaInicio ?? hoy);
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const alternarRol = (r: Rol) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const datos = { nombre, usuario, roles, fechaInicio, clave };
      if (existente) {
        await s.actualizarUsuario(actor, existente.id, datos);
        toast('Cambios guardados.');
      } else if (conCodigo) {
        const codigo = await s.autorizarAcceso(actor, datos);
        onCodigo({ tipo: 'activacion', nombre: nombre.trim(), correo: usuario.trim().toLowerCase(), codigo });
      } else {
        await s.crearUsuario(actor, datos);
        toast(`${nombre.trim()} fue creado.`);
      }
      await onGuardado();
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  const titulo = existente ? `Editar · ${existente.nombre}` : conCodigo ? 'Autorizar acceso' : 'Nueva persona';
  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <form className="pila" onSubmit={guardar}>
        {!existente && conCodigo ? (
          <p className="nota">Al autorizar, la app genera un código de activación. Envíaselo a la persona: con él crea su propia contraseña. Nadie más la conocerá.</p>
        ) : null}
        <Campo etiqueta="Nombre">{(id) => <input id={id} required value={nombre} onChange={(e) => setNombre(e.target.value)} />}</Campo>
        <Campo
          etiqueta={conCodigo ? 'Correo electrónico' : 'Usuario de acceso'}
          ayuda={conCodigo
            ? (existente ? 'El correo es la identidad de acceso y no se cambia desde aquí.' : 'Con este correo activará su cuenta e iniciará sesión.')
            : 'Minúsculas, sin espacios. Ej.: carlos.perez'}
        >
          {(id) => <input id={id} type={conCodigo ? 'email' : 'text'} required autoCapitalize="none" disabled={conCodigo && !!existente} value={usuario} onChange={(e) => setUsuario(e.target.value)} />}
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
        {existente || conCodigo ? null : (
          <Campo etiqueta="Contraseña inicial" ayuda={`Mínimo ${MIN_LONGITUD_CLAVE} caracteres. Compártela por un canal privado.`}>
            {(id) => <input id={id} type="text" required autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />}
          </Campo>
        )}
        {error ? <p className="aviso aviso--error" role="alert">{error}</p> : null}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn--primario" disabled={enviando}>
            {existente ? 'Guardar cambios' : conCodigo ? 'Autorizar y generar código' : 'Crear'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Prototipo local: el administrador escribe la contraseña nueva. */
function RestablecerClaveLocal({ persona, onCerrar }: { persona: Usuario; onCerrar: () => void }) {
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

function Pendientes({ lista, onNuevoCodigo, onCancelar }: {
  lista: AutorizacionPendiente[];
  onNuevoCodigo: (a: AutorizacionPendiente) => void;
  onCancelar: (a: AutorizacionPendiente) => void;
}) {
  if (!lista.length) return null;
  const hoy = new Date().toISOString();
  return (
    <Tarjeta titulo="Pendientes de activar">
      <p className="nota">Personas autorizadas que aún no han activado su cuenta con su código.</p>
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Correo</th>
              <th scope="col">Roles</th>
              <th scope="col">Código</th>
              <th scope="col"><span className="solo-lector">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.correo}>
                <th scope="row">{a.nombre}</th>
                <td>{a.correo}</td>
                <td>{a.roles.map(nombreRol).join(' · ')}</td>
                <td>{a.expira > hoy
                  ? <span className="etiqueta etiqueta--programada">Vence {fechaHora(a.expira)}</span>
                  : <span className="etiqueta etiqueta--atencion">Vencido</span>}</td>
                <td className="acciones-fila">
                  <button type="button" className="btn btn--suave btn--peq" onClick={() => onNuevoCodigo(a)}>Nuevo código</button>
                  <button type="button" className="btn btn--suave btn--peq" onClick={() => onCancelar(a)}>Cancelar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

export function Equipo() {
  const { usuario: actor, servicios: s } = useSesion();
  const conCodigo = s.accesoConCodigo;
  const { toast, confirmar } = useAvisos();
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);
  const [claveLocal, setClaveLocal] = useState<Usuario | null>(null);
  const [codigo, setCodigo] = useState<CodigoGenerado | null>(null);
  const datos = useCarga(async () => {
    const [personas, pendientes] = await Promise.all([s.listarUsuarios(actor), s.listarAutorizaciones(actor)]);
    return { personas, pendientes };
  }, [s, actor]);

  const fallo = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error');

  const cambiarEstado = async (p: Usuario) => {
    const ok = await confirmar(p.activo
      ? `${p.nombre} no podrá iniciar sesión y dejará de generar alertas. Su histórico se conserva. ¿Desactivar?`
      : `¿Reactivar a ${p.nombre}?`, { aceptar: p.activo ? 'Desactivar' : 'Reactivar', peligro: p.activo });
    if (!ok) return;
    try {
      await s.cambiarEstadoUsuario(actor, p.id, !p.activo);
      toast(p.activo ? `${p.nombre} fue desactivado.` : `${p.nombre} fue reactivado.`);
      await datos.recargar();
    } catch (e) { fallo(e); }
  };

  const restablecer = async (p: Usuario) => {
    if (!conCodigo) { setClaveLocal(p); return; }
    const ok = await confirmar(`Se generará un código para que ${p.nombre} cree una contraseña nueva desde «Olvidé mi contraseña». Su contraseña actual sigue funcionando hasta que use el código. ¿Continuar?`, { aceptar: 'Generar código' });
    if (!ok) return;
    try {
      const c = await s.generarCodigoRestablecer(actor, p.id);
      setCodigo({ tipo: 'restablecer', nombre: p.nombre, correo: p.usuario, codigo: c });
    } catch (e) { fallo(e); }
  };

  const nuevoCodigo = async (a: AutorizacionPendiente) => {
    try {
      const c = await s.autorizarAcceso(actor, { nombre: a.nombre, usuario: a.correo, roles: a.roles, fechaInicio: a.fechaInicio });
      setCodigo({ tipo: 'activacion', nombre: a.nombre, correo: a.correo, codigo: c });
      await datos.recargar();
    } catch (e) { fallo(e); }
  };

  const cancelar = async (a: AutorizacionPendiente) => {
    if (!(await confirmar(`¿Cancelar la autorización de ${a.nombre}? Su código dejará de funcionar.`, { aceptar: 'Cancelar autorización', peligro: true }))) return;
    try {
      await s.cancelarAutorizacion(actor, a.correo);
      toast('Autorización cancelada.');
      await datos.recargar();
    } catch (e) { fallo(e); }
  };

  if (datos.error) return <ErrorCarga error={datos.error} />;
  if (!datos.datos) return <Cargando />;

  return (
    <>
      <Encabezado titulo="Equipo comercial" subtitulo={conCodigo
        ? 'Autoriza personas con un código de activación: cada quien crea su propia contraseña.'
        : 'Agrega nuevos comerciales sin modificar la aplicación.'}>
        <button type="button" className="btn btn--primario" onClick={() => setEditando('nuevo')}>{conCodigo ? '+ Autorizar persona' : '+ Nueva persona'}</button>
      </Encabezado>
      <Pendientes lista={datos.datos.pendientes} onNuevoCodigo={nuevoCodigo} onCancelar={cancelar} />
      <Tarjeta titulo={datos.datos.pendientes.length ? 'Cuentas activas' : undefined}>
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">{conCodigo ? 'Correo' : 'Usuario'}</th>
                <th scope="col">Roles</th>
                <th scope="col">Inicio</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="solo-lector">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {datos.datos.personas.map((p) => (
                <tr key={p.id} className={p.activo ? undefined : 'fila--inactiva'}>
                  <th scope="row">{p.nombre}{p.id === actor.id ? <span className="etiqueta">Tú</span> : null}</th>
                  <td>{p.usuario}</td>
                  <td>{p.roles.map(nombreRol).join(' · ')}</td>
                  <td>{F.formatoMedio(p.fechaInicio)}</td>
                  <td><span className={`etiqueta ${p.activo ? 'etiqueta--vigente' : 'etiqueta--historica'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="acciones-fila">
                    <button type="button" className="btn btn--suave btn--peq" onClick={() => setEditando(p)}>Editar</button>
                    {p.id !== actor.id ? (
                      <button type="button" className="btn btn--suave btn--peq" onClick={() => restablecer(p)}>{conCodigo ? 'Restablecer acceso' : 'Contraseña'}</button>
                    ) : null}
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
        <FormularioUsuario existente={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)}
          onGuardado={datos.recargar} onCodigo={setCodigo} />
      ) : null}
      {claveLocal ? <RestablecerClaveLocal persona={claveLocal} onCerrar={() => setClaveLocal(null)} /> : null}
      {codigo ? <ModalCodigo datos={codigo} onCerrar={() => setCodigo(null)} /> : null}
    </>
  );
}
