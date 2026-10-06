/**
 * Datos iniciales y datos de demostración (prototipo local).
 *
 * CREDENCIALES INICIALES DEL PROTOTIPO LOCAL
 *   Usuarios: julian (administrador) y mariafernanda (directora + comercial).
 *   Contraseña inicial de ambos: la constante CLAVE_INICIAL de este archivo.
 * Cámbialas desde la aplicación (menú del usuario → Cambiar contraseña).
 * Solo aplican a este prototipo; en producción las gestionará Supabase Auth.
 */
import * as F from '../core/fechas';
import type { FechaISO, Periodicidad, Rol, Usuario, Valores } from '../core/tipos';
import { generarId, type Repositorio } from './repositorio';
import { hashClave } from './servicios';

export const CLAVE_INICIAL = 'PulsoDMB2026';

export const USUARIOS_INICIALES: { nombre: string; usuario: string; roles: Rol[] }[] = [
  { nombre: 'Julián', usuario: 'julian', roles: ['admin'] },
  { nombre: 'María Fernanda', usuario: 'mariafernanda', roles: ['director', 'comercial'] },
];

async function crearUsuarioDirecto(repo: Repositorio, datos: { nombre: string; usuario: string; roles: Rol[] }, clave: string, fechaInicio: FechaISO): Promise<Usuario> {
  const sal = generarId('sal');
  return repo.crearUsuario({
    ...datos, fechaInicio, activo: true, sal,
    claveHash: hashClave(clave, sal), creado: new Date().toISOString(),
  });
}

/** Estado inicial: solo los dos usuarios, sin metas ni registros. */
export async function sembrar(repo: Repositorio, hoy: FechaISO): Promise<void> {
  for (const u of USUARIOS_INICIALES) await crearUsuarioDirecto(repo, u, CLAVE_INICIAL, hoy);
}

/** Generador pseudoaleatorio con semilla: la demostración sale igual cada vez. */
function aleatorio(semilla: number) {
  let s = semilla;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reemplaza TODOS los datos por un escenario de demostración:
 * 7 semanas de historia para María Fernanda y un "Comercial Demo" de bajo desempeño,
 * metas diarias/semanales/mensuales, umbrales de ratios, un cambio de meta hace dos
 * semanas (para validar el histórico) y un registro excepcional en sábado.
 */
export async function cargarDemo(repo: Repositorio, hoy: FechaISO): Promise<void> {
  await repo.reiniciar();
  const momento = new Date().toISOString();
  const inicio = F.sumarDias(F.inicioSemana(hoy), -49);
  const cambioMeta = F.sumarDias(F.inicioSemana(hoy), -14);

  const julian = await crearUsuarioDirecto(repo, USUARIOS_INICIALES[0], CLAVE_INICIAL, inicio);
  const maria = await crearUsuarioDirecto(repo, USUARIOS_INICIALES[1], CLAVE_INICIAL, inicio);
  const demo = await crearUsuarioDirecto(repo, { nombre: 'Comercial Demo', usuario: 'demo', roles: ['comercial'] }, CLAVE_INICIAL, inicio);

  const METAS: [string, Periodicidad, number, FechaISO?, FechaISO?][] = [
    ['invitaciones', 'diaria', 20, inicio, F.sumarDias(cambioMeta, -1)],
    ['invitaciones', 'diaria', 25, cambioMeta],
    ['contactos', 'diaria', 8],
    ['contactos_efectivos', 'diaria', 4],
    ['prospectos', 'semanal', 10],
    ['total_agendadas', 'semanal', 6],
    ['total_realizadas', 'semanal', 4],
    ['propuestas', 'semanal', 2],
    ['oportunidades', 'mensual', 3],
    ['propuestas', 'mensual', 8],
    ['total_realizadas', 'mensual', 16],
    ['tasa_aceptacion', 'umbral', 30],
    ['tasa_prospeccion', 'umbral', 35],
    ['tasa_efectividad_contacto', 'umbral', 50],
    ['tasa_realizacion_reuniones', 'umbral', 70],
  ];
  for (const u of [maria, demo]) {
    for (const [indicador, periodicidad, valor, desde = inicio, hasta = null] of METAS) {
      await repo.crearMeta({ userId: u.id, indicador, periodicidad, valor, desde, hasta, creado: momento, creadoPor: julian.id });
    }
  }

  const ayer = F.sumarDias(hoy, -1);
  const ultimoHabil = F.ultimoDiaHabilHasta(ayer);
  const perfiles = [
    { u: maria, factor: 1.05, semilla: 7, ausencia: 0.04 },
    { u: demo, factor: 0.6, semilla: 21, ausencia: 0.12 },
  ];

  for (const p of perfiles) {
    const rnd = aleatorio(p.semilla);
    const entre = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
    const escalar = (n: number) => Math.max(0, Math.round(n * p.factor));
    const talVez = (prob: number) => (rnd() < prob * p.factor ? 1 : 0);

    for (const f of F.diasHabiles(inicio, ayer)) {
      if (rnd() < p.ausencia) continue;
      if (p.u === demo && f === ultimoHabil) continue; // el comercial demo olvidó registrar el último día hábil
      const invitaciones = escalar(entre(16, 28));
      const conexiones = Math.round(invitaciones * (0.22 + rnd() * 0.18));
      const contactos = escalar(entre(5, 11));
      const valores: Valores = {
        invitaciones,
        conexiones,
        prospectos: Math.round(conexiones * (0.3 + rnd() * 0.25)),
        contactos,
        contactos_efectivos: Math.round(contactos * (0.4 + rnd() * 0.3)),
        sinergia_agendadas: talVez(0.35), presentacion_agendadas: talVez(0.6), seguimiento_agendadas: talVez(0.4),
        sinergia_realizadas: talVez(0.25), presentacion_realizadas: talVez(0.45), seguimiento_realizadas: talVez(0.3),
        propuestas: talVez(0.4), oportunidades: talVez(0.15),
      };
      await repo.guardarRegistro({
        userId: p.u.id, fecha: f, valores, excepcional: false,
        creado: momento, actualizado: momento, actualizadoPor: p.u.id, corregidoPorAdmin: false,
        historial: [{ momento, por: p.u.id, accion: 'creado', correccion: false }],
      });
    }
  }

  // Registro excepcional: un sábado de hace dos semanas.
  const sabado = F.sumarDias(F.inicioSemana(hoy), -9);
  await repo.guardarRegistro({
    userId: maria.id, fecha: sabado,
    valores: { invitaciones: 12, conexiones: 3, prospectos: 1, contactos: 2, contactos_efectivos: 1 },
    excepcional: true, creado: momento, actualizado: momento, actualizadoPor: maria.id, corregidoPorAdmin: false,
    historial: [{ momento, por: maria.id, accion: 'creado', correccion: false }],
  });
  await repo.crearNotificacion({
    tipo: 'registro_excepcional', userId: maria.id, fecha: sabado,
    motivo: F.motivoNoHabil(sabado), creado: momento, leida: false,
  });
}
