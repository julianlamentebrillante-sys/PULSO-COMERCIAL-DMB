import { useState, type FormEvent } from 'react';
import { useApp } from '../app/contexto';
import { Campo } from '../ui/componentes';
import { Marca } from '../ui/Marca';

export function Login() {
  const { iniciarSesion, modo } = useApp();
  const conCorreo = modo === 'supabase';
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const alEnviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await iniciarSesion(usuario, clave);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <div className="login__caja">
        <Marca grande />
        <p className="login__sub">Seguimiento de actividad comercial y metas</p>
        <form className="login__form" onSubmit={alEnviar}>
          <Campo etiqueta={conCorreo ? 'Correo electrónico' : 'Usuario'}>
            {(id) => <input id={id} type={conCorreo ? 'email' : 'text'} autoComplete={conCorreo ? 'email' : 'username'} autoCapitalize="none" autoFocus required value={usuario} onChange={(e) => setUsuario(e.target.value)} />}
          </Campo>
          <Campo etiqueta="Contraseña">
            {(id) => <input id={id} type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />}
          </Campo>
          {error ? <p className="aviso aviso--error" role="alert">{error}</p> : null}
          <button type="submit" className="btn btn--primario btn--bloque" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
        <p className="login__nota">{conCorreo
          ? '¿Olvidaste tu contraseña? Pídele al administrador que la restablezca.'
          : 'Prototipo local · los datos se guardan en este navegador.'}</p>
      </div>
    </div>
  );
}
