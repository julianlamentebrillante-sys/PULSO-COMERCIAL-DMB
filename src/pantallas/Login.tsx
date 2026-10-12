/**
 * Inicio de sesión. En la versión con Supabase incluye:
 *  · «Activar mi cuenta»: correo + código de activación + contraseña propia.
 *  · «Olvidé mi contraseña»: correo + código de restablecimiento + contraseña nueva.
 * Los códigos los genera el administrador en la pantalla Equipo.
 */
import { useState, type FormEvent } from 'react';
import { useApp } from '../app/contexto';
import { MIN_LONGITUD_CLAVE_PROPIA } from '../datos/servicios';
import { Campo } from '../ui/componentes';
import { Marca } from '../ui/Marca';

type Vista = 'ingresar' | 'activar' | 'restablecer';

export function Login() {
  const { iniciarSesion, servicios } = useApp();
  const conCodigo = servicios.accesoConCodigo;
  const [vista, setVista] = useState<Vista>('ingresar');
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [codigo, setCodigo] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    setError(null);
    setClave('');
    setRepetida('');
    setCodigo('');
  };

  const alEnviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (vista !== 'ingresar' && clave !== repetida) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      if (vista === 'activar') await servicios.activarCuenta(usuario, codigo, clave);
      if (vista === 'restablecer') await servicios.restablecerConCodigo(usuario, codigo, clave);
      await iniciarSesion(usuario, clave);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  };

  const textoBoton = {
    ingresar: enviando ? 'Ingresando…' : 'Ingresar',
    activar: enviando ? 'Activando…' : 'Activar y entrar',
    restablecer: enviando ? 'Guardando…' : 'Guardar contraseña y entrar',
  }[vista];

  return (
    <div className="login">
      <div className="login__caja">
        <Marca grande />
        <p className="login__sub">Seguimiento de actividad comercial y metas</p>

        {vista !== 'ingresar' ? (
          <>
            <h1 className="login__titulo">{vista === 'activar' ? 'Activar mi cuenta' : 'Crear una contraseña nueva'}</h1>
            <p className="nota" style={{ marginBottom: 16 }}>
              {vista === 'activar'
                ? 'Usa el código de activación que te envió el administrador y crea tu propia contraseña.'
                : 'Usa el código de restablecimiento que te envió el administrador.'}
            </p>
          </>
        ) : null}

        <form className="login__form" onSubmit={alEnviar}>
          <Campo etiqueta={conCodigo ? 'Correo electrónico' : 'Usuario'}>
            {(id) => <input id={id} type={conCodigo ? 'email' : 'text'} autoComplete={conCodigo ? 'email' : 'username'} autoCapitalize="none" autoFocus required value={usuario} onChange={(e) => setUsuario(e.target.value)} />}
          </Campo>
          {vista !== 'ingresar' ? (
            <Campo etiqueta="Código" ayuda="Ejemplo: K7M2P-Q9RTA. No importan mayúsculas ni guiones.">
              {(id) => <input id={id} type="text" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required value={codigo} onChange={(e) => setCodigo(e.target.value)} />}
            </Campo>
          ) : null}
          <Campo etiqueta={vista === 'ingresar' ? 'Contraseña' : 'Nueva contraseña'} ayuda={vista === 'ingresar' ? undefined : `Mínimo ${MIN_LONGITUD_CLAVE_PROPIA} caracteres. Solo tú la conocerás.`}>
            {(id) => <input id={id} type="password" autoComplete={vista === 'ingresar' ? 'current-password' : 'new-password'} required value={clave} onChange={(e) => setClave(e.target.value)} />}
          </Campo>
          {vista !== 'ingresar' ? (
            <Campo etiqueta="Repite la contraseña">
              {(id) => <input id={id} type="password" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} />}
            </Campo>
          ) : null}
          {error ? <p className="aviso aviso--error" role="alert">{error}</p> : null}
          <button type="submit" className="btn btn--primario btn--bloque" disabled={enviando}>{textoBoton}</button>
        </form>

        {conCodigo ? (
          <div className="login__enlaces">
            {vista === 'ingresar' ? (
              <>
                <button type="button" className="enlace" onClick={() => cambiarVista('activar')}>Activar mi cuenta</button>
                <button type="button" className="enlace" onClick={() => cambiarVista('restablecer')}>Olvidé mi contraseña</button>
              </>
            ) : (
              <button type="button" className="enlace" onClick={() => cambiarVista('ingresar')}>‹ Volver a iniciar sesión</button>
            )}
          </div>
        ) : (
          <p className="login__nota">Prototipo local · los datos se guardan en este navegador.</p>
        )}
      </div>
    </div>
  );
}
