/**
 * Repositorio de datos.
 *
 * `Repositorio` es el contrato. Hoy lo implementa `RepositorioLocal` (navegador);
 * en la etapa de Supabase se escribirá `RepositorioSupabase` con los mismos métodos.
 * El resto de la aplicación no sabe dónde viven los datos.
 */
import type { Configuracion, FechaISO, Meta, Notificacion, Registro, UsuarioGuardado } from '../core/tipos';

export const VERSION_ESQUEMA = 1;

export interface BaseDeDatos {
  version: number;
  usuarios: UsuarioGuardado[];
  registros: Registro[];
  metas: Meta[];
  notificaciones: Notificacion[];
  config: Configuracion;
}

export interface FiltroRegistros { userId?: string; desde?: FechaISO; hasta?: FechaISO }

export interface Repositorio {
  estaVacio(): Promise<boolean>;

  listarUsuarios(): Promise<UsuarioGuardado[]>;
  obtenerUsuario(id: string): Promise<UsuarioGuardado | null>;
  buscarUsuarioPorNombre(usuario: string): Promise<UsuarioGuardado | null>;
  crearUsuario(datos: Omit<UsuarioGuardado, 'id'>): Promise<UsuarioGuardado>;
  actualizarUsuario(id: string, cambios: Partial<UsuarioGuardado>): Promise<UsuarioGuardado>;

  listarRegistros(filtro?: FiltroRegistros): Promise<Registro[]>;
  obtenerRegistro(userId: string, fecha: FechaISO): Promise<Registro | null>;
  /** Crea o reemplaza el registro de (userId, fecha). */
  guardarRegistro(registro: Omit<Registro, 'id'>): Promise<Registro>;

  listarMetas(filtro?: { userId?: string }): Promise<Meta[]>;
  obtenerMeta(id: string): Promise<Meta | null>;
  crearMeta(datos: Omit<Meta, 'id'>): Promise<Meta>;
  actualizarMeta(id: string, cambios: Partial<Meta>): Promise<Meta>;
  eliminarMeta(id: string): Promise<void>;

  listarNotificaciones(): Promise<Notificacion[]>;
  crearNotificacion(datos: Omit<Notificacion, 'id'>): Promise<Notificacion>;
  actualizarNotificacion(id: string, cambios: Partial<Notificacion>): Promise<Notificacion>;

  obtenerConfig(): Promise<Configuracion>;
  actualizarConfig(cambios: Partial<Configuracion>): Promise<Configuracion>;

  exportar(): Promise<BaseDeDatos>;
  importar(bd: unknown): Promise<void>;
  reiniciar(): Promise<void>;
}

export function generarId(prefijo: string): string {
  const aleatorio = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefijo}_${aleatorio}`;
}

function copiar<T>(x: T): T {
  return x === undefined || x === null ? x : JSON.parse(JSON.stringify(x));
}

function bdVacia(): BaseDeDatos {
  return { version: VERSION_ESQUEMA, usuarios: [], registros: [], metas: [], notificaciones: [], config: {} };
}

/** Interfaz mínima de almacenamiento (la cumple `localStorage`). */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/** Almacén en memoria (pruebas, o cuando el navegador bloquea localStorage). */
export class AlmacenMemoria implements Almacen {
  private datos = new Map<string, string>();
  getItem(k: string) { return this.datos.get(k) ?? null; }
  setItem(k: string, v: string) { this.datos.set(k, String(v)); }
  removeItem(k: string) { this.datos.delete(k); }
}

/**
 * Prototipo local: guarda toda la base en el almacenamiento del navegador.
 * Los datos solo existen en este navegador y este equipo.
 */
export class RepositorioLocal implements Repositorio {
  private bd: BaseDeDatos;

  constructor(private clave: string, private almacen: Almacen) {
    this.bd = this.cargar();
  }

  private cargar(): BaseDeDatos {
    try {
      const texto = this.almacen.getItem(this.clave);
      if (texto) return Object.assign(bdVacia(), JSON.parse(texto));
    } catch (e) {
      console.error('No se pudieron leer los datos guardados:', e);
    }
    return bdVacia();
  }

  private guardar(): void {
    this.almacen.setItem(this.clave, JSON.stringify(this.bd));
  }

  async estaVacio() { return this.bd.usuarios.length === 0; }

  // ----- Usuarios -----
  async listarUsuarios() { return copiar(this.bd.usuarios); }
  async obtenerUsuario(id: string) { return copiar(this.bd.usuarios.find((u) => u.id === id) ?? null); }
  async buscarUsuarioPorNombre(usuario: string) { return copiar(this.bd.usuarios.find((u) => u.usuario === usuario) ?? null); }
  async crearUsuario(datos: Omit<UsuarioGuardado, 'id'>) {
    const u: UsuarioGuardado = { id: generarId('usr'), ...copiar(datos) };
    this.bd.usuarios.push(u);
    this.guardar();
    return copiar(u);
  }
  async actualizarUsuario(id: string, cambios: Partial<UsuarioGuardado>) {
    const u = this.bd.usuarios.find((x) => x.id === id);
    if (!u) throw new Error('Usuario no encontrado.');
    Object.assign(u, copiar(cambios));
    this.guardar();
    return copiar(u);
  }

  // ----- Registros diarios (uno por comercial y fecha) -----
  async listarRegistros({ userId, desde, hasta }: FiltroRegistros = {}) {
    return copiar(this.bd.registros
      .filter((r) => (!userId || r.userId === userId) && (!desde || r.fecha >= desde) && (!hasta || r.fecha <= hasta))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1)));
  }
  async obtenerRegistro(userId: string, fecha: FechaISO) {
    return copiar(this.bd.registros.find((r) => r.userId === userId && r.fecha === fecha) ?? null);
  }
  async guardarRegistro(registro: Omit<Registro, 'id'>) {
    const i = this.bd.registros.findIndex((r) => r.userId === registro.userId && r.fecha === registro.fecha);
    const r: Registro = { id: i >= 0 ? this.bd.registros[i].id : generarId('reg'), ...copiar(registro) };
    if (i >= 0) this.bd.registros[i] = r; else this.bd.registros.push(r);
    this.guardar();
    return copiar(r);
  }

  // ----- Metas -----
  async listarMetas({ userId }: { userId?: string } = {}) {
    return copiar(this.bd.metas.filter((m) => !userId || m.userId === userId));
  }
  async obtenerMeta(id: string) { return copiar(this.bd.metas.find((m) => m.id === id) ?? null); }
  async crearMeta(datos: Omit<Meta, 'id'>) {
    const m: Meta = { id: generarId('met'), ...copiar(datos) };
    this.bd.metas.push(m);
    this.guardar();
    return copiar(m);
  }
  async actualizarMeta(id: string, cambios: Partial<Meta>) {
    const m = this.bd.metas.find((x) => x.id === id);
    if (!m) throw new Error('Meta no encontrada.');
    Object.assign(m, copiar(cambios));
    this.guardar();
    return copiar(m);
  }
  async eliminarMeta(id: string) {
    this.bd.metas = this.bd.metas.filter((m) => m.id !== id);
    this.guardar();
  }

  // ----- Notificaciones -----
  async listarNotificaciones() {
    return copiar([...this.bd.notificaciones].sort((a, b) => (a.creado < b.creado ? 1 : -1)));
  }
  async crearNotificacion(datos: Omit<Notificacion, 'id'>) {
    const n: Notificacion = { id: generarId('not'), ...copiar(datos) };
    this.bd.notificaciones.push(n);
    this.guardar();
    return copiar(n);
  }
  async actualizarNotificacion(id: string, cambios: Partial<Notificacion>) {
    const n = this.bd.notificaciones.find((x) => x.id === id);
    if (!n) throw new Error('Notificación no encontrada.');
    Object.assign(n, copiar(cambios));
    this.guardar();
    return copiar(n);
  }

  // ----- Configuración y mantenimiento -----
  async obtenerConfig() { return copiar(this.bd.config); }
  async actualizarConfig(cambios: Partial<Configuracion>) {
    Object.assign(this.bd.config, copiar(cambios));
    this.guardar();
    return copiar(this.bd.config);
  }
  async exportar() { return copiar(this.bd); }
  async importar(bd: unknown) {
    const x = bd as Partial<BaseDeDatos> | null;
    if (!x || !Array.isArray(x.usuarios) || !Array.isArray(x.registros) || !Array.isArray(x.metas)) {
      throw new Error('El archivo no tiene el formato de un respaldo de PULSO COMERCIAL DMB.');
    }
    this.bd = Object.assign(bdVacia(), copiar(x));
    this.guardar();
  }
  async reiniciar() {
    this.bd = bdVacia();
    this.guardar();
  }
}
