import { beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria, RepositorioLocal } from './repositorio';
import { crearServicios, type Servicios } from './servicios';
import { CLAVE_INICIAL, sembrar } from './semilla';
import * as F from '../core/fechas';
import type { Usuario } from '../core/tipos';

let reloj: { hoy: string };
let repo: RepositorioLocal;
let s: Servicios;
let admin: Usuario;
let maria: Usuario;
let pedro: Usuario;

beforeEach(async () => {
  reloj = { hoy: '2026-10-07' }; // miércoles
  repo = new RepositorioLocal('prueba', new AlmacenMemoria());
  s = crearServicios(repo, () => reloj.hoy);
  await sembrar(repo, '2026-10-01');
  admin = await s.iniciarSesion('julian', CLAVE_INICIAL);
  maria = await s.iniciarSesion('mariafernanda', CLAVE_INICIAL);
  pedro = await s.crearUsuario(admin, { nombre: 'Pedro Prueba', usuario: 'pedro', roles: ['comercial'], fechaInicio: '2026-10-01', clave: 'clave123' });
});

describe('Sesión y usuarios', () => {
  it('rechaza contraseñas incorrectas y usuarios inactivos', async () => {
    await expect(s.iniciarSesion('julian', 'mala')).rejects.toThrow(/incorrectos/);
    await s.cambiarEstadoUsuario(admin, pedro.id, false);
    await expect(s.iniciarSesion('pedro', 'clave123')).rejects.toThrow(/inactivo/);
  });

  it('el usuario de acceso no distingue mayúsculas ni espacios', async () => {
    await expect(s.iniciarSesion('  Julian ', CLAVE_INICIAL)).resolves.toMatchObject({ nombre: 'Julián' });
  });

  it('no expone la contraseña cifrada', () => {
    expect(admin).not.toHaveProperty('claveHash');
    expect(admin).not.toHaveProperty('sal');
  });

  it('solo el administrador crea usuarios y no se permiten duplicados', async () => {
    await expect(s.crearUsuario(maria, { nombre: 'X', usuario: 'xx1', roles: ['comercial'], fechaInicio: '2026-10-01', clave: '123456' })).rejects.toThrow(/administrador/);
    await expect(s.crearUsuario(admin, { nombre: 'Otro', usuario: 'PEDRO', roles: ['comercial'], fechaInicio: '2026-10-01', clave: '123456' })).rejects.toThrow(/Ya existe/);
  });

  it('el administrador no puede desactivarse ni quitarse el rol de admin', async () => {
    await expect(s.cambiarEstadoUsuario(admin, admin.id, false)).rejects.toThrow();
    await expect(s.actualizarUsuario(admin, admin.id, { ...admin, roles: ['comercial'] })).rejects.toThrow();
  });

  it('cambiar la contraseña exige la actual', async () => {
    await expect(s.cambiarMiClave(pedro, 'mala', 'nueva123')).rejects.toThrow();
    await s.cambiarMiClave(pedro, 'clave123', 'nueva123');
    await expect(s.iniciarSesion('pedro', 'nueva123')).resolves.toBeTruthy();
  });

  it('agregar un comercial nuevo no requiere ningún cambio: aparece en el equipo', async () => {
    const nombres = (await s.listarComerciales(admin)).map((c) => c.usuario);
    expect(nombres).toEqual(expect.arrayContaining(['mariafernanda', 'pedro']));
  });
});

describe('Visibilidad por rol', () => {
  it('un comercial solo se ve a sí mismo', async () => {
    expect((await s.listarComerciales(pedro)).map((c) => c.id)).toEqual([pedro.id]);
    await expect(s.listarRegistros(pedro, maria.id)).rejects.toThrow(/permiso/);
    await expect(s.evaluar(pedro, maria.id, 'semana', F.periodo('semana', reloj.hoy))).rejects.toThrow(/permiso/);
    await expect(s.listarMetas(pedro, maria.id)).rejects.toThrow(/permiso/);
    await expect(s.alertas(pedro, maria.id)).rejects.toThrow(/permiso/);
  });

  it('la directora comercial ve a todo el equipo', async () => {
    const ids = (await s.listarComerciales(maria)).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([maria.id, pedro.id]));
    await expect(s.listarRegistros(maria, pedro.id)).resolves.toEqual([]);
  });

  it('la directora no puede configurar metas ni corregir registros ajenos', async () => {
    await expect(s.definirMeta(maria, { userId: pedro.id, indicador: 'invitaciones', periodicidad: 'diaria', valor: 10, desde: reloj.hoy })).rejects.toThrow(/administrador/);
    await expect(s.guardarRegistro(maria, pedro.id, reloj.hoy, {})).rejects.toThrow(/propia actividad/);
  });
});

describe('Registro diario', () => {
  it('el comercial registra y modifica su registro de hoy', async () => {
    await s.guardarRegistro(pedro, pedro.id, reloj.hoy, { invitaciones: 10 });
    const r = await s.guardarRegistro(pedro, pedro.id, reloj.hoy, { invitaciones: 12, conexiones: 3 });
    expect(r.valores.invitaciones).toBe(12);
    expect(r.historial.map((h) => h.accion)).toEqual(['creado', 'editado']);
    expect(r.corregidoPorAdmin).toBe(false);
  });

  it('los datos persisten al cerrar sesión (nueva instancia sobre el mismo almacén)', async () => {
    const almacen = new AlmacenMemoria();
    const repo1 = new RepositorioLocal('p', almacen);
    await sembrar(repo1, '2026-10-01');
    const s1 = crearServicios(repo1, () => '2026-10-07');
    const m1 = await s1.iniciarSesion('mariafernanda', CLAVE_INICIAL);
    await s1.guardarRegistro(m1, m1.id, '2026-10-07', { prospectos: 4 });
    const s2 = crearServicios(new RepositorioLocal('p', almacen), () => '2026-10-07');
    const m2 = await s2.iniciarSesion('mariafernanda', CLAVE_INICIAL);
    expect((await s2.obtenerRegistro(m2, m2.id, '2026-10-07'))?.valores.prospectos).toBe(4);
  });

  it('el comercial NO puede registrar ni modificar días anteriores', async () => {
    await expect(s.guardarRegistro(pedro, pedro.id, '2026-10-06', {})).rejects.toThrow(/día de hoy/);
    await s.guardarRegistro(pedro, pedro.id, reloj.hoy, { invitaciones: 5 });
    reloj.hoy = '2026-10-08';
    await expect(s.guardarRegistro(pedro, pedro.id, '2026-10-07', { invitaciones: 9 })).rejects.toThrow(/día de hoy/);
  });

  it('nadie registra fechas futuras', async () => {
    await expect(s.guardarRegistro(admin, pedro.id, '2026-10-08', {})).rejects.toThrow(/futuras/);
  });

  it('el administrador corrige días anteriores y queda marcado', async () => {
    const r = await s.guardarRegistro(admin, pedro.id, '2026-10-05', { invitaciones: 7 });
    expect(r.corregidoPorAdmin).toBe(true);
    expect(r.historial[0]).toMatchObject({ por: admin.id, correccion: true });
  });

  it('valida que los valores sean enteros no negativos', async () => {
    await expect(s.guardarRegistro(pedro, pedro.id, reloj.hoy, { invitaciones: -1 })).rejects.toThrow(/entero/);
    await expect(s.guardarRegistro(pedro, pedro.id, reloj.hoy, { invitaciones: 2.5 })).rejects.toThrow(/entero/);
  });

  it('un registro en sábado se permite y notifica al administrador una sola vez', async () => {
    reloj.hoy = '2026-10-10';
    const r = await s.guardarRegistro(pedro, pedro.id, '2026-10-10', { invitaciones: 3 });
    expect(r.excepcional).toBe(true);
    await s.guardarRegistro(pedro, pedro.id, '2026-10-10', { invitaciones: 4 });
    const notas = await s.listarNotificaciones(admin);
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ tipo: 'registro_excepcional', userId: pedro.id, fecha: '2026-10-10', motivo: 'fin de semana', leida: false });
    expect(await s.contarNotificacionesNoLeidas(admin)).toBe(1);
    await expect(s.listarNotificaciones(pedro)).rejects.toThrow();
  });

  it('un registro en festivo también notifica', async () => {
    reloj.hoy = '2026-10-12';
    await s.guardarRegistro(maria, maria.id, '2026-10-12', { invitaciones: 1 });
    expect((await s.listarNotificaciones(admin))[0].motivo).toBe('festivo: Día de la Raza');
  });
});

describe('Metas con vigencia', () => {
  const base = () => ({ userId: pedro.id, indicador: 'invitaciones', periodicidad: 'diaria' as const });

  it('la primera meta puede empezar en el pasado (línea base)', async () => {
    const m = await s.definirMeta(admin, { ...base(), valor: 20, desde: '2026-10-01' });
    expect(m).toMatchObject({ desde: '2026-10-01', hasta: null, valor: 20 });
  });

  it('una nueva meta cierra la anterior sin modificar su valor', async () => {
    const m1 = await s.definirMeta(admin, { ...base(), valor: 20, desde: '2026-10-01' });
    await s.definirMeta(admin, { ...base(), valor: 30, desde: '2026-10-07' });
    const metas = await s.listarMetas(admin, pedro.id);
    expect(metas.find((m) => m.id === m1.id)).toMatchObject({ valor: 20, hasta: '2026-10-06' });
    expect(metas.find((m) => m.desde === '2026-10-07')).toMatchObject({ valor: 30, hasta: null });
  });

  it('no permite metas retroactivas cuando ya hay historia', async () => {
    await s.definirMeta(admin, { ...base(), valor: 20, desde: '2026-10-01' });
    await expect(s.definirMeta(admin, { ...base(), valor: 25, desde: '2026-10-03' })).rejects.toThrow(/histórico/);
  });

  it('cambiar una meta no altera la evaluación de semanas pasadas', async () => {
    await s.definirMeta(admin, { ...base(), valor: 20, desde: '2026-09-01' });
    const semanaPasada = F.periodo('semana', '2026-09-28');
    const antes = (await s.evaluar(admin, pedro.id, 'semana', semanaPasada)).indicadores.find((i) => i.id === 'invitaciones');
    await s.definirMeta(admin, { ...base(), valor: 50, desde: reloj.hoy });
    const despues = (await s.evaluar(admin, pedro.id, 'semana', semanaPasada)).indicadores.find((i) => i.id === 'invitaciones');
    expect(despues?.meta).toBe(antes?.meta);
    expect(despues?.meta).toBe(100);
  });

  it('definir dos veces la misma fecha actualiza el valor', async () => {
    await s.definirMeta(admin, { ...base(), valor: 20, desde: reloj.hoy });
    await s.definirMeta(admin, { ...base(), valor: 22, desde: reloj.hoy });
    const metas = await s.listarMetas(admin, pedro.id);
    expect(metas).toHaveLength(1);
    expect(metas[0].valor).toBe(22);
  });

  it('una meta programada antes de otra futura queda acotada', async () => {
    await s.definirMeta(admin, { ...base(), valor: 20, desde: '2026-10-01' });
    await s.definirMeta(admin, { ...base(), valor: 40, desde: '2026-11-01' });
    await s.definirMeta(admin, { ...base(), valor: 30, desde: '2026-10-15' });
    const metas = (await s.listarMetas(admin, pedro.id)).sort((a, b) => (a.desde < b.desde ? -1 : 1));
    expect(metas.map((m) => [m.desde, m.hasta, m.valor])).toEqual([
      ['2026-10-01', '2026-10-14', 20],
      ['2026-10-15', '2026-10-31', 30],
      ['2026-11-01', null, 40],
    ]);
  });

  it('finalizar: elimina si no ha empezado, cierra ayer si ya rige', async () => {
    const vigente = await s.definirMeta(admin, { ...base(), valor: 20, desde: '2026-10-01' });
    const futura = await s.definirMeta(admin, { userId: pedro.id, indicador: 'prospectos', periodicidad: 'semanal', valor: 5, desde: '2026-10-20' });
    expect(await s.finalizarMeta(admin, futura.id)).toBe('eliminada');
    expect(await s.finalizarMeta(admin, vigente.id)).toBe('finalizada');
    expect((await s.listarMetas(admin, pedro.id)).find((m) => m.id === vigente.id)?.hasta).toBe('2026-10-06');
  });

  it('los ratios usan umbral y los indicadores periodicidad', async () => {
    await expect(s.definirMeta(admin, { userId: pedro.id, indicador: 'tasa_aceptacion', periodicidad: 'diaria', valor: 30, desde: reloj.hoy })).rejects.toThrow(/umbral/);
    await expect(s.definirMeta(admin, { userId: pedro.id, indicador: 'tasa_aceptacion', periodicidad: 'umbral', valor: 30, desde: reloj.hoy })).resolves.toBeTruthy();
    await expect(s.definirMeta(admin, { userId: pedro.id, indicador: 'total_agendadas', periodicidad: 'semanal', valor: 6, desde: reloj.hoy })).resolves.toBeTruthy();
    await expect(s.definirMeta(admin, { ...base(), valor: 0, desde: reloj.hoy })).rejects.toThrow(/mayor que cero/);
  });
});
