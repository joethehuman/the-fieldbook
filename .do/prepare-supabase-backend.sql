-- Backend preparation for the Supabase Marketplace managed-database bootstrap.
-- Run as the cluster administrator on a new, unused backend before Fieldbook setup.
begin;
do $$
begin
  if to_regclass('auth.users') is null or to_regclass('auth.schema_migrations') is null then
    raise exception 'Initialize Supabase Auth before preparing its database role';
  end if;
  if exists(select 1 from auth.users) or to_regclass('public.fb_config') is not null then
    raise exception 'Use this preparation only on a new, unused backend';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    if (select tableowner from pg_tables where schemaname='public' and tablename='schema_migrations')
        is distinct from 'supabase_auth_admin'
        or exists(select 1 from auth.schema_migrations) then
      raise exception 'Unexpected migration ledger; review the backend before continuing';
    end if;
    -- Preserve the Auth ledger in its own schema before removing the misplaced copy.
    insert into auth.schema_migrations(version) select version from public.schema_migrations;
    drop table public.schema_migrations;
  end if;
end $$;
alter role supabase_auth_admin set search_path to auth;
alter role supabase_storage_admin noinherit;
alter role supabase_storage_admin set search_path to storage;
grant anon, authenticated, service_role to supabase_storage_admin;
grant usage on schema storage, auth to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant all on all functions in schema storage to anon, authenticated, service_role;
grant all on all sequences in schema storage to anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on tables to anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on functions to anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to anon, authenticated, service_role;
commit;
