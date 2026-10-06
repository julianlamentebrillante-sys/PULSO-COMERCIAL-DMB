/** Tipos del dominio de PULSO COMERCIAL DMB. */

/** Fecha sin hora en formato ISO 'AAAA-MM-DD'. */
export type FechaISO = string;
/** Marca de tiempo ISO completa (con hora, UTC). */
export type Momento = string;

export type Rol = 'admin' | 'director' | 'comercial';

export interface Usuario {
  id: string;
  nombre: string;
  usuario: string;
  roles: Rol[];
  /** Desde esta fecha se le exige registro diario. */
  fechaInicio: FechaISO;
  activo: boolean;
  inactivoDesde?: FechaISO | null;
  creado: Momento;
  creadoPor?: string;
}

/** Usuario tal como se guarda (incluye la contraseña cifrada). Nunca sale de la capa de datos. */
export interface UsuarioGuardado extends Usuario {
  sal: string;
  claveHash: string;
}

/** Valores por indicador: { invitaciones: 20, conexiones: 6, … } */
export type Valores = Record<string, number>;

export interface EntradaHistorial {
  momento: Momento;
  por: string;
  accion: 'creado' | 'editado';
  /** true si lo hizo alguien distinto al comercial o sobre un día anterior. */
  correccion: boolean;
}

export interface Registro {
  id: string;
  userId: string;
  fecha: FechaISO;
  valores: Valores;
  /** Registrado en sábado, domingo o festivo. */
  excepcional: boolean;
  creado: Momento;
  actualizado: Momento;
  actualizadoPor: string;
  corregidoPorAdmin: boolean;
  historial: EntradaHistorial[];
}

export type PeriodicidadMeta = 'diaria' | 'semanal' | 'mensual';
/** Los ratios usan 'umbral' (porcentaje mínimo) en lugar de una periodicidad. */
export type Periodicidad = PeriodicidadMeta | 'umbral';

export interface Meta {
  id: string;
  userId: string;
  indicador: string;
  periodicidad: Periodicidad;
  valor: number;
  desde: FechaISO;
  /** null = vigente sin fecha de fin. */
  hasta: FechaISO | null;
  creado: Momento;
  creadoPor: string;
  actualizado?: Momento;
  actualizadoPor?: string;
}

export interface Notificacion {
  id: string;
  tipo: 'registro_excepcional';
  userId: string;
  fecha: FechaISO;
  motivo: string | null;
  creado: Momento;
  leida: boolean;
}

export interface Configuracion {
  /** Solo para pruebas: reemplaza la fecha real de hoy. */
  fechaSimulada?: FechaISO | null;
}

export type TipoPeriodo = 'dia' | 'semana' | 'mes' | 'anio' | 'rango';

export interface Periodo {
  tipo: TipoPeriodo;
  ini: FechaISO;
  fin: FechaISO;
}

export type Estado = 'verde' | 'amarillo' | 'rojo' | 'en_curso' | 'sin_meta' | 'sin_datos';
