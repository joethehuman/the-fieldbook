-- Fresh dedicated Managed PostgreSQL 17 database only. The preparation command
-- owns the transaction and sets independent login passwords without logging them.
-- Auth and Storage own their tables and ledgers; do not synthesize them here.
do $$
begin
  if current_setting('server_version_num')::int < 170000
     or current_setting('server_version_num')::int >= 180000 then
    raise exception 'This backend recipe requires PostgreSQL 17';
  end if;
  if exists(select 1 from pg_namespace where nspname in ('auth','storage','supabase_migrations'))
     or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'))
     or exists(select 1 from pg_roles where rolname in
       ('anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin')) then
    raise exception 'Backend preparation requires an empty dedicated database and unused service roles';
  end if;
end $$;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit;
create role supabase_auth_admin login noinherit;
create role supabase_storage_admin login noinherit;
grant anon, authenticated, service_role to authenticator, supabase_storage_admin;
-- Managed administrators need membership to own schemas on behalf of services.
do $$ begin
  execute format('grant supabase_auth_admin, supabase_storage_admin to %I with inherit true, set true', current_user);
end $$;

revoke create on schema public from public;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create schema auth authorization supabase_auth_admin;
create schema storage authorization supabase_storage_admin;
grant usage on schema public, extensions to anon, authenticated, service_role, supabase_auth_admin, supabase_storage_admin;
grant usage on schema auth to anon, authenticated, service_role, supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path to auth;
alter role supabase_storage_admin set search_path to storage, public, extensions;
alter role authenticator set search_path to public, extensions;
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';

-- Storage runs its own migrations with DB_INSTALL_ROLES=false. Its owner can
-- SET ROLE for RLS checks; API roles cannot create schema objects.
alter default privileges for role supabase_storage_admin in schema storage grant all on tables to anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on functions to anon, authenticated, service_role;

set local role supabase_auth_admin;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role')
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
create function auth.email() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email')
$$;
reset role;
