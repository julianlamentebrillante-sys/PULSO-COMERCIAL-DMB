/**
 * Pruebas del esquema de Supabase sobre PostgreSQL real (PGlite, en memoria).
 * Simula lo mínimo de Supabase: el esquema auth (usuarios y auth.uid()) y los
 * roles anon / authenticated, para verificar triggers, funciones y RLS.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as F from '../../src/core/fechas';

const DIR_MIGRACIONES = join(__dirname, '..', 'migrations');

const SUPABASE_SIMULADO = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (
    id uuid primary key,
    email text not null,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
`;

/** En pruebas, "hoy" se controla con la variable pulso.hoy. */
const HOY_CONTROLABLE = `
  create or replace function public.hoy_bogota() returns date language sql stable as $$
    select coalesce(nullif(current_setting('pulso.hoy', true), ''), (now() at time zone 'America/Bogota')::date::text)::date
  $$;
`;

const ID = {
  admin: '00000000-0000-0000-0000-00000000000a',
  maria: '00000000-0000-0000-0000-00000000000b',
  pedro: '00000000-0000-0000-0000-00000000000c',
};

async function crearBase() {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(SUPABASE_SIMULADO);
  for (const archivo of readdirSync(DIR_MIGRACIONES).filter((a) => a.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8'));
  }
  await db.exec(HOY_CONTROLABLE);
  return db;
}

async function crearUsuario(db: PGlite, id: string, email: string, app: object | null, user: object | null = null) {
  await db.query('insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4)',
    [id, email, app ? JSON.stringify(app) : null, user ? JSON.stringify(user) : null]);
}

async function equipoBase(db: PGlite) {
  await crearUsuario(db, ID.admin, 'julian@dmb.test', { nombre: 'Julián', roles: ['admin'], fecha_inicio: '2026-09-01' });
  await crearUsuario(db, ID.maria, 'maria@dmb.test', { nombre: 'María Fernanda', roles: ['director', 'comercial'], fecha_inicio: '2026-09-01' });
  await crearUsuario(db, ID.pedro, 'pedro@dmb.test', { nombre: 'Pedro', roles: ['comercial'], fecha_inicio: '2026-09-01' });
}

/** Ejecuta una consulta como el usuario dado (rol authenticated), o como anon si uid es null. */
async function como<T = Record<string, unknown>>(db: PGlite, uid: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}

const fijarHoy = (db: PGlite, fecha: string) => db.query(`select set_config('pulso.hoy', $1, false)`, [fecha]);

const guardar = (db: PGlite, uid: string, userId: string, fecha: string, valores: object) =>
  como(db, uid, `insert into public.registros (user_id, fecha, valores) values ($1, $2, $3)
                 on conflict (user_id, fecha) do update set valores = excluded.valores
                 returning *`, [userId, fecha, JSON.stringify(valores)]);

// -----------------------------------------------------------------------------

describe('Calendario hábil en SQL', () => {
  let db: PGlite;
  beforeAll(async () => { db = await crearBase(); });

  it('los festivos coinciden con el prototipo (2024–2032)', async () => {
    for (let anio = 2024; anio <= 2032; anio++) {
      const { rows } = await db.query<{ fecha: string; nombre: string }>(
        `select to_char(fecha, 'YYYY-MM-DD') as fecha, nombre from public.festivos_colombia($1)`, [anio]);
      expect(rows).toEqual(F.festivosColombia(anio).lista);
    }
  });

  it('es_habil coincide día a día con el prototipo durante 2026', async () => {
    const { rows } = await db.query<{ fecha: string; habil: boolean }>(
      `select to_char(d, 'YYYY-MM-DD') as fecha, public.es_habil(d::date) as habil
       from generate_series('2026-01-01'::date, '2026-12-31'::date, interval '1 day') d`);
    for (const r of rows) expect(r.habil, r.fecha).toBe(F.esHabil(r.fecha));
  });

  it('describe el motivo de un día no hábil', async () => {
    const { rows } = await db.query<{ a: string; b: string; c: string | null }>(
      `select public.motivo_no_habil('2026-10-12') a, public.motivo_no_habil('2026-10-10') b, public.motivo_no_habil('2026-10-13') c`);
    expect(rows[0]).toEqual({ a: 'festivo: Día de la Raza', b: 'fin de semana', c: null });
  });
});

describe('Perfiles y alta de usuarios', () => {
  let db: PGlite;
  beforeEach(async () => { db = await crearBase(); await equipoBase(db); });

  it('crea el perfil con los roles de app_metadata', async () => {
    const { rows } = await db.query(`select nombre, correo, roles::text[] as roles, activo, to_char(fecha_inicio, 'YYYY-MM-DD') fi from public.perfiles where id = $1`, [ID.maria]);
    expect(rows[0]).toEqual({ nombre: 'María Fernanda', correo: 'maria@dmb.test', roles: ['director', 'comercial'], activo: true, fi: '2026-09-01' });
  });

  it('ignora roles en user_metadata (los controla el usuario) y deja el perfil inactivo', async () => {
    const intruso = '00000000-0000-0000-0000-0000000000ff';
    await crearUsuario(db, intruso, 'intruso@x.test', null, { roles: ['admin'] });
    const { rows } = await db.query(`select roles::text[] as roles, activo from public.perfiles where id = $1`, [intruso]);
    expect(rows[0]).toEqual({ roles: ['comercial'], activo: false });
    expect(await como(db, intruso, 'select public.es_admin() as admin')).toEqual([{ admin: false }]);
  });

  it('cada quien ve los perfiles que le corresponden', async () => {
    const ids = async (uid: string) => (await como<{ id: string }>(db, uid, 'select id from public.perfiles order by id')).map((r) => r.id);
    expect(await ids(ID.pedro)).toEqual([ID.pedro]);
    expect(await ids(ID.maria)).toEqual([ID.maria, ID.pedro]);
    expect(await ids(ID.admin)).toEqual([ID.admin, ID.maria, ID.pedro]);
  });

  it('solo el admin edita perfiles y no puede quitarse el rol ni desactivarse', async () => {
    expect(await como(db, ID.pedro, `update public.perfiles set nombre = 'Hackeado' where id = $1 returning id`, [ID.pedro])).toEqual([]);
    await expect(como(db, ID.admin, `update public.perfiles set roles = '{comercial}' where id = $1`, [ID.admin])).rejects.toThrow(/rol de administrador/);
    await expect(como(db, ID.admin, `update public.perfiles set activo = false where id = $1`, [ID.admin])).rejects.toThrow(/desactivar/);
    await como(db, ID.admin, `update public.perfiles set activo = false where id = $1`, [ID.pedro]);
    const { rows } = await db.query(`select activo, inactivo_desde is not null as con_fecha from public.perfiles where id = $1`, [ID.pedro]);
    expect(rows[0]).toEqual({ activo: false, con_fecha: true });
  });

  it('un usuario inactivo pierde el acceso', async () => {
    await fijarHoy(db, '2026-10-07');
    await como(db, ID.admin, `update public.perfiles set activo = false where id = $1`, [ID.pedro]);
    await expect(guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: 1 })).rejects.toThrow(/row-level security/);
  });

  it('un usuario anónimo no puede leer nada', async () => {
    await expect(como(db, null, 'select * from public.perfiles')).rejects.toThrow(/permission denied/);
    await expect(como(db, null, 'select * from public.registros')).rejects.toThrow(/permission denied/);
  });
});

describe('Registro diario', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearBase();
    await equipoBase(db);
    await fijarHoy(db, '2026-10-07'); // miércoles
  });

  it('el comercial registra su día completando con ceros', async () => {
    const [r] = await guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: 12, prospectos: 2 });
    expect(r.valores).toMatchObject({ invitaciones: 12, prospectos: 2, conexiones: 0, oportunidades: 0 });
    expect(Object.keys(r.valores as object)).toHaveLength(13);
    expect(r).toMatchObject({ excepcional: false, corregido_por_admin: false, actualizado_por: ID.pedro });
  });

  it('puede modificarlo el mismo día y queda historial', async () => {
    await guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: 12 });
    const [r] = await guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: 15 });
    expect((r.valores as Record<string, number>).invitaciones).toBe(15);
    const historial = await como(db, ID.pedro, `select accion, correccion from public.registros_historial order by id`);
    expect(historial).toEqual([{ accion: 'creado', correccion: false }, { accion: 'editado', correccion: false }]);
  });

  it('el comercial NO puede registrar días anteriores, futuros ni de otra persona', async () => {
    await expect(guardar(db, ID.pedro, ID.pedro, '2026-10-06', {})).rejects.toThrow(/row-level security/);
    await expect(guardar(db, ID.pedro, ID.pedro, '2026-10-08', {})).rejects.toThrow(/row-level security|futuras/);
    await expect(guardar(db, ID.pedro, ID.maria, '2026-10-07', {})).rejects.toThrow(/row-level security/);
  });

  it('tampoco puede editar ayer aunque el registro exista', async () => {
    await guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: 5 });
    await fijarHoy(db, '2026-10-08');
    await expect(guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: 50 })).rejects.toThrow(/row-level security/);
    expect(await como(db, ID.pedro, `update public.registros set valores = '{"invitaciones": 50}' where fecha = '2026-10-07' returning id`)).toEqual([]);
  });

  it('el admin corrige días anteriores y queda marcado', async () => {
    const [r] = await guardar(db, ID.admin, ID.pedro, '2026-10-05', { invitaciones: 7 });
    expect(r.corregido_por_admin).toBe(true);
    const h = await como(db, ID.admin, `select por, correccion from public.registros_historial`);
    expect(h).toEqual([{ por: ID.admin, correccion: true }]);
  });

  it('nadie registra fechas futuras, ni el admin', async () => {
    await expect(guardar(db, ID.admin, ID.pedro, '2026-10-08', {})).rejects.toThrow(/futuras/);
  });

  it('valida los valores', async () => {
    await expect(guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: -1 })).rejects.toThrow(/entero/);
    await expect(guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: 2.5 })).rejects.toThrow(/entero/);
    await expect(guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: '3' })).rejects.toThrow(/entero/);
    await expect(guardar(db, ID.pedro, ID.pedro, '2026-10-07', { total_agendadas: 3 })).rejects.toThrow(/no válido/);
  });

  it('el admin no puede registrar actividad a quien no es comercial', async () => {
    await expect(guardar(db, ID.admin, ID.admin, '2026-10-07', {})).rejects.toThrow(/no es un comercial/);
  });

  it('los registros no se pueden borrar', async () => {
    await guardar(db, ID.pedro, ID.pedro, '2026-10-07', {});
    await expect(como(db, ID.admin, `delete from public.registros`)).rejects.toThrow(/permission denied/);
  });

  it('cada comercial ve solo sus registros; la dirección ve todos', async () => {
    await guardar(db, ID.pedro, ID.pedro, '2026-10-07', { invitaciones: 1 });
    await guardar(db, ID.maria, ID.maria, '2026-10-07', { invitaciones: 2 });
    expect((await como(db, ID.pedro, `select user_id from public.registros`)).map((r) => r.user_id)).toEqual([ID.pedro]);
    expect(await como(db, ID.maria, `select user_id from public.registros`)).toHaveLength(2);
    expect(await como(db, ID.pedro, `select * from public.registros_historial`)).toHaveLength(1);
  });

  it('registrar en sábado se permite, es excepcional y notifica al admin una sola vez', async () => {
    await fijarHoy(db, '2026-10-10');
    const [r] = await guardar(db, ID.pedro, ID.pedro, '2026-10-10', { invitaciones: 3 });
    expect(r.excepcional).toBe(true);
    await guardar(db, ID.pedro, ID.pedro, '2026-10-10', { invitaciones: 4 });
    expect(await como(db, ID.pedro, `select * from public.notificaciones`)).toEqual([]);
    expect(await como(db, ID.maria, `select * from public.notificaciones`)).toEqual([]);
    const notas = await como(db, ID.admin, `select user_id, motivo, leida from public.notificaciones`);
    expect(notas).toEqual([{ user_id: ID.pedro, motivo: 'fin de semana', leida: false }]);
  });

  it('el comercial no puede falsear los campos de control', async () => {
    await fijarHoy(db, '2026-10-10');
    const [r] = await como(db, ID.pedro, `insert into public.registros (user_id, fecha, valores, excepcional, corregido_por_admin)
      values ($1, '2026-10-10', '{}', false, true) returning excepcional, corregido_por_admin`, [ID.pedro]);
    expect(r).toEqual({ excepcional: true, corregido_por_admin: false });
    await expect(como(db, ID.pedro, `insert into public.notificaciones (tipo, user_id, fecha) values ('registro_excepcional', $1, '2026-10-10')`, [ID.pedro]))
      .rejects.toThrow(/permission denied/);
  });
});

describe('Metas', () => {
  let db: PGlite;
  const definir = (uid: string, indicador: string, periodicidad: string, valor: number, desde: string, usuario = ID.pedro) =>
    como(db, uid, `select * from public.definir_meta($1, $2, $3::public.periodicidad, $4, $5::date)`, [usuario, indicador, periodicidad, valor, desde]);
  const metas = () => como<{ desde: string; hasta: string | null; valor: string }>(db, ID.admin,
    `select to_char(desde, 'YYYY-MM-DD') desde, to_char(hasta, 'YYYY-MM-DD') hasta, valor::text from public.metas order by desde`);

  beforeEach(async () => {
    db = await crearBase();
    await equipoBase(db);
    await fijarHoy(db, '2026-10-07');
  });

  it('la primera meta puede empezar en el pasado; la siguiente cierra la anterior', async () => {
    await definir(ID.admin, 'invitaciones', 'diaria', 20, '2026-10-01');
    await definir(ID.admin, 'invitaciones', 'diaria', 30, '2026-10-07');
    expect(await metas()).toEqual([
      { desde: '2026-10-01', hasta: '2026-10-06', valor: '20.00' },
      { desde: '2026-10-07', hasta: null, valor: '30.00' },
    ]);
  });

  it('no permite metas retroactivas cuando ya hay historia', async () => {
    await definir(ID.admin, 'invitaciones', 'diaria', 20, '2026-10-01');
    await expect(definir(ID.admin, 'invitaciones', 'diaria', 25, '2026-10-03')).rejects.toThrow(/histórico/);
  });

  it('definir dos veces la misma fecha actualiza el valor', async () => {
    await definir(ID.admin, 'invitaciones', 'diaria', 20, '2026-10-07');
    await definir(ID.admin, 'invitaciones', 'diaria', 22, '2026-10-07');
    expect(await metas()).toEqual([{ desde: '2026-10-07', hasta: null, valor: '22.00' }]);
  });

  it('una meta intermedia queda acotada por la siguiente programada', async () => {
    await definir(ID.admin, 'invitaciones', 'diaria', 20, '2026-10-01');
    await definir(ID.admin, 'invitaciones', 'diaria', 40, '2026-11-01');
    await definir(ID.admin, 'invitaciones', 'diaria', 30, '2026-10-15');
    expect(await metas()).toEqual([
      { desde: '2026-10-01', hasta: '2026-10-14', valor: '20.00' },
      { desde: '2026-10-15', hasta: '2026-10-31', valor: '30.00' },
      { desde: '2026-11-01', hasta: null, valor: '40.00' },
    ]);
  });

  it('la base de datos impide metas superpuestas aunque se salten la función', async () => {
    await definir(ID.admin, 'invitaciones', 'diaria', 20, '2026-10-01');
    await expect(como(db, ID.admin, `insert into public.metas (user_id, indicador, periodicidad, valor, desde)
      values ($1, 'invitaciones', 'diaria', 10, '2026-10-05')`, [ID.pedro])).rejects.toThrow(/metas_sin_solapes/);
  });

  it('solo el admin configura metas', async () => {
    await expect(definir(ID.maria, 'invitaciones', 'diaria', 20, '2026-10-07')).rejects.toThrow(/administrador/);
    await expect(como(db, ID.pedro, `insert into public.metas (user_id, indicador, periodicidad, valor, desde)
      values ($1, 'invitaciones', 'diaria', 10, '2026-10-07')`, [ID.pedro])).rejects.toThrow(/row-level security/);
  });

  it('valida periodicidad, valor y destinatario', async () => {
    await expect(definir(ID.admin, 'tasa_aceptacion', 'diaria', 30, '2026-10-07')).rejects.toThrow(/umbral/);
    await expect(definir(ID.admin, 'invitaciones', 'umbral', 30, '2026-10-07')).rejects.toThrow(/Periodicidad/);
    await expect(definir(ID.admin, 'invitaciones', 'diaria', 0, '2026-10-07')).rejects.toThrow(/check/);
    await expect(definir(ID.admin, 'invitaciones', 'diaria', 10, '2026-10-07', ID.admin)).rejects.toThrow(/no es un comercial/);
    await expect(definir(ID.admin, 'total_agendadas', 'semanal', 6, '2026-10-07')).resolves.toHaveLength(1);
    await expect(definir(ID.admin, 'tasa_aceptacion', 'umbral', 30, '2026-10-07')).resolves.toHaveLength(1);
  });

  it('finalizar: elimina si no ha empezado, cierra ayer si ya rige', async () => {
    const [vigente] = await definir(ID.admin, 'invitaciones', 'diaria', 20, '2026-10-01');
    const [futura] = await definir(ID.admin, 'prospectos', 'semanal', 5, '2026-10-20');
    expect(await como(db, ID.admin, `select public.finalizar_meta($1) r`, [futura.id])).toEqual([{ r: 'eliminada' }]);
    expect(await como(db, ID.admin, `select public.finalizar_meta($1) r`, [vigente.id])).toEqual([{ r: 'finalizada' }]);
    expect(await metas()).toEqual([{ desde: '2026-10-01', hasta: '2026-10-06', valor: '20.00' }]);
    await expect(como(db, ID.maria, `select public.finalizar_meta($1)`, [vigente.id])).rejects.toThrow(/administrador/);
  });

  it('cada comercial ve solo sus metas; la dirección ve todas', async () => {
    await definir(ID.admin, 'invitaciones', 'diaria', 20, '2026-10-01');
    await definir(ID.admin, 'invitaciones', 'diaria', 15, '2026-10-01', ID.maria);
    expect(await como(db, ID.pedro, `select * from public.metas`)).toHaveLength(1);
    expect(await como(db, ID.maria, `select * from public.metas`)).toHaveLength(2);
  });
});
