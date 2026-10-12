-- =============================================================================
-- PULSO COMERCIAL DMB — Acceso con código (activación y restablecimiento)
-- =============================================================================
-- Flujo:
--   1. El administrador autoriza un correo (nombre, roles, fecha de inicio) y
--      recibe un CÓDIGO DE ACTIVACIÓN de un solo uso que vence en 7 días.
--   2. La persona entra a la app → "Activar mi cuenta" → correo + código + su
--      propia contraseña. La cuenta se crea con supabase.auth.signUp y el
--      trigger de Auth valida el código: sin código válido, no hay cuenta.
--   3. Si alguien olvida su contraseña, el administrador genera un CÓDIGO DE
--      RESTABLECIMIENTO y la persona crea una nueva desde "Olvidé mi contraseña".
-- Nadie más que la persona conoce su contraseña. No se envían correos.
-- Los códigos se guardan como hash SHA-256; el texto solo se muestra una vez.
--
-- Configuración de Supabase requerida (Authentication):
--   · Allow new users to sign up: ACTIVADO (el trigger rechaza correos no autorizados).
--   · Confirm email: DESACTIVADO (la identidad la confirma el código).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create table public.codigos_acceso (
  id           uuid primary key default gen_random_uuid(),
  correo       text not null check (correo = lower(trim(correo))),
  tipo         text not null check (tipo in ('activacion', 'restablecer')),
  codigo_hash  text not null,
  -- Datos del perfil a crear (solo activación).
  nombre       text,
  roles        public.rol[],
  fecha_inicio date,
  -- Usuario existente (solo restablecimiento).
  user_id      uuid references public.perfiles (id) on delete cascade,
  creado       timestamptz not null default now(),
  creado_por   uuid references public.perfiles (id) on delete set null,
  expira       timestamptz not null default now() + interval '7 days',
  usado        timestamptz,
  check (tipo <> 'activacion' or (nombre is not null and roles is not null and fecha_inicio is not null)),
  check (tipo <> 'restablecer' or user_id is not null)
);

-- Un solo código pendiente por correo y tipo.
create unique index codigos_acceso_pendiente on public.codigos_acceso (correo, tipo) where usado is null;

alter table public.codigos_acceso enable row level security;

create policy codigos_leer on public.codigos_acceso
  for select to authenticated using (public.es_admin());

grant select on public.codigos_acceso to authenticated;

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

create function public.hash_codigo(codigo text) returns text
language sql immutable
as $$ select encode(sha256(convert_to(upper(regexp_replace(coalesce(codigo, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex') $$;

-- 10 caracteres sin símbolos ambiguos (sin 0/O, 1/I/L), presentados como XXXXX-XXXXX.
-- Aleatoriedad criptográfica: los bytes salen de gen_random_uuid().
create function public.generar_codigo() returns text
language plpgsql volatile
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  posiciones constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14];
  out text := '';
  i int;
begin
  for i in 1..10 loop
    out := out || substr(alfabeto, (get_byte(bytes, posiciones[i] + (i % 2) * 16) % length(alfabeto)) + 1, 1);
  end loop;
  return substr(out, 1, 5) || '-' || substr(out, 6, 5);
end
$$;

-- -----------------------------------------------------------------------------
-- Funciones del administrador
-- -----------------------------------------------------------------------------

-- Autoriza un correo y devuelve el código de activación (solo se muestra esta vez).
create function public.autorizar_acceso(p_correo text, p_nombre text, p_roles public.rol[], p_fecha_inicio date)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  correo_n text := lower(trim(coalesce(p_correo, '')));
  codigo text := public.generar_codigo();
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede autorizar accesos.';
  end if;
  if correo_n !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Escribe un correo electrónico válido.';
  end if;
  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Escribe el nombre de la persona.';
  end if;
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'Selecciona al menos un rol.';
  end if;
  if p_fecha_inicio is null then
    raise exception 'Indica una fecha de inicio válida.';
  end if;
  if exists (select 1 from public.perfiles p where lower(p.correo) = correo_n) then
    raise exception 'Ya existe una cuenta con ese correo.';
  end if;

  -- Un nuevo código reemplaza al pendiente anterior.
  delete from public.codigos_acceso c where c.correo = correo_n and c.tipo = 'activacion' and c.usado is null;
  insert into public.codigos_acceso (correo, tipo, codigo_hash, nombre, roles, fecha_inicio, creado_por)
  values (correo_n, 'activacion', public.hash_codigo(codigo), trim(p_nombre),
          (select array_agg(distinct r) from unnest(p_roles) r), p_fecha_inicio, auth.uid());
  return codigo;
end
$$;

-- Cancela una autorización pendiente.
create function public.cancelar_autorizacion(p_correo text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede gestionar accesos.';
  end if;
  delete from public.codigos_acceso c
  where c.correo = lower(trim(p_correo)) and c.tipo = 'activacion' and c.usado is null;
end
$$;

-- Genera un código para que un usuario existente cree una contraseña nueva.
create function public.generar_codigo_restablecer(p_user_id uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  correo_u text;
  codigo text := public.generar_codigo();
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede restablecer contraseñas.';
  end if;
  select lower(p.correo) into correo_u from public.perfiles p where p.id = p_user_id;
  if correo_u is null then
    raise exception 'Usuario no encontrado.';
  end if;
  delete from public.codigos_acceso c where c.correo = correo_u and c.tipo = 'restablecer' and c.usado is null;
  insert into public.codigos_acceso (correo, tipo, codigo_hash, user_id, creado_por)
  values (correo_u, 'restablecer', public.hash_codigo(codigo), p_user_id, auth.uid());
  return codigo;
end
$$;

-- -----------------------------------------------------------------------------
-- Funciones públicas (sin sesión)
-- -----------------------------------------------------------------------------

-- La persona crea una contraseña nueva con su código de restablecimiento.
create function public.restablecer_clave_con_codigo(p_correo text, p_codigo text, p_clave text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.codigos_acceso;
begin
  if char_length(coalesce(p_clave, '')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres.';
  end if;
  select * into c from public.codigos_acceso x
  where x.correo = lower(trim(coalesce(p_correo, ''))) and x.tipo = 'restablecer'
    and x.usado is null and x.expira > now() and x.codigo_hash = public.hash_codigo(p_codigo);
  if not found then
    raise exception 'El correo o el código no son válidos, o el código ya venció. Pide uno nuevo al administrador.';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')), updated_at = now()
  where id = c.user_id;
  update public.codigos_acceso set usado = now() where id = c.id;
end
$$;

-- -----------------------------------------------------------------------------
-- Alta de usuarios en Supabase Auth → perfil (reemplaza la versión inicial)
-- -----------------------------------------------------------------------------
-- 1. Con roles en app_metadata (solo el servidor puede escribirla): se respetan.
-- 2. Con un código de activación válido en user_metadata: se crea el perfil con
--    los datos que autorizó el administrador y el código queda usado.
-- 3. En cualquier otro caso se rechaza el alta: nadie se registra sin autorización.
create or replace function public.crear_perfil_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  roles_meta public.rol[];
  c public.codigos_acceso;
begin
  select array_agg(r::public.rol) into roles_meta
  from jsonb_array_elements_text(case when jsonb_typeof(meta -> 'roles') = 'array' then meta -> 'roles' else '[]'::jsonb end) r;

  if roles_meta is not null then
    insert into public.perfiles (id, nombre, correo, roles, fecha_inicio, activo, creado_por)
    values (
      new.id,
      coalesce(nullif(trim(meta ->> 'nombre'), ''), split_part(new.email, '@', 1)),
      lower(new.email), roles_meta,
      coalesce((meta ->> 'fecha_inicio')::date, public.hoy_bogota()),
      true, (meta ->> 'creado_por')::uuid);
    return new;
  end if;

  select * into c from public.codigos_acceso x
  where x.correo = lower(new.email) and x.tipo = 'activacion' and x.usado is null and x.expira > now()
    and x.codigo_hash = public.hash_codigo(new.raw_user_meta_data ->> 'codigo_activacion');
  if not found then
    raise exception 'CORREO_NO_AUTORIZADO: el correo no está autorizado o el código de activación no es válido o venció.';
  end if;

  insert into public.perfiles (id, nombre, correo, roles, fecha_inicio, activo, creado_por)
  values (new.id, c.nombre, lower(new.email), c.roles, c.fecha_inicio, true, c.creado_por);
  update public.codigos_acceso set usado = now(), user_id = new.id where id = c.id;
  -- El código ya cumplió su función: no se deja guardado en los metadatos.
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'codigo_activacion' where id = new.id;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

revoke execute on function
  public.hash_codigo(text), public.generar_codigo(),
  public.autorizar_acceso(text, text, public.rol[], date), public.cancelar_autorizacion(text),
  public.generar_codigo_restablecer(uuid), public.restablecer_clave_con_codigo(text, text, text)
from public, anon, authenticated;

grant execute on function
  public.autorizar_acceso(text, text, public.rol[], date), public.cancelar_autorizacion(text),
  public.generar_codigo_restablecer(uuid)
to authenticated;

-- Restablecer con código se hace sin sesión (la persona olvidó su contraseña).
grant execute on function public.restablecer_clave_con_codigo(text, text, text) to anon, authenticated;
