/** Componentes de interfaz reutilizables. */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Estado } from '../core/tipos';
import type { Alerta } from '../core/motor';
import { textoAlerta } from './formato';

// ---------- Semáforo ----------

const ESTADOS: Record<Estado, { etiqueta: string; clase: string }> = {
  verde: { etiqueta: 'Cumple', clase: 'verde' },
  amarillo: { etiqueta: 'En riesgo', clase: 'amarillo' },
  rojo: { etiqueta: 'Crítico', clase: 'rojo' },
  en_curso: { etiqueta: 'En curso', clase: 'neutro' },
  sin_meta: { etiqueta: 'Sin meta', clase: 'vacio' },
  sin_datos: { etiqueta: 'Sin datos', clase: 'vacio' },
};

export function Semaforo({ estado }: { estado: Estado }) {
  const e = ESTADOS[estado];
  return (
    <span className={`semaforo semaforo--${e.clase}`}>
      <span className="semaforo__punto" aria-hidden="true" />
      {e.etiqueta}
    </span>
  );
}

// ---------- Bloques de página ----------

export function Encabezado({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    <header className="encabezado">
      <div>
        <h1>{titulo}</h1>
        {subtitulo ? <p className="encabezado__sub">{subtitulo}</p> : null}
      </div>
      {children ? <div className="encabezado__acciones">{children}</div> : null}
    </header>
  );
}

export function Tarjeta({ titulo, children, className }: { titulo?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tarjeta ${className ?? ''}`}>
      {titulo ? <h2 className="tarjeta__titulo">{titulo}</h2> : null}
      {children}
    </section>
  );
}

export function Aviso({ tipo, children }: { tipo: 'info' | 'atencion' | 'error' | 'ok'; children: ReactNode }) {
  return <div className={`aviso aviso--${tipo}`} role={tipo === 'error' ? 'alert' : undefined}>{children}</div>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="vacio">{children}</p>;
}

export function Cargando() {
  return <p className="cargando" aria-live="polite">Cargando…</p>;
}

export function ErrorCarga({ error }: { error: Error }) {
  return <Aviso tipo="error">{error.message}</Aviso>;
}

// ---------- Formularios ----------

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children(id)}
      {ayuda ? <small className="campo__ayuda">{ayuda}</small> : null}
    </div>
  );
}

export function Segmentado<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: { valor: T; texto: string }[]; valor: T; onCambio: (v: T) => void; etiqueta: string;
}) {
  return (
    <div className="segmentado" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.valor} type="button" className="segmentado__opcion" aria-pressed={o.valor === valor} onClick={() => onCambio(o.valor)}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ titulo, onCerrar, children, pie }: { titulo: string; onCerrar: () => void; children: ReactNode; pie?: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current(); };
    document.addEventListener('keydown', alTeclado);
    caja.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', alTeclado);
  }, []);
  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={caja}>
        <header className="modal__cabecera">
          <h2>{titulo}</h2>
          <button type="button" className="btn-icono" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </header>
        <div className="modal__cuerpo">{children}</div>
        {pie ? <footer className="modal__pie">{pie}</footer> : null}
      </div>
    </div>
  );
}

// ---------- Toasts y confirmaciones ----------

interface Toast { id: number; texto: string; tipo: 'ok' | 'error' }
interface Confirmacion { texto: string; aceptar: string; peligro: boolean; resolver: (v: boolean) => void }

const ContextoAvisos = createContext<{
  toast: (texto: string, tipo?: 'ok' | 'error') => void;
  confirmar: (texto: string, opciones?: { aceptar?: string; peligro?: boolean }) => Promise<boolean>;
} | null>(null);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const siguiente = useRef(1);

  const toast = useCallback((texto: string, tipo: 'ok' | 'error' = 'ok') => {
    const id = siguiente.current++;
    setToasts((t) => [...t, { id, texto, tipo }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const confirmar = useCallback((texto: string, { aceptar = 'Confirmar', peligro = false } = {}) =>
    new Promise<boolean>((resolver) => setConfirmacion({ texto, aceptar, peligro, resolver })), []);

  const cerrar = (v: boolean) => {
    confirmacion?.resolver(v);
    setConfirmacion(null);
  };

  return (
    <ContextoAvisos.Provider value={{ toast, confirmar }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast--${t.tipo}`}>{t.texto}</div>)}
      </div>
      {confirmacion ? (
        <Modal titulo="Confirmar" onCerrar={() => cerrar(false)} pie={<>
          <button type="button" className="btn" onClick={() => cerrar(false)}>Cancelar</button>
          <button type="button" className={`btn ${confirmacion.peligro ? 'btn--peligro' : 'btn--primario'}`} onClick={() => cerrar(true)}>{confirmacion.aceptar}</button>
        </>}>
          <p>{confirmacion.texto}</p>
        </Modal>
      ) : null}
    </ContextoAvisos.Provider>
  );
}

export function useAvisos() {
  const v = useContext(ContextoAvisos);
  if (!v) throw new Error('useAvisos debe usarse dentro de <ProveedorAvisos>.');
  return v;
}

// ---------- Alertas ----------

export function ListaAlertas({ alertas, nombres }: { alertas: Alerta[]; nombres?: Record<string, string> }) {
  if (!alertas.length) return <Vacio>Sin alertas: todo está dentro de lo esperado.</Vacio>;
  return (
    <ul className="alertas">
      {alertas.map((a, i) => (
        <li key={i} className={`alerta alerta--${a.severidad}`}>
          <span className="alerta__severidad">{a.severidad === 'critica' ? 'Crítica' : 'Atención'}</span>
          <span>{nombres?.[a.userId] ? <strong>{nombres[a.userId]}: </strong> : null}{textoAlerta(a)}</span>
        </li>
      ))}
    </ul>
  );
}
