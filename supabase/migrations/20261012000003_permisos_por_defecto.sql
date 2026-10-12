-- =============================================================================
-- PULSO COMERCIAL DMB — Permisos mínimos también para tablas futuras
-- =============================================================================
-- Supabase concede por defecto todos los permisos a anon y authenticated sobre
-- cada tabla nueva del esquema public. Las reglas RLS ya ocultan las filas, pero
-- el principio es "nada por defecto": se retiran esos permisos automáticos y se
-- concede explícitamente solo lo necesario en cada migración.
-- =============================================================================

-- Tabla creada en la migración 2: solo lectura para el administrador (vía RLS).
revoke all on public.codigos_acceso from anon, authenticated;
grant select on public.codigos_acceso to authenticated;

-- De aquí en adelante, las tablas y funciones nuevas nacen sin permisos para
-- anon / authenticated (para objetos creados por el rol postgres, que es el que
-- usa el SQL Editor).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;
