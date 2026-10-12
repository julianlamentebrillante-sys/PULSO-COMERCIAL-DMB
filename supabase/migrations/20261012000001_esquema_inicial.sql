-- =============================================================================
-- PULSO COMERCIAL DMB — Esquema inicial para Supabase (PostgreSQL 15+)
-- =============================================================================
-- Las reglas de negocio viven en la base de datos, no solo en la aplicación:
--   · Row Level Security: cada comercial ve solo lo suyo; administración y
--     dirección ven al equipo; solo el administrador configura.
--   · Triggers: validan los valores del registro diario, marcan los días no
--     hábiles como excepcionales, notifican al administrador y guardan historial.
--   · Funciones: definir_meta / finalizar_meta preservan el histórico de metas.
--   · Festivos de Colombia calculados en SQL (Ley Emiliani + Pascua).
-- Equivalencias con el prototipo: src/core/fechas.ts, src/datos/servicios.ts.
-- =============================================================================

create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type public.rol as enum ('admin', 'director', 'comercial');
create type public.periodicidad as enum ('diaria', 'semanal', 'mensual', 'umbral');
create type public.tipo_indicador as enum ('base', 'total', 'ratio');

-- -----------------------------------------------------------------------------
-- Fechas y calendario hábil colombiano
-- -----------------------------------------------------------------------------

create function public.hoy_bogota() returns date
language sql stable
as $$ select (now() at time zone 'America/Bogota')::date $$;

-- Domingo de Pascua (algoritmo gregoriano anónimo / Meeus).
create function public.domingo_pascua(anio int) returns date
language plpgsql immutable
as $$
declare
  a int := anio % 19;
  b int := anio / 100;
  c int := anio % 100;
  d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  return make_date(anio, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end
$$;

-- Ley Emiliani: si el festivo no cae en lunes, se traslada al lunes siguiente.
create function public.trasladar_a_lunes(f date) returns date
language sql immutable
as $$ select f + ((8 - extract(dow from f)::int) % 7) $$;

create function public.festivos_colombia(anio int)
returns table (fecha date, nombre text)
language sql immutable
as $$
  select x.fecha, string_agg(x.nombre, ' / ' order by x.orden)
  from (select public.domingo_pascua(anio) as pascua) p
  cross join lateral (values
    (1,  make_date(anio, 1, 1),                              'Año Nuevo'),
    (2,  public.trasladar_a_lunes(make_date(anio, 1, 6)),    'Día de los Reyes Magos'),
    (3,  public.trasladar_a_lunes(make_date(anio, 3, 19)),   'Día de San José'),
    (4,  p.pascua - 3,                                       'Jueves Santo'),
    (5,  p.pascua - 2,                                       'Viernes Santo'),
    (6,  make_date(anio, 5, 1),                              'Día del Trabajo'),
    (7,  p.pascua + 43,                                      'Ascensión del Señor'),
    (8,  p.pascua + 64,                                      'Corpus Christi'),
    (9,  p.pascua + 71,                                      'Sagrado Corazón de Jesús'),
    (10, public.trasladar_a_lunes(make_date(anio, 6, 29)),   'San Pedro y San Pablo'),
    (11, make_date(anio, 7, 20),                             'Día de la Independencia'),
    (12, make_date(anio, 8, 7),                              'Batalla de Boyacá'),
    (13, public.trasladar_a_lunes(make_date(anio, 8, 15)),   'Asunción de la Virgen'),
    (14, public.trasladar_a_lunes(make_date(anio, 10, 12)),  'Día de la Raza'),
    (15, public.trasladar_a_lunes(make_date(anio, 11, 1)),   'Día de Todos los Santos'),
    (16, public.trasladar_a_lunes(make_date(anio, 11, 11)),  'Independencia de Cartagena'),
    (17, make_date(anio, 12, 8),                             'Inmaculada Concepción'),
    (18, make_date(anio, 12, 25),                            'Navidad')
  ) as x (orden, fecha, nombre)
  group by x.fecha
  order by x.fecha
$$;

create function public.es_habil(f date) returns boolean
language sql immutable
as $$
  select extract(isodow from f) < 6
     and not exists (select 1 from public.festivos_colombia(extract(year from f)::int) x where x.fecha = f)
$$;

create function public.motivo_no_habil(f date) returns text
language sql immutable
as $$
  select case
    when public.es_habil(f) then null
    when extract(isodow from f) >= 6
     and not exists (select 1 from public.festivos_colombia(extract(year from f)::int) x where x.fecha = f)
      then 'fin de semana'
    else 'festivo: ' || (select x.nombre from public.festivos_colombia(extract(year from f)::int) x where x.fecha = f)
  end
$$;

-- -----------------------------------------------------------------------------
-- Catálogo de indicadores (espejo de src/core/catalogo.ts)
-- -----------------------------------------------------------------------------

create table public.indicadores (
  id     text primary key,
  nombre text not null,
  corto  text not null,
  grupo  text,
  tipo   public.tipo_indicador not null,
  orden  smallint not null unique
);

insert into public.indicadores (id, nombre, corto, grupo, tipo, orden) values
  ('invitaciones',               'Invitaciones a conectar enviadas',        'Invitaciones',     'prospeccion', 'base',  1),
  ('conexiones',                 'Conexiones aceptadas',                    'Conexiones',       'prospeccion', 'base',  2),
  ('prospectos',                 'Prospectos obtenidos',                    'Prospectos',       'prospeccion', 'base',  3),
  ('contactos',                  'Contactos realizados',                    'Contactos',        'contactos',   'base',  4),
  ('contactos_efectivos',        'Contactos efectivos',                     'Efectivos',        'contactos',   'base',  5),
  ('sinergia_agendadas',         'Reuniones de Sinergia agendadas',         'Sinergia',         'agendadas',   'base',  6),
  ('presentacion_agendadas',     'Reuniones de presentación agendadas',     'Presentación',     'agendadas',   'base',  7),
  ('seguimiento_agendadas',      'Reuniones de seguimiento agendadas',      'Seguimiento',      'agendadas',   'base',  8),
  ('sinergia_realizadas',        'Reuniones de Sinergia realizadas',        'Sinergia',         'realizadas',  'base',  9),
  ('presentacion_realizadas',    'Reuniones de presentación realizadas',    'Presentación',     'realizadas',  'base', 10),
  ('seguimiento_realizadas',     'Reuniones de seguimiento realizadas',     'Seguimiento',      'realizadas',  'base', 11),
  ('propuestas',                 'Propuestas comerciales presentadas',      'Propuestas',       'cierre',      'base', 12),
  ('oportunidades',              'Oportunidades comerciales reales',        'Oportunidades',    'cierre',      'base', 13),
  ('total_agendadas',            'Total reuniones comerciales agendadas',   'Total agendadas',  'agendadas',   'total', 14),
  ('total_realizadas',           'Total reuniones comerciales realizadas',  'Total realizadas', 'realizadas',  'total', 15),
  ('tasa_aceptacion',            'Tasa de aceptación',                      'Tasa de aceptación',          null, 'ratio', 16),
  ('tasa_prospeccion',           'Tasa de prospección',                     'Tasa de prospección',         null, 'ratio', 17),
  ('tasa_efectividad_contacto',  'Efectividad de contacto',                 'Efectividad de contacto',     null, 'ratio', 18),
  ('tasa_realizacion_reuniones', 'Realización de reuniones',                'Realización de reuniones',    null, 'ratio', 19);

-- -----------------------------------------------------------------------------
-- Perfiles (uno por usuario de Supabase Auth)
-- -----------------------------------------------------------------------------

create table public.perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null check (char_length(trim(nombre)) >= 2),
  correo         text not null,
  roles          public.rol[] not null check (cardinality(roles) > 0),
  -- Desde esta fecha se le exige registro diario.
  fecha_inicio   date not null default public.hoy_bogota(),
  activo         boolean not null default true,
  inactivo_desde date,
  creado         timestamptz not null default now(),
  creado_por     uuid references public.perfiles (id) on delete set null
);

-- Funciones de permisos. Son SECURITY DEFINER para poder leer perfiles sin
-- que las políticas de perfiles se llamen a sí mismas.
create function public.mis_roles() returns public.rol[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.roles from public.perfiles p where p.id = auth.uid() and p.activo),
    '{}'::public.rol[])
$$;

create function public.es_admin() returns boolean
language sql stable
as $$ select 'admin' = any(public.mis_roles()) $$;

create function public.es_director() returns boolean
language sql stable
as $$ select 'director' = any(public.mis_roles()) $$;

create function public.soy_comercial() returns boolean
language sql stable
as $$ select 'comercial' = any(public.mis_roles()) $$;

-- Administrador y director(a) ven al equipo completo.
create function public.ve_equipo() returns boolean
language sql stable
as $$ select public.es_admin() or public.es_director() $$;

create function public.es_comercial(usuario uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.perfiles p where p.id = usuario and 'comercial' = any(p.roles)) $$;

-- Nuevo usuario en Supabase Auth → perfil.
-- Roles, fecha de inicio y autor se leen de app_metadata, que solo el servidor
-- (service role) puede escribir. Nunca de user_metadata: el usuario la controla.
-- Un usuario sin roles en app_metadata queda inactivo hasta que un admin lo active.
create function public.crear_perfil_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  roles_meta public.rol[];
begin
  select array_agg(r::public.rol) into roles_meta
  from jsonb_array_elements_text(case when jsonb_typeof(meta -> 'roles') = 'array' then meta -> 'roles' else '[]'::jsonb end) r;

  insert into public.perfiles (id, nombre, correo, roles, fecha_inicio, activo, creado_por)
  values (
    new.id,
    coalesce(nullif(trim(meta ->> 'nombre'), ''), nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce(roles_meta, '{comercial}'),
    coalesce((meta ->> 'fecha_inicio')::date, public.hoy_bogota()),
    roles_meta is not null,
    (meta ->> 'creado_por')::uuid
  );
  return new;
end
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- El administrador no puede quitarse su propio rol ni desactivarse.
create function public.proteger_perfil() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id = auth.uid() and (not 'admin' = any(new.roles) or not new.activo) then
    raise exception 'No puedes quitarte el rol de administrador ni desactivar tu propio usuario.';
  end if;
  if new.activo and not old.activo then new.inactivo_desde := null; end if;
  if not new.activo and old.activo then new.inactivo_desde := public.hoy_bogota(); end if;
  new.correo := old.correo; -- el correo se cambia en Supabase Auth
  return new;
end
$$;

create trigger antes_de_actualizar_perfil
  before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- -----------------------------------------------------------------------------
-- Registro diario
-- -----------------------------------------------------------------------------

create table public.registros (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.perfiles (id) on delete cascade,
  fecha               date not null,
  -- { "invitaciones": 20, "conexiones": 6, … } — solo indicadores base, enteros 0–9999.
  valores             jsonb not null default '{}'::jsonb,
  -- Registrado en sábado, domingo o festivo (lo calcula el trigger).
  excepcional         boolean not null default false,
  creado              timestamptz not null default now(),
  actualizado         timestamptz not null default now(),
  actualizado_por     uuid references public.perfiles (id) on delete set null,
  corregido_por_admin boolean not null default false,
  unique (user_id, fecha)
);

create index registros_fecha on public.registros (fecha);

create table public.registros_historial (
  id          bigint generated always as identity primary key,
  registro_id uuid not null references public.registros (id) on delete cascade,
  momento     timestamptz not null default now(),
  por         uuid references public.perfiles (id) on delete set null,
  accion      text not null check (accion in ('creado', 'editado')),
  -- Hecho por alguien distinto al comercial o sobre un día anterior.
  correccion  boolean not null
);

create index registros_historial_registro on public.registros_historial (registro_id);

create table public.notificaciones (
  id      uuid primary key default gen_random_uuid(),
  tipo    text not null check (tipo in ('registro_excepcional')),
  user_id uuid not null references public.perfiles (id) on delete cascade,
  fecha   date not null,
  motivo  text,
  creado  timestamptz not null default now(),
  leida   boolean not null default false
);

create index notificaciones_no_leidas on public.notificaciones (leida) where not leida;

-- Valida y completa el registro antes de guardarlo. Los campos de control
-- (excepcional, autor, fechas, corrección) los fija siempre el servidor.
create function public.preparar_registro() returns trigger
language plpgsql set search_path = ''
as $$
declare
  hoy date := public.hoy_bogota();
  clave text;
  valor jsonb;
  n numeric;
begin
  if not public.es_comercial(new.user_id) then
    raise exception 'El usuario indicado no es un comercial.';
  end if;
  if new.fecha > hoy then
    raise exception 'No se puede registrar actividad en fechas futuras.';
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.fecha <> old.fecha) then
    raise exception 'No se puede cambiar el comercial ni la fecha de un registro.';
  end if;
  if jsonb_typeof(coalesce(new.valores, '{}'::jsonb)) <> 'object' then
    raise exception 'Los valores del registro no tienen el formato esperado.';
  end if;

  for clave, valor in select e.key, e.value from jsonb_each(coalesce(new.valores, '{}'::jsonb)) e loop
    if not exists (select 1 from public.indicadores i where i.id = clave and i.tipo = 'base') then
      raise exception 'Indicador no válido en el registro: %', clave;
    end if;
    if jsonb_typeof(valor) <> 'number' then
      raise exception '"%" debe ser un número entero entre 0 y 9999.', clave;
    end if;
    n := valor::text::numeric;
    if n <> trunc(n) or n < 0 or n > 9999 then
      raise exception '"%" debe ser un número entero entre 0 y 9999.', clave;
    end if;
  end loop;

  -- Completa con ceros los indicadores que no vinieron.
  select jsonb_object_agg(i.id, coalesce((new.valores ->> i.id)::int, 0) order by i.orden)
  into new.valores
  from public.indicadores i where i.tipo = 'base';

  new.excepcional := not public.es_habil(new.fecha);
  new.actualizado := now();
  new.actualizado_por := auth.uid();
  if tg_op = 'INSERT' then
    new.creado := now();
    new.corregido_por_admin := (auth.uid() is distinct from new.user_id) or new.fecha <> hoy;
  else
    new.creado := old.creado;
    new.corregido_por_admin := old.corregido_por_admin or (auth.uid() is distinct from new.user_id) or new.fecha <> hoy;
  end if;
  return new;
end
$$;

create trigger antes_de_guardar_registro
  before insert or update on public.registros
  for each row execute function public.preparar_registro();

-- Historial de cambios + notificación al administrador si el registro es en día no hábil.
-- SECURITY DEFINER: el comercial no puede escribir directamente en estas tablas.
create function public.despues_de_guardar_registro() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.registros_historial (registro_id, por, accion, correccion)
  values (
    new.id, auth.uid(),
    case when tg_op = 'INSERT' then 'creado' else 'editado' end,
    (auth.uid() is distinct from new.user_id) or new.fecha <> public.hoy_bogota()
  );

  if tg_op = 'INSERT' and new.excepcional and not public.es_admin() then
    insert into public.notificaciones (tipo, user_id, fecha, motivo)
    values ('registro_excepcional', new.user_id, new.fecha, public.motivo_no_habil(new.fecha));
  end if;
  return null;
end
$$;

create trigger despues_de_guardar_registro
  after insert or update on public.registros
  for each row execute function public.despues_de_guardar_registro();

-- -----------------------------------------------------------------------------
-- Metas con vigencia
-- -----------------------------------------------------------------------------

create table public.metas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.perfiles (id) on delete cascade,
  indicador       text not null references public.indicadores (id),
  periodicidad    public.periodicidad not null,
  valor           numeric(12, 2) not null check (valor > 0 and valor <= 99999),
  desde           date not null,
  -- null = vigente sin fecha de fin.
  hasta           date check (hasta is null or hasta >= desde),
  creado          timestamptz not null default now(),
  creado_por      uuid references public.perfiles (id) on delete set null,
  actualizado     timestamptz,
  actualizado_por uuid references public.perfiles (id) on delete set null,
  -- Nunca dos metas vigentes a la vez para el mismo comercial, indicador y periodicidad.
  constraint metas_sin_solapes exclude using gist (
    user_id with =, indicador with =, periodicidad with =,
    daterange(desde, hasta, '[]') with &&
  )
);

create function public.validar_meta() returns trigger
language plpgsql set search_path = ''
as $$
declare
  tipo public.tipo_indicador;
begin
  if not public.es_comercial(new.user_id) then
    raise exception 'El usuario indicado no es un comercial.';
  end if;
  select i.tipo into tipo from public.indicadores i where i.id = new.indicador;
  if tipo = 'ratio' and new.periodicidad <> 'umbral' then
    raise exception 'Los ratios usan un umbral, no una periodicidad.';
  end if;
  if tipo <> 'ratio' and new.periodicidad = 'umbral' then
    raise exception 'Periodicidad no válida para este indicador.';
  end if;
  return new;
end
$$;

create trigger antes_de_guardar_meta
  before insert or update on public.metas
  for each row execute function public.validar_meta();

-- Define una meta nueva desde una fecha (misma lógica que el prototipo):
--  · La meta anterior no se modifica: se cierra su vigencia el día anterior.
--  · Si ya hay historia para esa combinación, la nueva rige desde hoy o después.
--  · La primera meta puede empezar en el pasado (línea base).
--  · Si ya hay una meta que empieza ese mismo día, se actualiza su valor.
create function public.definir_meta(
  p_user_id uuid, p_indicador text, p_periodicidad public.periodicidad, p_valor numeric, p_desde date
) returns public.metas
language plpgsql set search_path = ''
as $$
declare
  hoy date := public.hoy_bogota();
  misma public.metas;
  anterior public.metas;
  siguiente public.metas;
  resultado public.metas;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede configurar metas.';
  end if;

  if exists (select 1 from public.metas m where m.user_id = p_user_id and m.indicador = p_indicador and m.periodicidad = p_periodicidad)
     and p_desde < hoy then
    raise exception 'Para proteger el histórico, una nueva meta solo puede empezar a regir desde hoy o una fecha futura.';
  end if;

  select * into misma from public.metas m
  where m.user_id = p_user_id and m.indicador = p_indicador and m.periodicidad = p_periodicidad and m.desde = p_desde;
  if found then
    update public.metas set valor = p_valor, actualizado = now(), actualizado_por = auth.uid()
    where id = misma.id returning * into resultado;
    return resultado;
  end if;

  select * into anterior from public.metas m
  where m.user_id = p_user_id and m.indicador = p_indicador and m.periodicidad = p_periodicidad and m.desde < p_desde
  order by m.desde desc limit 1;
  select * into siguiente from public.metas m
  where m.user_id = p_user_id and m.indicador = p_indicador and m.periodicidad = p_periodicidad and m.desde > p_desde
  order by m.desde asc limit 1;

  if anterior.id is not null and (anterior.hasta is null or anterior.hasta >= p_desde) then
    update public.metas set hasta = p_desde - 1 where id = anterior.id;
  end if;

  insert into public.metas (user_id, indicador, periodicidad, valor, desde, hasta, creado_por)
  values (p_user_id, p_indicador, p_periodicidad, p_valor, p_desde,
          case when siguiente.id is not null then siguiente.desde - 1 end, auth.uid())
  returning * into resultado;
  return resultado;
end
$$;

-- Finaliza una meta: si aún no rige se elimina; si ya rige, se cierra ayer.
create function public.finalizar_meta(p_meta_id uuid) returns text
language plpgsql set search_path = ''
as $$
declare
  hoy date := public.hoy_bogota();
  m public.metas;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede configurar metas.';
  end if;
  select * into m from public.metas where id = p_meta_id;
  if not found then
    raise exception 'Meta no encontrada.';
  end if;
  if m.desde >= hoy then
    delete from public.metas where id = p_meta_id;
    return 'eliminada';
  end if;
  if m.hasta is not null and m.hasta < hoy then
    raise exception 'Esta meta ya no está vigente.';
  end if;
  update public.metas set hasta = hoy - 1, actualizado = now(), actualizado_por = auth.uid() where id = p_meta_id;
  return 'finalizada';
end
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.indicadores         enable row level security;
alter table public.perfiles            enable row level security;
alter table public.registros           enable row level security;
alter table public.registros_historial enable row level security;
alter table public.notificaciones      enable row level security;
alter table public.metas               enable row level security;

-- Catálogo: lectura para cualquier usuario autenticado.
create policy indicadores_leer on public.indicadores
  for select to authenticated using (true);

-- Perfiles: cada quien se ve a sí mismo; el admin ve a todos;
-- la dirección ve a los comerciales. Solo el admin edita.
-- (Los perfiles se crean con el trigger de Auth, no desde la aplicación.)
create policy perfiles_leer on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin() or (public.es_director() and 'comercial' = any(roles)));

create policy perfiles_editar on public.perfiles
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Registros: el comercial ve los suyos; administración y dirección, todos.
-- El comercial solo crea o edita su registro de HOY; el admin, cualquier día.
create policy registros_leer on public.registros
  for select to authenticated
  using (user_id = auth.uid() or public.ve_equipo());

create policy registros_crear on public.registros
  for insert to authenticated
  with check (public.es_admin() or (user_id = auth.uid() and public.soy_comercial() and fecha = public.hoy_bogota()));

create policy registros_editar on public.registros
  for update to authenticated
  using (public.es_admin() or (user_id = auth.uid() and public.soy_comercial() and fecha = public.hoy_bogota()))
  with check (public.es_admin() or (user_id = auth.uid() and public.soy_comercial() and fecha = public.hoy_bogota()));
-- Sin política de borrado: los registros no se eliminan.

create policy historial_leer on public.registros_historial
  for select to authenticated
  using (exists (select 1 from public.registros r where r.id = registro_id and (r.user_id = auth.uid() or public.ve_equipo())));

-- Notificaciones: solo el administrador (las crea el trigger del registro).
create policy notificaciones_leer on public.notificaciones
  for select to authenticated using (public.es_admin());

create policy notificaciones_marcar on public.notificaciones
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Metas: el comercial ve las suyas; administración y dirección, todas. Solo el admin escribe.
create policy metas_leer on public.metas
  for select to authenticated
  using (user_id = auth.uid() or public.ve_equipo());

create policy metas_crear on public.metas
  for insert to authenticated with check (public.es_admin());

create policy metas_editar on public.metas
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy metas_borrar on public.metas
  for delete to authenticated using (public.es_admin());

-- -----------------------------------------------------------------------------
-- Permisos de acceso: nada para usuarios anónimos.
-- -----------------------------------------------------------------------------

-- Supabase concede por defecto permisos amplios a anon y authenticated:
-- se retiran y se concede solo lo necesario (RLS filtra además las filas).
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

grant select on public.indicadores to authenticated;
grant select, update on public.perfiles to authenticated;
grant select, insert, update on public.registros to authenticated;
grant select on public.registros_historial to authenticated;
grant select, update on public.notificaciones to authenticated;
grant select, insert, update, delete on public.metas to authenticated;

grant execute on function
  public.hoy_bogota(), public.domingo_pascua(int), public.trasladar_a_lunes(date),
  public.festivos_colombia(int), public.es_habil(date), public.motivo_no_habil(date),
  public.mis_roles(), public.es_admin(), public.es_director(), public.soy_comercial(),
  public.ve_equipo(), public.es_comercial(uuid),
  public.definir_meta(uuid, text, public.periodicidad, numeric, date), public.finalizar_meta(uuid)
to authenticated;
