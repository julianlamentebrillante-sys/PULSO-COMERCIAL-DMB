import { useState, type FormEvent, type ReactNode } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useApp, useSesion } from './app/contexto';
import * as F from './core/fechas';
import type { Usuario } from './core/tipos';
import * as perm from './datos/permisos';
import { MIN_LONGITUD_CLAVE } from './datos/servicios';
import { DetalleComercial, MiDesempeno } from './pantallas/Desempeno';
import { Historico } from './pantallas/Historico';
import { Tablero } from './pantallas/Tablero';
import { Equipo } from './pantallas/Equipo';
import { Login } from './pantallas/Login';
import { Metas } from './pantallas/Metas';
import { MiActividad } from './pantallas/MiActividad';
import { Notificaciones } from './pantallas/Notificaciones';
import { Pruebas } from './pantallas/Pruebas';
import { Registros } from './pantallas/Registros';
import { Campo, Modal, useAvisos } from './ui/componentes';
import { Marca } from './ui/Marca';

interface Ruta {
  ruta: string;
  texto: (u: Usuario) => string;
  visible: (u: Usuario) => boolean;
  elemento: ReactNode;
}

/** El orden define la pantalla de inicio de cada rol: la primera visible. */
const RUTAS: Ruta[] = [
  { ruta: 'actividad', texto: () => 'Mi actividad', visible: perm.esComercial, elemento: <MiActividad /> },
  { ruta: 'tablero', texto: () => 'Tablero', visible: perm.veEquipo, elemento: <Tablero /> },
  { ruta: 'desempeno', texto: () => 'Mi desempeño', visible: perm.esComercial, elemento: <MiDesempeno /> },
  { ruta: 'historico', texto: () => 'Histórico', visible: () => true, elemento: <Historico /> },
  { ruta: 'registros', texto: () => 'Registros', visible: perm.veEquipo, elemento: <Registros /> },
  { ruta: 'metas', texto: () => 'Metas', visible: perm.esAdmin, elemento: <Metas /> },
  { ruta: 'equipo', texto: () => 'Equipo', visible: perm.esAdmin, elemento: <Equipo /> },
  { ruta: 'notificaciones', texto: () => 'Notificaciones', visible: perm.esAdmin, elemento: <Notificaciones /> },
  { ruta: 'pruebas', texto: () => 'Pruebas', visible: perm.esAdmin, elemento: <Pruebas /> },
];

function CambiarClave({ onCerrar }: { onCerrar: () => void }) {
  const { usuario, servicios: s } = useSesion();
  const { toast } = useAvisos();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (nueva !== repetida) { setError('Las contraseñas nuevas no coinciden.'); return; }
    try {
      await s.cambiarMiClave(usuario, actual, nueva);
      toast('Contraseña actualizada.');
      onCerrar();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <Modal titulo="Cambiar contraseña" onCerrar={onCerrar}>
      <form className="pila" onSubmit={guardar}>
        <Campo etiqueta="Contraseña actual">{(id) => <input id={id} type="password" required autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />}</Campo>
        <Campo etiqueta="Nueva contraseña" ayuda={`Mínimo ${MIN_LONGITUD_CLAVE} caracteres.`}>{(id) => <input id={id} type="password" required autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />}</Campo>
        <Campo etiqueta="Repite la nueva contraseña">{(id) => <input id={id} type="password" required autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />}</Campo>
        {error ? <p className="aviso aviso--error" role="alert">{error}</p> : null}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn--primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function Marco() {
  const { usuario, hoy, fechaSimulada, noLeidas, cerrarSesion, modo } = useSesion();
  const [menu, setMenu] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  // Las herramientas de prueba (fecha simulada, datos demo) solo existen en el prototipo local.
  const visibles = RUTAS.filter((r) => r.visible(usuario) && (r.ruta !== 'pruebas' || modo === 'local'));

  return (
    <div className="marco">
      <header className="barra">
        <div className="barra__fila">
          <Marca />
          <div className="barra__derecha">
            <span className={`barra__fecha ${fechaSimulada ? 'barra__fecha--simulada' : ''}`} title={fechaSimulada ? 'Fecha simulada (herramientas de prueba)' : undefined}>
              {fechaSimulada ? 'Simulado · ' : ''}{F.formatoMedio(hoy)}
            </span>
            <div className="usuario">
              <button type="button" className="usuario__boton" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <span className="usuario__avatar" aria-hidden="true">{usuario.nombre.charAt(0)}</span>
                <span className="usuario__nombre">{usuario.nombre}</span>
              </button>
              {menu ? (
                <div className="usuario__menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setCambiandoClave(true); }}>Cambiar contraseña</button>
                  <button type="button" role="menuitem" onClick={cerrarSesion}>Cerrar sesión</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <nav className="navegacion" aria-label="Secciones">
          {visibles.map((r) => (
            <NavLink key={r.ruta} to={`/${r.ruta}`} className={({ isActive }) => `navegacion__enlace ${isActive ? 'navegacion__enlace--activo' : ''}`}>
              {r.texto(usuario)}
              {r.ruta === 'notificaciones' && noLeidas > 0 ? <span className="insignia" aria-label={`${noLeidas} sin leer`}>{noLeidas}</span> : null}
            </NavLink>
          ))}
        </nav>
      </header>
      {fechaSimulada ? (
        <div className="franja-simulada">Modo de prueba: la aplicación funciona como si hoy fuera {F.formatoLargo(fechaSimulada).toLowerCase()}.</div>
      ) : null}
      <main className="contenido">
        <Routes>
          {visibles.map((r) => <Route key={r.ruta} path={`/${r.ruta}`} element={r.elemento} />)}
          {perm.veEquipo(usuario) ? <Route path="/comercial/:id" element={<DetalleComercial />} /> : null}
          <Route path="*" element={<Navigate to={`/${visibles[0].ruta}`} replace />} />
        </Routes>
      </main>
      {cambiandoClave ? <CambiarClave onCerrar={() => setCambiandoClave(false)} /> : null}
    </div>
  );
}

export function App() {
  const { usuario } = useApp();
  return (
    <HashRouter>
      {/* La clave fuerza a reiniciar las pantallas al cambiar de usuario. */}
      {usuario ? <Marco key={usuario.id} /> : <Login />}
    </HashRouter>
  );
}
