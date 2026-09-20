-- Fieldbook's server is the authorization boundary. Browser and OAuth clients
-- have no direct table access; all writes use the same validated app services.
create table public.fb_config (
  id boolean primary key default true check (id),
  revision integer not null default 1,
  settings jsonb not null default '{"name":"Fieldbook","tagline":"A shared place to get better.","logoUrl":"","accent":"#0069ff","access":"public","registration":"open"}',
  groups jsonb not null default '[]', teams jsonb not null default '[]'
);
insert into public.fb_config(id) values(true);
create table public.fb_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null, email text not null,
  role text not null default 'learner' check(role in ('admin','learner','manager')),
  active boolean not null default true,
  groups jsonb not null default '[]', team_id text, group_joined_at jsonb not null default '{}'
);
create table public.fb_documents (
  id uuid primary key, revision integer not null default 1,
  draft jsonb not null, published jsonb, published_revision integer,
  updated_at timestamptz not null default now()
);
create table public.fb_audit (
  id bigint generated always as identity primary key,
  actor uuid not null, source text not null, action text not null,
  entity_id text not null, revision integer, at timestamptz not null default now(),
  snapshot jsonb
);
create table public.fb_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid not null references public.fb_documents(id),
  version integer not null, lessons jsonb not null default '[]',
  passed boolean not null default false, attempts jsonb not null default '[]',
  primary key(user_id,content_id,version)
);
create table public.fb_feedback (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid not null references public.fb_documents(id), version integer not null,
  rating text not null check(rating in ('up','down')), comment text not null,
  updated_at timestamptz not null default now(), unique(user_id,content_id)
);
create table public.fb_media (
  id uuid primary key, path text unique not null, filename text not null,
  mime text not null, bytes bigint not null, owner uuid not null,
  ready boolean not null default false, created_at timestamptz not null default now()
);
create table public.fb_mcp_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null, client_name text not null,
  enabled boolean not null default true, granted_at timestamptz not null default now(),
  primary key(user_id,client_id)
);
create table public.fb_rate_limits (
  key text primary key, count integer not null, expires_at timestamptz not null
);
do $$ declare t text; begin
  foreach t in array array['fb_config','fb_profiles','fb_documents','fb_audit','fb_progress','fb_feedback','fb_media','fb_mcp_grants','fb_rate_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant usage,select on sequence public.fb_audit_id_seq to service_role;

create or replace function public.fb_save_document(p_id uuid, p_expected integer, p_draft jsonb, p_publish boolean, p_unpublish boolean, p_actor uuid, p_source text)
returns public.fb_documents language plpgsql set search_path = '' as $$
declare d public.fb_documents;
begin
  if p_expected = 0 then
    insert into public.fb_documents(id,draft) values(p_id,p_draft) on conflict do nothing;
    if not found then raise exception 'Revision conflict'; end if;
    select * into d from public.fb_documents where id=p_id for update;
  else
    select * into d from public.fb_documents where id=p_id for update;
    if not found or d.revision <> p_expected then raise exception 'Revision conflict'; end if;
    update public.fb_documents set draft=p_draft,revision=revision+1,updated_at=now() where id=p_id returning * into d;
  end if;
  if p_publish then
    update public.fb_documents set published=p_draft,published_revision=d.revision where id=p_id returning * into d;
  elsif p_unpublish then
    update public.fb_documents set published=null,published_revision=null where id=p_id returning * into d;
  end if;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot)
    values(p_actor,p_source,case when p_publish then 'publish' when p_unpublish then 'unpublish' else 'save_draft' end,p_id::text,d.revision,p_draft);
  return d;
end $$;
revoke all on function public.fb_save_document from public,anon,authenticated;
grant execute on function public.fb_save_document to service_role;

create or replace function public.fb_record_progress(p_user uuid,p_content uuid,p_version integer,p_lessons jsonb,p_passed boolean,p_attempt jsonb)
returns public.fb_progress language plpgsql set search_path = '' as $$
declare result public.fb_progress;
begin
  insert into public.fb_progress(user_id,content_id,version,lessons,passed,attempts)
  values(p_user,p_content,p_version,p_lessons,p_passed,case when p_attempt is null then '[]'::jsonb else jsonb_build_array(p_attempt) end)
  on conflict(user_id,content_id,version) do update set
    lessons=(select coalesce(jsonb_agg(distinct x),'[]') from jsonb_array_elements(public.fb_progress.lessons || excluded.lessons) x),
    passed=public.fb_progress.passed or excluded.passed,
    attempts=public.fb_progress.attempts || excluded.attempts
  returning * into result;
  return result;
end $$;
revoke all on function public.fb_record_progress from public,anon,authenticated;
grant execute on function public.fb_record_progress to service_role;

create or replace function public.fb_allow_request(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.fb_rate_limits(key,count,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set
    count=case when public.fb_rate_limits.expires_at<now() then 1 else public.fb_rate_limits.count+1 end,
    expires_at=case when public.fb_rate_limits.expires_at<now() then now()+make_interval(secs=>p_seconds) else public.fb_rate_limits.expires_at end
  returning count into n;
  return n<=p_limit;
end $$;
revoke all on function public.fb_allow_request from public,anon,authenticated;
grant execute on function public.fb_allow_request to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fieldbook-media','fieldbook-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict(id) do nothing;
-- No storage policies: only server-issued, path-specific signed upload/read URLs.
