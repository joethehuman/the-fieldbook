-- Fieldbook fresh-install baseline.
-- The starting schema for a new installation. Add future changes as new migrations.

-- Begin 202609190001_fieldbook.sql
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
  updated_at timestamptz not null default now()
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

insert into storage.buckets(id,name,public,allowed_mime_types)
values('fieldbook-media','fieldbook-media',false,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict(id) do nothing;
-- No storage policies: only server-issued, path-specific signed upload/read URLs.
-- End 202609190001_fieldbook.sql

-- Begin 202609190002_mcp_audience.sql
create table public.fb_oauth_config(id boolean primary key default true check(id),resource text not null);
alter table public.fb_oauth_config enable row level security;
revoke all on public.fb_oauth_config from anon,authenticated;
grant all on public.fb_oauth_config to service_role;

-- Enable this function as the Custom Access Token Hook in Supabase Auth.
-- OAuth tokens for approved Fieldbook clients are bound to this MCP endpoint.
create or replace function public.fb_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb; client text; resource text;
begin
  claims := event->'claims';
  client := coalesce(event->>'client_id',claims->>'client_id');
  if client is not null and exists(select 1 from public.fb_mcp_grants where user_id=(event->>'user_id')::uuid and client_id=client and enabled) then
    select c.resource into resource from public.fb_oauth_config c where id=true;
    if resource is not null then claims := jsonb_set(claims,'{aud}',to_jsonb(resource)); end if;
  end if;
  return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.fb_access_token_hook from public,anon,authenticated;
grant execute on function public.fb_access_token_hook to supabase_auth_admin;
-- End 202609190002_mcp_audience.sql

-- Begin 202609200001_governance.sql
-- Additive migration. Apply to an isolated preview first; existing content/progress is preserved.
alter table public.fb_config add column governance_revision integer not null default 1;
alter table public.fb_profiles add column effective_group_joined_at jsonb not null default '{}';
create table public.fb_pending_profiles (
  email text primary key check(email=lower(trim(email))), name text not null,
  role text not null check(role in ('admin','manager','learner')),
  groups jsonb not null default '[]', team_id text,
  created_at timestamptz not null default now()
);
alter table public.fb_pending_profiles enable row level security;
revoke all on public.fb_pending_profiles from public,anon,authenticated;
grant all on public.fb_pending_profiles to service_role;

create function public.fb_effective_groups(p_direct jsonb,p_nodes jsonb) returns table(id text)
language sql immutable set search_path='' as $$
  with recursive ancestors(id) as (
    select jsonb_array_elements_text(p_direct)
    union
    select n->>'parentId' from ancestors a, jsonb_array_elements(p_nodes) n
    where n->>'id'=a.id and n->>'parentId' is not null
  ) select id from ancestors;
$$;

create function public.fb_validate_nodes(p_nodes jsonb) returns void
language plpgsql set search_path='' as $$
declare n jsonb; current_id text; seen text[];
begin
  if jsonb_typeof(p_nodes)<>'array' then raise exception 'Invalid hierarchy'; end if;
  if exists(select 1 from jsonb_array_elements(p_nodes) x group by x->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(p_nodes) x group by lower(trim(x->>'name')) having count(*)>1)
    then raise exception 'Use unique IDs and names'; end if;
  for n in select * from jsonb_array_elements(p_nodes) loop
    if coalesce(length(n->>'id'),0)=0 or coalesce(length(trim(n->>'name')),0)=0 then raise exception 'Name and ID required'; end if;
    current_id:=n->>'id'; seen:='{}';
    while current_id is not null loop
      if current_id=any(seen) then raise exception 'Hierarchy cannot contain a cycle'; end if;
      seen:=array_append(seen,current_id);
      if not exists(select 1 from jsonb_array_elements(p_nodes) x where x->>'id'=current_id) then raise exception 'Parent does not exist'; end if;
      select x->>'parentId' into current_id from jsonb_array_elements(p_nodes) x where x->>'id'=current_id;
    end loop;
  end loop;
end $$;

-- One lock serializes membership, hierarchy, registration and assignment changes.
create function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    if exists(select 1 from public.fb_profiles where lower(email)=lower(p_data->>'email')) then raise exception 'An account already uses that email'; end if;
    if coalesce((p_data->>'revoke')::boolean,false) then
      delete from public.fb_pending_profiles where email=lower(trim(p_data->>'email'));
    else
      if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
      insert into public.fb_pending_profiles(email,name,role,groups,team_id)
      values(lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId')
      on conflict(email) do update set name=excluded.name,role=excluded.role,groups=excluded.groups,team_id=excluded.team_id;
    end if;
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    if exists(select 1 from jsonb_array_elements(cfg.groups) existing_node where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=existing_node->>'id'))
      or exists(select 1 from jsonb_array_elements(cfg.teams) existing_node where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=existing_node->>'id')) then raise exception 'Remove memberships or reparent instead of deleting groups and teams'; end if;
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_effective_groups(u->'groups',p_data->'groups') g;
      update public.fb_profiles set name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin') then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams' where id;
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

-- Called only after Supabase has verified the identity and email, using the server secret.
create function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns public.fb_profiles language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; pending public.fb_pending_profiles; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  select * into result from public.fb_profiles where id=p_id;
  if found then return result; end if;
  select * into pending from public.fb_pending_profiles where email=lower(p_email);
  if pending.email is null and not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
  if exists(select 1 from public.fb_profiles where lower(email)=lower(p_email)) then raise exception 'Email is already linked to an account'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into public.fb_profiles(id,email,name,role,groups,team_id,group_joined_at,effective_group_joined_at)
  values(p_id,p_email,coalesce(pending.name,p_name),case when p_owner then 'admin' else coalesce(pending.role,'learner') end,
    coalesce(pending.groups,'[]'),pending.team_id,
    (select coalesce(jsonb_object_agg(g,stamp),'{}') from jsonb_array_elements_text(coalesce(pending.groups,'[]')) g),
    (select coalesce(jsonb_object_agg(g.id,stamp),'{}') from public.fb_effective_groups(coalesce(pending.groups,'[]'),cfg.groups) g)) returning * into result;
  delete from public.fb_pending_profiles where email=lower(p_email);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_id,'auth','register',p_id::text,jsonb_build_object('preRegistered',pending.email is not null,'role',result.role));
  return result;
end $$;

-- Report authorization and related rows are evaluated in one database snapshot.
create function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role='manager' and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.id=me.id or me.role='admin' or (me.role='manager' and p.active and p.team_id in(select id from allowed))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_effective_groups(p.groups,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending',case when exists(select 1 from me where role='admin') then coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_pending_profiles p),'[]') else '[]'::jsonb end
);
$$;

-- Assignment time is the start of the current published rule, not a client timestamp.
create function public.fb_assignment_guard() returns trigger language plpgsql set search_path='' as $$
declare cfg public.fb_config; payload jsonb; rules jsonb; rule jsonb; prior jsonb; gid text; stamp text; field text;
begin
  select * into cfg from public.fb_config where id for update;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  foreach field in array array['draft','published'] loop
    payload:=case when field='draft' then new.draft else new.published end;
    if payload is null then continue; end if;
    rules:='[]';
    for rule in select * from jsonb_array_elements(coalesce(payload->'assignments',(select coalesce(jsonb_agg(jsonb_build_object('groupId',g,'due',jsonb_build_object('type','none'))),'[]') from jsonb_array_elements_text(coalesce(payload->'groups','[]')) g))) loop
      gid:=rule->>'groupId';
      if payload->>'kind'<>'course' then raise exception 'Only courses can be assigned'; end if;
      if not exists(select 1 from jsonb_array_elements(cfg.groups) g where g->>'id'=gid) then raise exception 'Assignment group does not exist'; end if;
      if exists(select 1 from jsonb_array_elements(rules) r where r->>'groupId'=gid) then raise exception 'Duplicate assignment'; end if;
      if rule->'due'->>'type' not in ('none','date','days') or rule->'due'->>'type' is null then raise exception 'Invalid deadline'; end if;
      if rule->'due'->>'type'='days' and not ((rule->'due'->>'days')::integer between 1 and 3650) then raise exception 'Invalid deadline'; end if;
      if rule->'due'->>'type'='date' then perform (rule->'due'->>'date')::date; end if;
      prior:=null;
      if TG_OP='UPDATE' then select r into prior from jsonb_array_elements(coalesce(old.published->'assignments','[]')) r where r->>'groupId'=gid; end if;
      rules:=rules||jsonb_build_array(rule||jsonb_build_object('assignedAt',coalesce(prior->>'assignedAt',stamp)));
    end loop;
    payload:=payload||jsonb_build_object('assignments',rules,'groups',(select coalesce(jsonb_agg(r->>'groupId'),'[]') from jsonb_array_elements(rules) r));
    if field='draft' then new.draft:=payload; else new.published:=payload; end if;
  end loop;
  return new;
end $$;
create trigger fb_assignment_guard before insert or update on public.fb_documents for each row execute function public.fb_assignment_guard();

-- Existing effective memberships begin conservatively at migration time if no prior date exists.
update public.fb_profiles p set effective_group_joined_at=(select coalesce(jsonb_object_agg(g.id,coalesce(p.group_joined_at->>g.id,to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),'{}') from public.fb_config c,public.fb_effective_groups(p.groups,c.groups) g);

do $$ declare f text; begin
  foreach f in array array['fb_effective_groups','fb_validate_nodes','fb_save_governance','fb_register_profile','fb_governance_snapshot','fb_assignment_guard'] loop
    execute format('revoke all on function public.%I from public,anon,authenticated',f);
    execute format('grant execute on function public.%I to service_role',f);
  end loop;
end $$;

create or replace function public.fb_save_document(p_id uuid, p_expected integer, p_draft jsonb, p_publish boolean, p_unpublish boolean, p_actor uuid, p_source text)
returns public.fb_documents language plpgsql set search_path = '' as $$
declare d public.fb_documents;
begin
  perform 1 from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
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
    values(p_actor,p_source,case when p_publish then 'publish' when p_unpublish then 'unpublish' else 'save_draft' end,p_id::text,d.revision,d.draft);
  return d;
end $$;
revoke all on function public.fb_save_document from public,anon,authenticated;
grant execute on function public.fb_save_document to service_role;
-- End 202609200001_governance.sql

-- Begin 202609200002_assignments.sql
-- Assignment-only changes preserve unpublished course edits. All writes are admin-only and audited.
alter table public.fb_progress add column revision integer not null default 1;
create function public.fb_progress_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision := old.revision + 1; return new; end $$;
create trigger fb_progress_revision before update on public.fb_progress for each row execute function public.fb_progress_revision();
revoke all on function public.fb_progress_revision from public,anon,authenticated;
create or replace function public.fb_assignment_guard() returns trigger language plpgsql set search_path='' as $$
declare cfg public.fb_config; payload jsonb; rules jsonb; rule jsonb; prior jsonb; gid text; uid text; stamp text; field text;
begin
  select * into cfg from public.fb_config where id for update;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  foreach field in array array['draft','published'] loop
    payload:=case when field='draft' then new.draft else new.published end;
    if payload is null then continue; end if;
    rules:='[]';
    for rule in select * from jsonb_array_elements(coalesce(payload->'assignments',(select coalesce(jsonb_agg(jsonb_build_object('groupId',g,'due',jsonb_build_object('type','none'))),'[]') from jsonb_array_elements_text(coalesce(payload->'groups','[]')) g))) loop
      gid:=rule->>'groupId'; uid:=rule->>'userId';
      if (gid is null) = (uid is null) then raise exception 'Choose exactly one assignment recipient'; end if;
      if payload->>'kind'<>'course' then raise exception 'Only courses can be assigned'; end if;
      if gid is not null and not exists(select 1 from jsonb_array_elements(cfg.groups) g where g->>'id'=gid) then raise exception 'Assignment group does not exist'; end if;
      if uid is not null and not exists(select 1 from public.fb_profiles where id::text=uid) then raise exception 'Assignment user does not exist'; end if;
      if exists(select 1 from jsonb_array_elements(rules) r where (gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid)) then raise exception 'Duplicate assignment'; end if;
      if rule->'due'->>'type' not in ('none','date','days') or rule->'due'->>'type' is null then raise exception 'Invalid deadline'; end if;
      if rule->'due'->>'type'='days' and not ((rule->'due'->>'days')::integer between 1 and 3650) then raise exception 'Invalid deadline'; end if;
      if rule->'due'->>'type'='date' then perform (rule->'due'->>'date')::date; end if;
      prior:=null;
      if TG_OP='UPDATE' then select r into prior from jsonb_array_elements(coalesce(old.published->'assignments','[]')) r where (gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid); end if;
      rules:=rules||jsonb_build_array(rule||jsonb_build_object('assignedAt',coalesce(prior->>'assignedAt',stamp)));
    end loop;
    payload:=payload||jsonb_build_object('assignments',rules,'groups',(select coalesce(jsonb_agg(r->>'groupId'),'[]') from jsonb_array_elements(rules) r where r->>'groupId' is not null));
    if field='draft' then new.draft:=payload; else new.published:=payload; end if;
  end loop;
  return new;
end $$;

create function public.fb_manage_learning(p_actor uuid,p_data jsonb) returns jsonb language plpgsql set search_path='' as $$
declare d public.fb_documents; p public.fb_progress; before_p jsonb; op text:=p_data->>'operation';
 cid uuid:=(p_data->>'contentId')::uuid; uid uuid:=(p_data->>'userId')::uuid; gid text:=p_data->>'groupId';
 rules jsonb; draft_rules jsonb; rule jsonb; group_ids jsonb;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_documents where id=cid for update;
 if not found or d.published is null or d.published->>'kind'<>'course' then raise exception 'Publish the course before managing assignments'; end if;
 if d.revision<>(p_data->>'expected')::integer then raise exception 'Course changed. Reload before saving'; end if;
 if (uid is null) = (gid is null) then raise exception 'Choose exactly one recipient'; end if;
 if uid is not null and not exists(select 1 from public.fb_profiles where id=uid) then raise exception 'Person does not exist'; end if;
 if op in ('assign','unassign') then
   if gid is not null and not exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) g where g->>'id'=gid) then raise exception 'Group does not exist'; end if;
   select coalesce(jsonb_agg(r),'[]') into rules from jsonb_array_elements(coalesce(d.published->'assignments','[]')) r where not ((gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid::text)) is true;
   select coalesce(jsonb_agg(r),'[]') into draft_rules from jsonb_array_elements(coalesce(d.draft->'assignments','[]')) r where not ((gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid::text)) is true;
   if op='assign' then
     rule:=jsonb_strip_nulls(jsonb_build_object('groupId',gid,'userId',uid,'due',p_data->'due'));
     rules:=rules||jsonb_build_array(rule); draft_rules:=draft_rules||jsonb_build_array(rule);
   end if;
   update public.fb_documents set published=jsonb_set(published,'{assignments}',rules),draft=jsonb_set(draft,'{assignments}',draft_rules),revision=revision+1,updated_at=now() where id=cid returning * into d;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','assignment_'||op,cid::text,d.revision,p_data);
 elsif op in ('complete','reset') then
   if uid is null or (d.published->>'version')::integer<>(p_data->>'version')::integer then raise exception 'Course version changed. Reload before saving'; end if;
   -- Insert a placeholder so concurrent first writes and resets share a row lock.
   insert into public.fb_progress(user_id,content_id,version,revision) values(uid,cid,(p_data->>'version')::integer,0) on conflict do nothing;
   select * into p from public.fb_progress where user_id=uid and content_id=cid and version=(p_data->>'version')::integer for update;
   if p.revision is distinct from (p_data->>'progressExpected')::integer then raise exception 'Progress changed. Reload before saving'; end if;
   before_p:=to_jsonb(p);
   update public.fb_progress set lessons=case when op='complete' then (select coalesce(jsonb_agg(l->>'id'),'[]') from jsonb_array_elements(d.published->'lessons') l) else '[]'::jsonb end,
     passed=(op='complete'), attempts=case when op='reset' then '[]'::jsonb else attempts end
     where user_id=uid and content_id=cid and version=p.version returning * into p;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','progress_'||op,cid::text,p.revision,jsonb_build_object('before',before_p,'after',to_jsonb(p)));
 else raise exception 'Unknown learning operation'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.fb_manage_learning from public,anon,authenticated;
grant execute on function public.fb_manage_learning to service_role;
-- End 202609200002_assignments.sql

-- Begin 202609200003_required_learning.sql
begin;
-- Required learning replaces individual assignments and per-course deadlines.
-- Preserve progress and an audit snapshot of the retired rules.
alter table public.fb_profiles add column onboarding_start date;
alter table public.fb_pending_profiles add column onboarding_start date;
update public.fb_config set settings=jsonb_build_object('onboardingDays',90,'catchUpDays',30,'newUserStage','existing')||settings;
insert into public.fb_audit(actor,source,action,entity_id,snapshot)
select a.id,'migration','required_learning_transition',d.id::text,jsonb_build_object('draftAssignments',d.draft->'assignments','publishedAssignments',d.published->'assignments')
from public.fb_documents d cross join lateral (select id from public.fb_profiles where role='admin' order by id limit 1) a;
update public.fb_documents d set
 draft=jsonb_set(d.draft,'{assignments}',(select coalesce(jsonb_agg(r||jsonb_build_object('due',jsonb_build_object('type','none'))),'[]') from jsonb_array_elements(coalesce(d.draft->'assignments','[]')) r where r->>'groupId' is not null)),
 published=case when d.published is null then null else jsonb_set(d.published,'{assignments}',(select coalesce(jsonb_agg(r||jsonb_build_object('due',jsonb_build_object('type','none'))),'[]') from jsonb_array_elements(coalesce(d.published->'assignments','[]')) r where r->>'groupId' is not null)) end,
 revision=revision+1;
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    if exists(select 1 from public.fb_profiles where lower(email)=lower(p_data->>'email')) then raise exception 'An account already uses that email'; end if;
    if coalesce((p_data->>'revoke')::boolean,false) then
      delete from public.fb_pending_profiles where email=lower(trim(p_data->>'email'));
    else
      if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
      insert into public.fb_pending_profiles(email,name,role,groups,team_id,onboarding_start)
      values(lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'onboardingStart')::date)
      on conflict(email) do update set name=excluded.name,role=excluded.role,groups=excluded.groups,team_id=excluded.team_id,onboarding_start=excluded.onboarding_start;
    end if;
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    if exists(select 1 from jsonb_array_elements(cfg.groups) existing_node where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=existing_node->>'id'))
      or exists(select 1 from jsonb_array_elements(cfg.teams) existing_node where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=existing_node->>'id')) then raise exception 'Remove memberships or reparent instead of deleting groups and teams'; end if;
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_effective_groups(u->'groups',p_data->'groups') g;
      update public.fb_profiles set onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin') then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams' where id;
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

-- Called only after Supabase has verified the identity and email, using the server secret.
create or replace function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns public.fb_profiles language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; pending public.fb_pending_profiles; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  select * into result from public.fb_profiles where id=p_id;
  if found then return result; end if;
  select * into pending from public.fb_pending_profiles where email=lower(p_email);
  if pending.email is null and not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
  if exists(select 1 from public.fb_profiles where lower(email)=lower(p_email)) then raise exception 'Email is already linked to an account'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into public.fb_profiles(id,email,name,role,groups,team_id,group_joined_at,effective_group_joined_at,onboarding_start)
  values(p_id,p_email,coalesce(pending.name,p_name),case when p_owner then 'admin' else coalesce(pending.role,'learner') end,
    coalesce(pending.groups,'[]'),pending.team_id,
    (select coalesce(jsonb_object_agg(g,stamp),'{}') from jsonb_array_elements_text(coalesce(pending.groups,'[]')) g),
    (select coalesce(jsonb_object_agg(g.id,stamp),'{}') from public.fb_effective_groups(coalesce(pending.groups,'[]'),cfg.groups) g),case when pending.email is not null then pending.onboarding_start when cfg.settings->>'newUserStage'='newhire' then current_date else null end) returning * into result;
  delete from public.fb_pending_profiles where email=lower(p_email);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_id,'auth','register',p_id::text,jsonb_build_object('preRegistered',pending.email is not null,'role',result.role));
  return result;
end $$;

create or replace function public.fb_assignment_guard() returns trigger language plpgsql set search_path='' as $$
declare cfg public.fb_config; payload jsonb; rules jsonb; rule jsonb; prior jsonb; gid text; uid text; stamp text; field text;
begin
  select * into cfg from public.fb_config where id for update;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  foreach field in array array['draft','published'] loop
    payload:=case when field='draft' then new.draft else new.published end;
    if payload is null then continue; end if;
    rules:='[]';
    for rule in select * from jsonb_array_elements(coalesce(payload->'assignments',(select coalesce(jsonb_agg(jsonb_build_object('groupId',g,'due',jsonb_build_object('type','none'))),'[]') from jsonb_array_elements_text(coalesce(payload->'groups','[]')) g))) loop
      gid:=rule->>'groupId'; uid:=rule->>'userId';
      if gid is null or uid is not null or rule->'due'->>'type'<>'none' then raise exception 'Required learning uses groups and workspace windows'; end if;
      if (gid is null) = (uid is null) then raise exception 'Choose exactly one assignment recipient'; end if;
      if payload->>'kind'<>'course' then raise exception 'Only courses can be assigned'; end if;
      if gid is not null and not exists(select 1 from jsonb_array_elements(cfg.groups) g where g->>'id'=gid) then raise exception 'Assignment group does not exist'; end if;
      if uid is not null and not exists(select 1 from public.fb_profiles where id::text=uid) then raise exception 'Assignment user does not exist'; end if;
      if exists(select 1 from jsonb_array_elements(rules) r where (gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid)) then raise exception 'Duplicate assignment'; end if;
      if rule->'due'->>'type' not in ('none','date','days') or rule->'due'->>'type' is null then raise exception 'Invalid deadline'; end if;
      if rule->'due'->>'type'='days' and not ((rule->'due'->>'days')::integer between 1 and 3650) then raise exception 'Invalid deadline'; end if;
      if rule->'due'->>'type'='date' then perform (rule->'due'->>'date')::date; end if;
      prior:=null;
      if TG_OP='UPDATE' and old.published->>'version'=payload->>'version' then select r into prior from jsonb_array_elements(coalesce(old.published->'assignments','[]')) r where (gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid); end if;
      rules:=rules||jsonb_build_array(rule||jsonb_build_object('assignedAt',coalesce(prior->>'assignedAt',stamp)));
    end loop;
    payload:=payload||jsonb_build_object('assignments',rules,'groups',(select coalesce(jsonb_agg(r->>'groupId'),'[]') from jsonb_array_elements(rules) r where r->>'groupId' is not null));
    if field='draft' then new.draft:=payload; else new.published:=payload; end if;
  end loop;
  return new;
end $$;

create or replace function public.fb_manage_learning(p_actor uuid,p_data jsonb) returns jsonb language plpgsql set search_path='' as $$
declare d public.fb_documents; p public.fb_progress; before_p jsonb; op text:=p_data->>'operation';
 cid uuid:=(p_data->>'contentId')::uuid; uid uuid:=(p_data->>'userId')::uuid; gid text:=p_data->>'groupId';
 rules jsonb; draft_rules jsonb; rule jsonb; group_ids jsonb;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_documents where id=cid for update;
 if not found or d.published is null or d.published->>'kind'<>'course' then raise exception 'Publish the course before managing assignments'; end if;
 if d.revision<>(p_data->>'expected')::integer then raise exception 'Course changed. Reload before saving'; end if;
 if (uid is null) = (gid is null) then raise exception 'Choose exactly one recipient'; end if;
 if uid is not null and not exists(select 1 from public.fb_profiles where id=uid) then raise exception 'Person does not exist'; end if;
 if op in ('assign','unassign') then
   if gid is null or uid is not null then raise exception 'Required learning belongs to a group'; end if;
   p_data:=p_data||jsonb_build_object('due',jsonb_build_object('type','none'));
   if gid is not null and not exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) g where g->>'id'=gid) then raise exception 'Group does not exist'; end if;
   select coalesce(jsonb_agg(r),'[]') into rules from jsonb_array_elements(coalesce(d.published->'assignments','[]')) r where not ((gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid::text)) is true;
   select coalesce(jsonb_agg(r),'[]') into draft_rules from jsonb_array_elements(coalesce(d.draft->'assignments','[]')) r where not ((gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid::text)) is true;
   if op='assign' then
     rule:=jsonb_strip_nulls(jsonb_build_object('groupId',gid,'userId',uid,'due',p_data->'due'));
     rules:=rules||jsonb_build_array(rule); draft_rules:=draft_rules||jsonb_build_array(rule);
   end if;
   update public.fb_documents set published=jsonb_set(published,'{assignments}',rules),draft=jsonb_set(draft,'{assignments}',draft_rules),revision=revision+1,updated_at=now() where id=cid returning * into d;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','assignment_'||op,cid::text,d.revision,p_data);
 elsif op in ('complete','reset') then
   if uid is null or (d.published->>'version')::integer<>(p_data->>'version')::integer then raise exception 'Course version changed. Reload before saving'; end if;
   -- Insert a placeholder so concurrent first writes and resets share a row lock.
   insert into public.fb_progress(user_id,content_id,version,revision) values(uid,cid,(p_data->>'version')::integer,0) on conflict do nothing;
   select * into p from public.fb_progress where user_id=uid and content_id=cid and version=(p_data->>'version')::integer for update;
   if p.revision is distinct from (p_data->>'progressExpected')::integer then raise exception 'Progress changed. Reload before saving'; end if;
   before_p:=to_jsonb(p);
   update public.fb_progress set lessons=case when op='complete' then (select coalesce(jsonb_agg(l->>'id'),'[]') from jsonb_array_elements(d.published->'lessons') l) else '[]'::jsonb end,
     passed=(op='complete'), attempts=case when op='reset' then '[]'::jsonb else attempts end
     where user_id=uid and content_id=cid and version=p.version returning * into p;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','progress_'||op,cid::text,p.revision,jsonb_build_object('before',before_p,'after',to_jsonb(p)));
 else raise exception 'Unknown learning operation'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.fb_manage_learning from public,anon,authenticated;
grant execute on function public.fb_manage_learning to service_role;

commit;
-- End 202609200003_required_learning.sql

-- Begin 202609200004_learning_groups.sql
begin;
-- Additive upgrade: retain course versions, progress and continuous assignment dates.
alter table public.fb_config add column curricula jsonb not null default '[]';

create function public.fb_member_groups(p_direct jsonb,p_team text,p_nodes jsonb)
returns table(id text) language sql immutable set search_path='' as $$
  select * from public.fb_effective_groups(p_direct ||
    (select coalesce(jsonb_agg(n->>'id'),'[]') from jsonb_array_elements(p_nodes) n where coalesce(n->'teamIds','[]') ? p_team),p_nodes);
$$;

-- Import existing direct assignments in their saved order, including unpublished courses.
update public.fb_config c set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('teamIds','[]'::jsonb,'learningItems',(
  select coalesce(jsonb_agg(jsonb_build_object('kind','course','id',d.id) order by coalesce((select ord from jsonb_array_elements_text(coalesce(g->'requiredCourseIds','[]')) with ordinality a(id,ord) where a.id=d.id::text),999999),coalesce(d.published,d.draft)->>'title'),'[]')
  from public.fb_documents d where coalesce(d.published,d.draft)->>'kind'='course' and exists(select 1 from jsonb_array_elements(coalesce(coalesce(d.published,d.draft)->'assignments','[]')) a where a->>'groupId'=g->>'id')
))),'[]') from jsonb_array_elements(c.groups) g) where id;

create function public.fb_learning_ids(p_items jsonb,p_curricula jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(id order by pos,subpos),'[]') from (
    select distinct on (id) id,pos,subpos from (
      select i->>'id' as id,pos,0::bigint as subpos from jsonb_array_elements(p_items) with ordinality a(i,pos) where i->>'kind'='course'
      union all
      select course,pos,subpos from jsonb_array_elements(p_items) with ordinality a(i,pos),jsonb_array_elements(p_curricula) c,jsonb_array_elements_text(c->'courseIds') with ordinality b(course,subpos) where i->>'kind'='curriculum' and i->>'id'=c->>'id' and c->>'status'='published'
    ) entries order by id,pos,subpos
  ) unique_entries;
$$;

create function public.fb_validate_learning(p_groups jsonb,p_teams jsonb,p_curricula jsonb) returns void
language plpgsql set search_path='' as $$
declare g jsonb; c jsonb; i jsonb;
begin
  perform public.fb_validate_nodes(p_curricula);
  for c in select * from jsonb_array_elements(p_curricula) loop
    if c->>'status' not in ('draft','published') or jsonb_typeof(c->'courseIds') is distinct from 'array' then raise exception 'Invalid curriculum'; end if;
    if c->>'status'='published' and jsonb_array_length(c->'courseIds')=0 then raise exception 'Published curricula need courses'; end if;
    if exists(select 1 from jsonb_array_elements_text(c->'courseIds') x group by x having count(*)>1) then raise exception 'Duplicate curriculum course'; end if;
    if exists(select 1 from jsonb_array_elements_text(c->'courseIds') x where not exists(select 1 from public.fb_documents d where d.id::text=x and d.draft->>'kind'='course')) then raise exception 'Course does not exist'; end if;
  end loop;
  for g in select * from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(g->'learningItems') is distinct from 'array' then raise exception 'Learning items are required. Reload before saving'; end if;
    if exists(select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t where not exists(select 1 from jsonb_array_elements(p_teams) n where n->>'id'=t)) then raise exception 'Team does not exist'; end if;
    if exists(select 1 from jsonb_array_elements(g->'learningItems') x group by x->>'kind',x->>'id' having count(*)>1) then raise exception 'Duplicate learning item'; end if;
    for i in select * from jsonb_array_elements(g->'learningItems') loop
      if i->>'kind'='course' then
        if not exists(select 1 from public.fb_documents d where d.id::text=i->>'id' and d.draft->>'kind'='course') then raise exception 'Course does not exist'; end if;
      elsif i->>'kind'='curriculum' then
        if not exists(select 1 from jsonb_array_elements(p_curricula) playlist where playlist->>'id'=i->>'id' and playlist->>'status'='published') then raise exception 'Choose a published curriculum'; end if;
      else raise exception 'Invalid learning item'; end if;
    end loop;
  end loop;
end $$;

-- Course audiences are derived from group plans; updates retain ordinary audience tags.
create or replace function public.fb_assignment_guard() returns trigger language plpgsql set search_path='' as $$
declare cfg public.fb_config; payload jsonb; rules jsonb; prior jsonb; g jsonb; field text; stamp text;
begin
 select * into cfg from public.fb_config where id for update;
 stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 foreach field in array array['draft','published'] loop
  payload:=case when field='draft' then new.draft else new.published end;
  if payload is null then continue; end if;
  rules:='[]';
  if payload->>'kind'='course' then
   if exists(select 1 from jsonb_array_elements(coalesce(payload->'assignments','[]')) a where a->>'userId' is not null or a->'due'->>'type' is distinct from 'none') then raise exception 'Assigned learning uses groups and organization windows'; end if;
   for g in select n from jsonb_array_elements(cfg.groups) n where coalesce(n->'requiredCourseIds','[]') ? new.id::text loop
    prior:=null;
    if TG_OP='UPDATE' and old.published->>'version'=payload->>'version' then
      select a into prior from jsonb_array_elements(coalesce(old.published->'assignments','[]')) a where a->>'groupId'=g->>'id';
    end if;
    rules:=rules||jsonb_build_array(jsonb_build_object('groupId',g->>'id','assignedAt',coalesce(prior->>'assignedAt',stamp),'due',jsonb_build_object('type','none')));
   end loop;
   payload:=payload||jsonb_build_object('groups',(select coalesce(jsonb_agg(a->>'groupId'),'[]') from jsonb_array_elements(rules) a));
  elsif payload->>'kind'='brief' then
   if exists(select 1 from jsonb_array_elements_text(coalesce(payload->'groups','[]')) gid where not exists(select 1 from jsonb_array_elements(cfg.groups) n where n->>'id'=gid)) then raise exception 'Learning group does not exist'; end if;
  else payload:=payload||jsonb_build_object('groups','[]'::jsonb);
  end if;
  payload:=payload||jsonb_build_object('assignments',rules);
  if field='draft' then new.draft:=payload; else new.published:=payload; end if;
 end loop;
 return new;
end $$;

create function public.fb_sync_learning() returns void language plpgsql set search_path='' as $$
declare cfg public.fb_config; d public.fb_documents; ids jsonb; old_ids jsonb; draft_groups jsonb; pub_groups jsonb;
begin
 update public.fb_config c set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('requiredCourseIds',public.fb_learning_ids(g->'learningItems',c.curricula))),'[]') from jsonb_array_elements(c.groups) g) where id returning * into cfg;
 for d in select * from public.fb_documents loop
  if d.draft->>'kind'='course' then
   select coalesce(jsonb_agg(g->>'id' order by g->>'id'),'[]') into ids from jsonb_array_elements(cfg.groups) g where g->'requiredCourseIds' ? d.id::text;
   select coalesce(jsonb_agg(g order by g),'[]') into old_ids from jsonb_array_elements_text(coalesce(coalesce(d.published,d.draft)->'groups','[]')) g;
   if ids<>old_ids then update public.fb_documents set revision=revision+1 where id=d.id; end if;
  elsif d.draft->>'kind'='brief' then
   select coalesce(jsonb_agg(g),'[]') into draft_groups from jsonb_array_elements_text(coalesce(d.draft->'groups','[]')) g where exists(select 1 from jsonb_array_elements(cfg.groups) n where n->>'id'=g);
   select coalesce(jsonb_agg(g),'[]') into pub_groups from jsonb_array_elements_text(coalesce(d.published->'groups','[]')) g where exists(select 1 from jsonb_array_elements(cfg.groups) n where n->>'id'=g);
   if draft_groups<>coalesce(d.draft->'groups','[]') or pub_groups<>coalesce(d.published->'groups','[]') then
    update public.fb_documents set draft=jsonb_set(draft,'{groups}',draft_groups),published=case when published is null then null else jsonb_set(published,'{groups}',pub_groups) end,revision=revision+1 where id=d.id;
   end if;
  end if;
 end loop;
end $$;
select public.fb_sync_learning();
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    if exists(select 1 from public.fb_profiles where lower(email)=lower(p_data->>'email')) then raise exception 'An account already uses that email'; end if;
    if coalesce((p_data->>'revoke')::boolean,false) then
      delete from public.fb_pending_profiles where email=lower(trim(p_data->>'email'));
    else
      if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
      insert into public.fb_pending_profiles(email,name,role,groups,team_id,onboarding_start)
      values(lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'onboardingStart')::date)
      on conflict(email) do update set name=excluded.name,role=excluded.role,groups=excluded.groups,team_id=excluded.team_id,onboarding_start=excluded.onboarding_start;
    end if;
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Deleting a learning group removes only its membership/assignment source.
    -- Team deletion stays outside this operation.
    if exists(select 1 from jsonb_array_elements(cfg.teams) t where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id')) then raise exception 'Teams cannot be deleted here'; end if;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_groups(u->'groups',u->>'teamId',p_data->'groups') g;
      update public.fb_profiles set onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin') then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    update public.fb_pending_profiles p set groups=(select coalesce(jsonb_agg(g),'[]') from jsonb_array_elements_text(p.groups) g where exists(select 1 from jsonb_array_elements(p_data->'groups') node where node->>'id'=g));
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

create or replace function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns public.fb_profiles language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; pending public.fb_pending_profiles; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  select * into result from public.fb_profiles where id=p_id;
  if found then return result; end if;
  select * into pending from public.fb_pending_profiles where email=lower(p_email);
  if pending.email is null and not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
  if exists(select 1 from public.fb_profiles where lower(email)=lower(p_email)) then raise exception 'Email is already linked to an account'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into public.fb_profiles(id,email,name,role,groups,team_id,group_joined_at,effective_group_joined_at,onboarding_start)
  values(p_id,p_email,coalesce(pending.name,p_name),case when p_owner then 'admin' else coalesce(pending.role,'learner') end,
    coalesce(pending.groups,'[]'),pending.team_id,
    (select coalesce(jsonb_object_agg(g,stamp),'{}') from jsonb_array_elements_text(coalesce(pending.groups,'[]')) g),
    (select coalesce(jsonb_object_agg(g.id,stamp),'{}') from public.fb_member_groups(coalesce(pending.groups,'[]'),pending.team_id,cfg.groups) g),case when pending.email is not null then pending.onboarding_start when cfg.settings->>'newUserStage'='newhire' then current_date else null end) returning * into result;
  delete from public.fb_pending_profiles where email=lower(p_email);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_id,'auth','register',p_id::text,jsonb_build_object('preRegistered',pending.email is not null,'role',result.role));
  return result;
end $$;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role='manager' and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.id=me.id or me.role='admin' or (me.role='manager' and p.active and p.team_id in(select id from allowed))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending',case when exists(select 1 from me where role='admin') then coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_pending_profiles p),'[]') else '[]'::jsonb end
);
$$;

create or replace function public.fb_manage_learning(p_actor uuid,p_data jsonb) returns jsonb language plpgsql set search_path='' as $$
declare d public.fb_documents; p public.fb_progress; before_p jsonb; op text:=p_data->>'operation';
 cid uuid:=(p_data->>'contentId')::uuid; uid uuid:=(p_data->>'userId')::uuid; gid text:=p_data->>'groupId';
 rules jsonb; draft_rules jsonb; rule jsonb; group_ids jsonb;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_documents where id=cid for update;
 if not found or d.published is null or (d.published->>'kind'<>'course' and op not in ('target','untarget')) then raise exception 'Publish the course before managing assignments'; end if;
 if d.revision<>(p_data->>'expected')::integer then raise exception 'Course changed. Reload before saving'; end if;
 if (uid is null) = (gid is null) then raise exception 'Choose exactly one recipient'; end if;
 if uid is not null and not exists(select 1 from public.fb_profiles where id=uid) then raise exception 'Person does not exist'; end if;
 if op in ('target','untarget') then
   if gid is null or uid is not null or d.published->>'kind'<>'brief' then raise exception 'Choose an update and a learning group'; end if;
   if not exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) g where g->>'id'=gid) then raise exception 'Group does not exist'; end if;
   select coalesce(jsonb_agg(g),'[]') into group_ids from jsonb_array_elements_text(coalesce(d.published->'groups','[]')) g where g<>gid;
   if op='target' then group_ids:=group_ids||jsonb_build_array(gid); end if;
   select coalesce(jsonb_agg(g),'[]') into draft_rules from jsonb_array_elements_text(coalesce(d.draft->'groups','[]')) g where g<>gid;
   if op='target' then draft_rules:=draft_rules||jsonb_build_array(gid); end if;
   update public.fb_documents set published=jsonb_set(published,'{groups}',group_ids),draft=jsonb_set(draft,'{groups}',draft_rules),revision=revision+1 where id=cid returning * into d;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','update_'||op,cid::text,d.revision,p_data);
 elsif op in ('assign','unassign') then
   if gid is null or uid is not null then raise exception 'Assigned learning belongs to a group'; end if;
   if not exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) g where g->>'id'=gid) then raise exception 'Group does not exist'; end if;
   select coalesce(jsonb_agg(i),'[]') into rules from public.fb_config c,jsonb_array_elements(c.groups) g,jsonb_array_elements(g->'learningItems') i where g->>'id'=gid and not (i->>'kind'='course' and i->>'id'=cid::text);
   if op='assign' then rules:=rules||jsonb_build_array(jsonb_build_object('kind','course','id',cid)); end if;
   update public.fb_config c set groups=(select jsonb_agg(case when g->>'id'=gid then g||jsonb_build_object('learningItems',rules) else g end) from jsonb_array_elements(c.groups) g),governance_revision=governance_revision+1 where id;
   perform public.fb_sync_learning();
   insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_actor,'web','assignment_'||op,cid::text,p_data);
 elsif op in ('complete','reset') then
   if uid is null or (d.published->>'version')::integer<>(p_data->>'version')::integer then raise exception 'Course version changed. Reload before saving'; end if;
   -- Insert a placeholder so concurrent first writes and resets share a row lock.
   insert into public.fb_progress(user_id,content_id,version,revision) values(uid,cid,(p_data->>'version')::integer,0) on conflict do nothing;
   select * into p from public.fb_progress where user_id=uid and content_id=cid and version=(p_data->>'version')::integer for update;
   if p.revision is distinct from (p_data->>'progressExpected')::integer then raise exception 'Progress changed. Reload before saving'; end if;
   before_p:=to_jsonb(p);
   update public.fb_progress set lessons=case when op='complete' then (select coalesce(jsonb_agg(l->>'id'),'[]') from jsonb_array_elements(d.published->'lessons') l) else '[]'::jsonb end,
     passed=(op='complete'), attempts=case when op='reset' then '[]'::jsonb else attempts end
     where user_id=uid and content_id=cid and version=p.version returning * into p;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','progress_'||op,cid::text,p.revision,jsonb_build_object('before',before_p,'after',to_jsonb(p)));
 else raise exception 'Unknown learning operation'; end if;
 return jsonb_build_object('ok',true);
end $$;

do $$ declare f text; begin
 foreach f in array array['fb_member_groups','fb_learning_ids','fb_validate_learning','fb_sync_learning','fb_save_governance','fb_register_profile','fb_governance_snapshot','fb_assignment_guard','fb_manage_learning'] loop
  execute format('revoke all on function public.%I from public,anon,authenticated',f);
  execute format('grant execute on function public.%I to service_role',f);
 end loop;
end $$;
commit;
-- End 202609200004_learning_groups.sql

-- Begin 20260921205449_published_search.sql
-- Derived only from published snapshots. No client grants: the application
-- checks installation access and verified active accounts before retrieval.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
grant usage on schema extensions to service_role;
create table public.fb_search_passages (
  content_id uuid not null references public.fb_documents(id) on delete cascade,
  passage_id text not null,
  kind text not null check (kind in ('brief','doc','course')),
  title text not null, lesson_id text, lesson_title text,
  source_text text not null, published_revision integer,
  content_date text,
  search_vector tsvector not null,
  title_vector tsvector not null, lesson_vector tsvector not null,
  primary key(content_id, passage_id)
);
alter table public.fb_search_passages enable row level security;
revoke all on public.fb_search_passages from public, anon, authenticated;
grant all on public.fb_search_passages to service_role;
create index fb_search_vector_idx on public.fb_search_passages using gin(search_vector);
-- Internal vocabulary is only used to correct query terms, never returned.
-- Historical words may remain after deletion; only current indexed passages match.
create table public.fb_search_words(word text primary key);
alter table public.fb_search_words enable row level security;
revoke all on public.fb_search_words from public,anon,authenticated;
grant all on public.fb_search_words to service_role;
-- Supabase normally installs extensions in extensions; also accept an existing
-- pg_trgm in public without relocating an operator-owned extension.
do $$ declare extension_schema text; begin
  select n.nspname into extension_schema from pg_extension e
    join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
  if extension_schema not in ('public','extensions') then
    raise exception 'pg_trgm must be installed in public or extensions';
  end if;
  execute format('create index fb_search_words_typo_idx on public.fb_search_words using gin(word %I.gin_trgm_ops)',extension_schema);
end $$;

create function public.fb_index_published() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare p jsonb; part record; heading text; body text;
begin
  if TG_OP = 'UPDATE' and new.published is not distinct from old.published
     and new.published_revision is not distinct from old.published_revision then return new; end if;
  delete from public.fb_search_passages where content_id=new.id;
  p := new.published;
  if p is null or p->>'kind' not in ('brief','doc','course') then return new; end if;
  for part in
    select 'content' as id, null::text as lesson_id, null::text as lesson_title,
      concat_ws(E'\n',p->>'summary',p->>'body') as body
    union all
    select 'lesson:'||(l->>'id'), l->>'id', l->>'title', coalesce(l->>'body','')
    from jsonb_array_elements(case when p->>'kind'='course' then coalesce(p->'lessons','[]') else '[]'::jsonb end) l
  loop
    heading := coalesce(part.lesson_title,'');
    body := coalesce(part.body,'');
    insert into public.fb_search_passages values (
      new.id,part.id,p->>'kind',coalesce(p->>'title',''),part.lesson_id,part.lesson_title,
      body,new.published_revision,coalesce(nullif(p->>'updatedAt',''),nullif(p->>'createdAt','')),
      setweight(to_tsvector('simple',coalesce(p->>'title','')),'A') ||
      setweight(to_tsvector('simple',heading),'B') ||
      setweight(to_tsvector('simple',body),'C'),
      to_tsvector('simple',coalesce(p->>'title','')),to_tsvector('simple',heading)
    );
    insert into public.fb_search_words
      select unnest(tsvector_to_array(to_tsvector('simple',concat_ws(' ',p->>'title',heading,body))))
      on conflict do nothing;
  end loop;
  return new;
end $$;
revoke all on function public.fb_index_published() from public,anon,authenticated;
create trigger fb_index_published after insert or update of published,published_revision
on public.fb_documents for each row execute function public.fb_index_published();
-- A fresh installation has no published documents to backfill.

create function public.fb_search(p_query text, p_kind text default 'all', p_limit integer default 31)
returns jsonb
language plpgsql stable set search_path = public, extensions, pg_temp
set pg_trgm.similarity_threshold = '0.3' as $$
declare q tsquery; exact_q tsquery; normalized text; terms text[]; term text;
  alternatives text; expression text := ''; candidate text; highlight_terms text[];
begin
  if length(p_query)>160 or p_kind not in ('all','brief','doc','course') then
    raise exception 'Invalid search input'; end if;
  select array_agg(m[1]) into terms from regexp_matches(lower(p_query),'[[:alnum:]]+','g') m;
  if coalesce(array_length(terms,1),0)=0 then return '[]'::jsonb; end if;
  if array_length(terms,1)>12 then raise exception 'Too many search terms'; end if;
  normalized := array_to_string(terms,' ');
  highlight_terms := terms;
  select to_tsquery('simple',string_agg(quote_literal(t)||':*',' & ')) into exact_q from unnest(terms) t;
  foreach term in array terms loop
    alternatives := quote_literal(term)||':*';
    -- Preserve exact words. Correct unknown words of at least four characters.
    if length(term)>=4 and not exists(select 1 from public.fb_search_words w where w.word=term) then
      for candidate in select w.word from public.fb_search_words w
        where w.word % term and abs(length(w.word)-length(term))<=2
        order by similarity(w.word,term) desc,w.word limit 2
      loop
        alternatives := alternatives || ' | ' || quote_literal(candidate);
        highlight_terms := array_append(highlight_terms,candidate);
      end loop;
    end if;
    expression := expression || case when expression='' then '' else ' & ' end || '('||alternatives||')';
  end loop;
  q := to_tsquery('simple',expression);
  return (
  with candidates as (
    select s.content_id,s.passage_id,s.kind,s.content_date, (
      case when lower(s.title)=normalized then 100 else 0 end +
      case when s.title_vector @@ exact_q then 30
           when s.title_vector @@ q then 20 else 0 end +
      case when s.lesson_vector @@ q then 15 else 0 end +
      case when s.search_vector @@ exact_q then 10 else 0 end + ts_rank(s.search_vector,q)
    )::real as rank
    from public.fb_search_passages s
    where (p_kind='all' or s.kind=p_kind) and s.search_vector @@ q
  ), best as (
    select distinct on (c.content_id) c.* from candidates c
    order by c.content_id,c.rank desc,c.passage_id
  )
  , limited as (
    select b.content_id,b.passage_id,b.rank, row_number() over (order by b.rank desc,
      case when b.kind='brief' and b.content_date ~ '^\d{4}-\d{2}-\d{2}T' then b.content_date end desc nulls last, b.content_id) as result_order from best b order by b.rank desc,
      case when b.kind='brief' and b.content_date ~ '^\d{4}-\d{2}-\d{2}T' then b.content_date end desc nulls last,
      b.content_id limit greatest(1,least(p_limit,31))
  ), results as (
    select s.content_id,s.passage_id,s.kind,s.title,s.lesson_id,s.lesson_title,
      s.source_text,s.published_revision,s.content_date,l.rank as score,
      highlight_terms as matched_terms,
      l.result_order
    from limited l join public.fb_search_passages s using(content_id,passage_id)
  ) select coalesce(jsonb_agg(to_jsonb(results)-'result_order' order by result_order), '[]'::jsonb) from results);

end $$;
revoke all on function public.fb_search(text,text,integer) from public,anon,authenticated;
grant execute on function public.fb_search(text,text,integer) to service_role;
-- End 20260921205449_published_search.sql

-- Begin 20260923180607_guarded_team_deletion.sql
-- Allow only empty, unreferenced team deletion. Existing authorization, revision
-- checks, transaction lock, audit and function privileges are retained.
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    if exists(select 1 from public.fb_profiles where lower(email)=lower(p_data->>'email')) then raise exception 'An account already uses that email'; end if;
    if coalesce((p_data->>'revoke')::boolean,false) then
      delete from public.fb_pending_profiles where email=lower(trim(p_data->>'email'));
    else
      if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
      insert into public.fb_pending_profiles(email,name,role,groups,team_id,onboarding_start)
      values(lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'onboardingStart')::date)
      on conflict(email) do update set name=excluded.name,role=excluded.role,groups=excluded.groups,team_id=excluded.team_id,onboarding_start=excluded.onboarding_start;
    end if;
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from public.fb_pending_profiles where team_id=n->>'id') then
        raise exception 'Remove pending account team assignments before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_groups(u->'groups',u->>'teamId',p_data->'groups') g;
      update public.fb_profiles set onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin') then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    update public.fb_pending_profiles p set groups=(select coalesce(jsonb_agg(g),'[]') from jsonb_array_elements_text(p.groups) g where exists(select 1 from jsonb_array_elements(p_data->'groups') node where node->>'id'=g));
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;
-- End 20260923180607_guarded_team_deletion.sql

-- Begin 20260923230000_scope_pending_group_cleanup.sql
-- Keep pending-account cleanup scoped to rows affected by removed groups.
-- This also permits governance saves on installations with safeupdate enabled.
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    if exists(select 1 from public.fb_profiles where lower(email)=lower(p_data->>'email')) then raise exception 'An account already uses that email'; end if;
    if coalesce((p_data->>'revoke')::boolean,false) then
      delete from public.fb_pending_profiles where email=lower(trim(p_data->>'email'));
    else
      if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
      insert into public.fb_pending_profiles(email,name,role,groups,team_id,onboarding_start)
      values(lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'onboardingStart')::date)
      on conflict(email) do update set name=excluded.name,role=excluded.role,groups=excluded.groups,team_id=excluded.team_id,onboarding_start=excluded.onboarding_start;
    end if;
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from public.fb_pending_profiles where team_id=n->>'id') then
        raise exception 'Remove pending account team assignments before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_groups(u->'groups',u->>'teamId',p_data->'groups') g;
      update public.fb_profiles set onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin') then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    update public.fb_pending_profiles p set groups=(select coalesce(jsonb_agg(g),'[]') from jsonb_array_elements_text(p.groups) g where exists(select 1 from jsonb_array_elements(p_data->'groups') node where node->>'id'=g))
    where exists(select 1 from jsonb_array_elements_text(p.groups) g where not exists(select 1 from jsonb_array_elements(p_data->'groups') node where node->>'id'=g));
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;
-- End 20260923230000_scope_pending_group_cleanup.sql

-- Begin 20260924150351_anonymous_feedback.sql
-- Allow guest feedback without creating an account.
-- The server stores only a hash of its random, HttpOnly browser token.
alter table public.fb_feedback alter column user_id drop not null;
alter table public.fb_feedback add column guest_key text;
alter table public.fb_feedback add constraint fb_feedback_one_author check (
  (user_id is not null) <> (guest_key is not null)
);
alter table public.fb_feedback add constraint fb_feedback_guest_key_format check (
  guest_key is null or guest_key ~ '^[0-9a-f]{64}$'
);

revoke all on public.fb_feedback from anon, authenticated;
-- End 20260924150351_anonymous_feedback.sql

-- Begin 20260926182840_general_feedback.sql
-- General account-menu feedback has no content item or version.
-- Each submission has its own ID, including content and general feedback.
alter table public.fb_feedback alter column content_id drop not null;
alter table public.fb_feedback alter column version drop not null;
alter table public.fb_feedback add constraint fb_feedback_content_pair check (
  (content_id is null and version is null) or
  (content_id is not null and version is not null)
);
-- End 20260926182840_general_feedback.sql

-- Begin 20260927150657_bulk_actions_recovery.sql
-- Recoverable content/account deletion. Only server-side service-role callers have access.
begin;
alter table public.fb_documents add column deleted_at timestamptz;
alter table public.fb_profiles add column deleted_at timestamptz;
create table public.fb_deleted_items (
  entity text not null check(entity in ('content','user')), id uuid not null,
  name text not null, email text, kind text, revision integer not null,
  deleted_at timestamptz not null default now(), purge_after timestamptz not null default now()+interval '30 days',
  deleted_by uuid not null, snapshot jsonb not null,
  purging boolean not null default false, claimed_at timestamptz, claim uuid, error text,
  primary key(entity,id), check(purge_after>=deleted_at+interval '30 days')
);
create index fb_deleted_due on public.fb_deleted_items(purge_after,claimed_at);
create index fb_deleted_email on public.fb_deleted_items(lower(email)) where email is not null;
create table public.fb_cleanup_config (id boolean primary key default true check(id), endpoint text, secret text not null default encode(extensions.gen_random_bytes(32),'hex'), last_run timestamptz);
alter table public.fb_deleted_items enable row level security;
alter table public.fb_cleanup_config enable row level security;
revoke all on public.fb_deleted_items,public.fb_cleanup_config from public,anon,authenticated;
grant all on public.fb_deleted_items,public.fb_cleanup_config to service_role;
insert into public.fb_cleanup_config(id) values(true);

create or replace function public.fb_save_document(p_id uuid, p_expected integer, p_draft jsonb, p_publish boolean, p_unpublish boolean, p_actor uuid, p_source text)
returns public.fb_documents language plpgsql set search_path = '' as $$
declare d public.fb_documents;
begin
  perform 1 from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
  if p_expected = 0 then
    insert into public.fb_documents(id,draft) values(p_id,p_draft) on conflict do nothing;
    if not found then raise exception 'Revision conflict'; end if;
    select * into d from public.fb_documents where id=p_id for update;
  else
    select * into d from public.fb_documents where id=p_id for update;
    if d.deleted_at is not null then raise exception 'Content is in Recently deleted'; end if;
    if not found or d.revision <> p_expected then raise exception 'Revision conflict'; end if;
    update public.fb_documents set draft=p_draft,revision=revision+1,updated_at=now() where id=p_id returning * into d;
  end if;
  if p_publish then
    update public.fb_documents set published=p_draft,published_revision=d.revision where id=p_id returning * into d;
  elsif p_unpublish then
    update public.fb_documents set published=null,published_revision=null where id=p_id returning * into d;
  end if;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot)
    values(p_actor,p_source,case when p_publish then 'publish' when p_unpublish then 'unpublish' else 'save_draft' end,p_id::text,d.revision,d.draft);
  return d;
end $$;
revoke all on function public.fb_save_document from public,anon,authenticated;
grant execute on function public.fb_save_document to service_role;


create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    if exists(select 1 from public.fb_profiles where lower(email)=lower(p_data->>'email')) then raise exception 'An account already uses that email'; end if;
    if coalesce((p_data->>'revoke')::boolean,false) then
      delete from public.fb_pending_profiles where email=lower(trim(p_data->>'email'));
    else
      if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
      insert into public.fb_pending_profiles(email,name,role,groups,team_id,onboarding_start)
      values(lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'onboardingStart')::date)
      on conflict(email) do update set name=excluded.name,role=excluded.role,groups=excluded.groups,team_id=excluded.team_id,onboarding_start=excluded.onboarding_start;
    end if;
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from public.fb_pending_profiles where team_id=n->>'id') then
        raise exception 'Remove pending account team assignments before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_groups(u->'groups',u->>'teamId',p_data->'groups') g;
      update public.fb_profiles set onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin') then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    update public.fb_pending_profiles p set groups=(select coalesce(jsonb_agg(g),'[]') from jsonb_array_elements_text(p.groups) g where exists(select 1 from jsonb_array_elements(p_data->'groups') node where node->>'id'=g))
    where exists(select 1 from jsonb_array_elements_text(p.groups) g where not exists(select 1 from jsonb_array_elements(p_data->'groups') node where node->>'id'=g));
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

create or replace function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns public.fb_profiles language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; pending public.fb_pending_profiles; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if exists(select 1 from public.fb_deleted_items where entity='user' and (id=p_id or lower(email)=lower(p_email))) then raise exception 'Account is pending deletion'; end if;
  select * into result from public.fb_profiles where id=p_id;
  if found then return result; end if;
  select * into pending from public.fb_pending_profiles where email=lower(p_email);
  if pending.email is null and not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
  if exists(select 1 from public.fb_profiles where lower(email)=lower(p_email)) then raise exception 'Email is already linked to an account'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into public.fb_profiles(id,email,name,role,groups,team_id,group_joined_at,effective_group_joined_at,onboarding_start)
  values(p_id,p_email,coalesce(pending.name,p_name),case when p_owner then 'admin' else coalesce(pending.role,'learner') end,
    coalesce(pending.groups,'[]'),pending.team_id,
    (select coalesce(jsonb_object_agg(g,stamp),'{}') from jsonb_array_elements_text(coalesce(pending.groups,'[]')) g),
    (select coalesce(jsonb_object_agg(g.id,stamp),'{}') from public.fb_member_groups(coalesce(pending.groups,'[]'),pending.team_id,cfg.groups) g),case when pending.email is not null then pending.onboarding_start when cfg.settings->>'newUserStage'='newhire' then current_date else null end) returning * into result;
  delete from public.fb_pending_profiles where email=lower(p_email);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_id,'auth','register',p_id::text,jsonb_build_object('preRegistered',pending.email is not null,'role',result.role));
  return result;
end $$;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role='manager' and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role='manager' and p.active and p.team_id in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending',case when exists(select 1 from me where role='admin') then coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_pending_profiles p),'[]') else '[]'::jsonb end
);
$$;


create function public.fb_bulk_content(p_actor uuid,p_id uuid,p_expected integer,p_operation text,p_patch jsonb default '{}',p_settings_expected integer default null) returns text
language plpgsql set search_path='' as $$
declare d public.fb_documents; cfg public.fb_config; old_live integer;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_documents where id=p_id for update;
 if not found then raise exception 'Content not found'; end if;
 if d.deleted_at is not null then
  if p_operation='delete' then return 'unchanged'; end if;
  raise exception 'Content is in Recently deleted';
 end if;
 if d.revision<>p_expected then raise exception 'Revision conflict'; end if;
 if p_operation='delete' then
  insert into public.fb_deleted_items(entity,id,name,kind,revision,deleted_by,snapshot) values('content',d.id,d.draft->>'title',d.draft->>'kind',d.revision+1,p_actor,to_jsonb(d));
  update public.fb_documents set deleted_at=now(),draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 elsif p_operation='metadata' then
  if cfg.revision is distinct from p_settings_expected then raise exception 'Settings changed. Reload before moving content'; end if;
  if p_patch-'category'-'folder'-'sectionId'<>'{}'::jsonb or not p_patch ? 'category' then raise exception 'Invalid metadata patch'; end if;
  if d.draft @> p_patch and (d.published is null or d.published @> p_patch) then return 'unchanged'; end if;
  update public.fb_documents set draft=draft||p_patch,published=case when published is null then null else published||p_patch end,
   published_revision=case when published_revision=revision then revision+1 else published_revision end,revision=revision+1 where id=p_id;
 elsif p_operation='unpublish' then
  if d.published is null then return 'unchanged'; end if;
  update public.fb_documents set draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 else raise exception 'Unsupported content action'; end if;
 insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','bulk_'||p_operation,p_id::text,d.revision+1,p_patch);
 return 'changed';
end $$;

create function public.fb_delete_users(p_actor uuid,p_expected integer,p_ids jsonb,p_owner text) returns jsonb
language plpgsql set search_path='' as $$
declare cfg public.fb_config; u public.fb_profiles; uid uuid; results jsonb:='[]'; changed boolean:=false;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
 for uid in select value::uuid from jsonb_array_elements_text(p_ids) loop
  begin
   select * into u from public.fb_profiles where id=uid for update;
   if not found then raise exception 'Account not found'; end if;
   if u.deleted_at is not null then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','unchanged')); continue; end if;
   if uid=p_actor then raise exception 'You cannot delete your own account'; end if;
   if lower(u.email)=lower(p_owner) then raise exception 'The installation owner cannot be deleted'; end if;
   if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'managerId'=uid::text) then raise exception 'Reassign this person''s managed teams first'; end if;
   if u.role='admin' and not exists(select 1 from public.fb_profiles where id<>uid and active and role='admin') then raise exception 'Keep an active administrator'; end if;
   insert into public.fb_deleted_items(entity,id,name,email,revision,deleted_by,snapshot) values('user',uid,u.name,u.email,1,p_actor,to_jsonb(u));
   update public.fb_profiles set active=false,deleted_at=now(),groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=uid;
   update public.fb_mcp_grants set enabled=false where user_id=uid;
   delete from public.fb_pending_profiles where lower(email)=lower(u.email);
   insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','delete_user',uid::text);
   results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','changed')); changed:=true;
  exception when raise_exception then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','failed','message',sqlerrm)); end;
 end loop;
 if changed then update public.fb_config set governance_revision=governance_revision+1 where id; end if;
 return results;
end $$;

create function public.fb_restore_deleted(p_actor uuid,p_entity text,p_id uuid,p_expected integer) returns text
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id for update;
 if not found then raise exception 'Deleted item not found'; end if;
 if d.purging or d.purge_after<=clock_timestamp() then raise exception 'The recovery window has ended'; end if;
 if d.revision<>p_expected then raise exception 'Revision conflict'; end if;
 if p_entity='content' then
  update public.fb_documents set deleted_at=null,revision=revision+1,draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null where id=p_id;
 else
  update public.fb_profiles set deleted_at=null,active=false,role='learner',groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=p_id;
  update public.fb_config set governance_revision=governance_revision+1 where id;
 end if;
 delete from public.fb_deleted_items where entity=p_entity and id=p_id;
 insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','restore_'||p_entity,p_id::text);
 return 'changed';
end $$;

-- A durable claim serializes restore versus purge. Failed jobs retain a retryable tombstone.
create function public.fb_claim_deletions(p_secret text) returns setof public.fb_deleted_items
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.fb_cleanup_config where secret=p_secret) then raise exception 'Invalid worker credential'; end if;
 perform 1 from public.fb_config where id for update;
 update public.fb_cleanup_config set last_run=now() where id;
 return query update public.fb_deleted_items set purging=true,claimed_at=now(),claim=gen_random_uuid(),error=null
 where (entity,id) in (select entity,id from public.fb_deleted_items where purge_after<=now() and (claimed_at is null or claimed_at<now()-interval '15 minutes') order by purge_after limit 20 for update skip locked) returning *;
end $$;

create function public.fb_finish_deletion(p_entity text,p_id uuid,p_claim uuid) returns void
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items; cfg public.fb_config;
begin
 select * into cfg from public.fb_config where id for update;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim and purging and purge_after<=now() for update;
 if not found then raise exception 'Deletion claim expired'; end if;
 insert into public.fb_media_cleanup(id) select m.id from public.fb_media m where (p_entity='user' and m.owner=p_id) or d.snapshot::text like '%/api/media/'||m.id::text||'.%' or exists(select 1 from public.fb_audit a where a.entity_id=p_id::text and a.snapshot::text like '%/api/media/'||m.id::text||'.%') on conflict do nothing;
 if p_entity='user' then update public.fb_media set owner='00000000-0000-0000-0000-000000000000' where owner=p_id; end if;
 if p_entity='content' then
  delete from public.fb_progress where content_id=p_id;
  delete from public.fb_feedback where content_id=p_id;
  update public.fb_config set curricula=(select coalesce(jsonb_agg(c||jsonb_build_object('courseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(c->'courseIds') x where x#>>'{}'<>p_id::text),'[]'),'status',case when c->'courseIds'=jsonb_build_array(p_id::text) then 'draft' else c->>'status' end)),'[]') from jsonb_array_elements(curricula) c),
    groups=(select coalesce(jsonb_agg(g||jsonb_build_object('requiredCourseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'requiredCourseIds','[]')) x where x#>>'{}'<>p_id::text),'[]'),'learningItems',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'learningItems','[]')) x where not(x->>'kind'='course' and x->>'id'=p_id::text)),'[]'))),'[]') from jsonb_array_elements(groups) g),governance_revision=governance_revision+1 where id;
  delete from public.fb_documents where id=p_id and deleted_at is not null;
  delete from public.fb_audit where entity_id=p_id::text;
 else
  -- Auth deletion happens first through the supported Admin API. The profile and learner records cascade.
  if exists(select 1 from public.fb_profiles where id=p_id) then raise exception 'Delete the Auth account before finalizing'; end if;
  update public.fb_deleted_items set deleted_by='00000000-0000-0000-0000-000000000000' where deleted_by=p_id;
  update public.fb_audit set actor='00000000-0000-0000-0000-000000000000',snapshot=null where actor=p_id;
  delete from public.fb_audit where entity_id=p_id::text;
 end if;
 -- Historical full governance snapshots can contain the erased user's identity or content references.
 update public.fb_audit set snapshot=null where snapshot is not null and (snapshot::text like '%'||p_id::text||'%' or (d.email is not null and lower(snapshot::text) like '%'||lower(d.email)||'%'));
 delete from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim;
end $$;

do $$ declare f text; begin
 foreach f in array array['fb_bulk_content','fb_delete_users','fb_restore_deleted','fb_claim_deletions','fb_finish_deletion'] loop
 execute format('revoke all on function public.%I from public,anon,authenticated',f);
 execute format('grant execute on function public.%I to service_role',f);
 end loop;
end $$;
-- Only assets belonging to purged records become cleanup candidates.
create table public.fb_media_cleanup (id uuid primary key, queued_at timestamptz not null default now());
alter table public.fb_media_cleanup enable row level security;
revoke all on public.fb_media_cleanup from public,anon,authenticated;
grant all on public.fb_media_cleanup to service_role;
create function public.fb_collect_deleted_media() returns table(id uuid,path text)
language plpgsql set search_path='' as $$
begin
 perform 1 from public.fb_config where id for update;
 -- Mark unusable before returning paths. Save triggers below prevent a race with new references.
 return query update public.fb_media m set ready=false where m.id in(select q.id from public.fb_media_cleanup q)
 and not exists(select 1 from public.fb_documents d where (d.draft::text||coalesce(d.published::text,'')) like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_deleted_items d where d.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_audit a where a.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_config c where c.settings::text like '%/api/media/'||m.id::text||'.%')
 returning m.id,m.path;
end $$;
create function public.fb_guard_retired_media() returns trigger
language plpgsql set search_path='' as $$
begin
 perform 1 from public.fb_config where id for update;
 if exists(select 1 from public.fb_media m join public.fb_media_cleanup q on q.id=m.id where not m.ready and to_jsonb(new)::text like '%/api/media/'||m.id::text||'.%') then raise exception 'This media has been permanently deleted'; end if;
 return new;
end $$;
create trigger fb_guard_retired_media before insert or update on public.fb_documents for each row execute function public.fb_guard_retired_media();
create trigger fb_guard_retired_settings_media before update of settings on public.fb_config for each row execute function public.fb_guard_retired_media();
revoke all on function public.fb_collect_deleted_media,public.fb_guard_retired_media from public,anon,authenticated;
grant execute on function public.fb_collect_deleted_media to service_role;

commit;
-- End 20260927150657_bulk_actions_recovery.sql

-- Begin 20260927151228_deletion_schedule.sql
-- Configure fb_cleanup_config.endpoint after deploying the worker to this database's installation.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('fieldbook-purge-deleted','17 * * * *',$job$
  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) from public.fb_cleanup_config where id and endpoint is not null;
$job$);
-- End 20260927151228_deletion_schedule.sql

-- Begin 20260927151533_bulk_recovery_references.sql
begin;
create or replace function public.fb_bulk_content(p_actor uuid,p_id uuid,p_expected integer,p_operation text,p_patch jsonb default '{}',p_settings_expected integer default null) returns text
language plpgsql set search_path='' as $$
declare d public.fb_documents; cfg public.fb_config; old_live integer;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_documents where id=p_id for update;
 if not found then raise exception 'Content not found'; end if;
 if d.deleted_at is not null then
  if p_operation='delete' then return 'unchanged'; end if;
  raise exception 'Content is in Recently deleted';
 end if;
 if d.revision<>p_expected then raise exception 'Revision conflict'; end if;
 if p_operation='delete' then
  insert into public.fb_deleted_items(entity,id,name,kind,revision,deleted_by,snapshot) values('content',d.id,d.draft->>'title',d.draft->>'kind',d.revision+1,p_actor,to_jsonb(d));
  update public.fb_documents set deleted_at=now(),draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 elsif p_operation='metadata' then
  if cfg.revision is distinct from p_settings_expected then raise exception 'Settings changed. Reload before moving content'; end if;
  if p_patch-'category'-'folder'-'sectionId'<>'{}'::jsonb or not p_patch ? 'category' then raise exception 'Invalid metadata patch'; end if;
  if d.draft @> p_patch and (d.published is null or d.published @> p_patch) then return 'unchanged'; end if;
  if p_patch ? 'sectionId' then
   p_patch:=p_patch||jsonb_build_object('sectionOrder',1+(select coalesce(max(coalesce((v->>'sectionOrder')::integer,0)),0) from public.fb_documents x cross join lateral (values(x.draft),(x.published)) copies(v) where v->>'sectionId'=p_patch->>'sectionId'));
  end if;
  update public.fb_documents set draft=draft||p_patch,published=case when published is null then null else published||p_patch end,
   published_revision=case when published_revision=revision then revision+1 else published_revision end,revision=revision+1 where id=p_id;
 elsif p_operation='unpublish' then
  if d.published is null then return 'unchanged'; end if;
  update public.fb_documents set draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 else raise exception 'Unsupported content action'; end if;
 insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','bulk_'||p_operation,p_id::text,d.revision+1,p_patch);
 return 'changed';
end $$;

create or replace function public.fb_finish_deletion(p_entity text,p_id uuid,p_claim uuid) returns void
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items; cfg public.fb_config;
begin
 select * into cfg from public.fb_config where id for update;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim and purging and purge_after<=now() for update;
 if not found then raise exception 'Deletion claim expired'; end if;
 insert into public.fb_media_cleanup(id) select m.id from public.fb_media m where (p_entity='user' and m.owner=p_id) or d.snapshot::text like '%/api/media/'||m.id::text||'.%' or exists(select 1 from public.fb_audit a where a.entity_id=p_id::text and a.snapshot::text like '%/api/media/'||m.id::text||'.%') on conflict do nothing;
 if p_entity='user' then update public.fb_media set owner='00000000-0000-0000-0000-000000000000' where owner=p_id; end if;
 if p_entity='content' then
  delete from public.fb_progress where content_id=p_id;
  delete from public.fb_feedback where content_id=p_id;
  update public.fb_config set curricula=(select coalesce(jsonb_agg(c||jsonb_build_object('courseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(c->'courseIds') x where x#>>'{}'<>p_id::text),'[]'),'status',case when c->'courseIds'=jsonb_build_array(p_id::text) then 'draft' else c->>'status' end)),'[]') from jsonb_array_elements(curricula) c),
    groups=(select coalesce(jsonb_agg(g||jsonb_build_object('requiredCourseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'requiredCourseIds','[]')) x where x#>>'{}'<>p_id::text),'[]'),'learningItems',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'learningItems','[]')) x where not(x->>'kind'='course' and x->>'id'=p_id::text)),'[]'))),'[]') from jsonb_array_elements(groups) g),governance_revision=governance_revision+1 where id;
  -- An emptied curriculum becomes a draft; remove its assignments so later governance saves remain valid.
  update public.fb_config c set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('learningItems',coalesce((select jsonb_agg(i) from jsonb_array_elements(g->'learningItems') i where i->>'kind'<>'curriculum' or exists(select 1 from jsonb_array_elements(c.curricula) x where x->>'id'=i->>'id' and x->>'status'='published')),'[]'))),'[]') from jsonb_array_elements(c.groups) g) where id;
  delete from public.fb_documents where id=p_id and deleted_at is not null;
  delete from public.fb_audit where entity_id=p_id::text;
 else
  -- Auth deletion happens first through the supported Admin API. The profile and learner records cascade.
  if exists(select 1 from public.fb_profiles where id=p_id) then raise exception 'Delete the Auth account before finalizing'; end if;
  update public.fb_deleted_items set deleted_by='00000000-0000-0000-0000-000000000000' where deleted_by=p_id;
  update public.fb_audit set actor='00000000-0000-0000-0000-000000000000',snapshot=null where actor=p_id;
  delete from public.fb_audit where entity_id=p_id::text;
 end if;
 -- Historical full governance snapshots can contain the erased user's identity or content references.
 update public.fb_audit set snapshot=null where snapshot is not null and (snapshot::text like '%'||p_id::text||'%' or (d.email is not null and lower(snapshot::text) like '%'||lower(d.email)||'%'));
 delete from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim;
end $$;

commit;
-- End 20260927151533_bulk_recovery_references.sql

-- Begin 20260927152156_account_deletion_lock.sql
begin;
alter table public.fb_deleted_items add column auth_locked boolean not null default false;
create or replace function public.fb_delete_users(p_actor uuid,p_expected integer,p_ids jsonb,p_owner text) returns jsonb
language plpgsql set search_path='' as $$
declare cfg public.fb_config; u public.fb_profiles; uid uuid; results jsonb:='[]'; changed boolean:=false;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
 for uid in select value::uuid from jsonb_array_elements_text(p_ids) loop
  begin
   select * into u from public.fb_profiles where id=uid for update;
   if not found then raise exception 'Account not found'; end if;
   if u.deleted_at is not null then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','unchanged')); continue; end if;
   if uid=p_actor then raise exception 'You cannot delete your own account'; end if;
   if lower(u.email)=lower(p_owner) then raise exception 'The installation owner cannot be deleted'; end if;
   if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'managerId'=uid::text) then raise exception 'Reassign this person''s managed teams first'; end if;
   if u.role='admin' and not exists(select 1 from public.fb_profiles where id<>uid and active and role='admin') then raise exception 'Keep an active administrator'; end if;
   insert into public.fb_deleted_items(entity,id,name,email,revision,deleted_by,snapshot) values('user',uid,u.name,u.email,1,p_actor,to_jsonb(u));
   update public.fb_deleted_items set claimed_at=now(),claim=gen_random_uuid() where entity='user' and id=uid;
   update public.fb_profiles set active=false,deleted_at=now(),groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=uid;
   update public.fb_mcp_grants set enabled=false where user_id=uid;
   delete from public.fb_pending_profiles where lower(email)=lower(u.email);
   insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','delete_user',uid::text);
   results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','changed')); changed:=true;
  exception when raise_exception then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','failed','message',sqlerrm)); end;
 end loop;
 if changed then update public.fb_config set governance_revision=governance_revision+1 where id; end if;
 return results;
end $$;

create or replace function public.fb_restore_deleted(p_actor uuid,p_entity text,p_id uuid,p_expected integer) returns text
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id for update;
 if not found then raise exception 'Deleted item not found'; end if;
 if d.entity='user' and not d.auth_locked then raise exception 'Account deactivation is finishing. Try restoration after the worker retries'; end if;
 if d.purging or d.purge_after<=clock_timestamp() then raise exception 'The recovery window has ended'; end if;
 if d.revision<>p_expected then raise exception 'Revision conflict'; end if;
 if p_entity='content' then
  update public.fb_documents set deleted_at=null,revision=revision+1,draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null where id=p_id;
 else
  update public.fb_profiles set deleted_at=null,active=false,role='learner',groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=p_id;
  update public.fb_config set governance_revision=governance_revision+1 where id;
 end if;
 delete from public.fb_deleted_items where entity=p_entity and id=p_id;
 insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','restore_'||p_entity,p_id::text);
 return 'changed';
end $$;

create or replace function public.fb_claim_deletions(p_secret text) returns setof public.fb_deleted_items
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.fb_cleanup_config where secret=p_secret) then raise exception 'Invalid worker credential'; end if;
 perform 1 from public.fb_config where id for update;
 update public.fb_cleanup_config set last_run=now() where id;
 return query update public.fb_deleted_items set purging=(purge_after<=now()),claimed_at=now(),claim=gen_random_uuid(),error=null
 where (entity,id) in (select entity,id from public.fb_deleted_items where (purge_after<=now() or (entity='user' and not auth_locked)) and (claimed_at is null or claimed_at<now()-interval '15 minutes') order by purge_after limit 20 for update skip locked) returning *;
end $$;

commit;
-- End 20260927152156_account_deletion_lock.sql

-- Begin 20260927153217_media_cleanup_lock.sql
create or replace function public.fb_collect_deleted_media() returns table(id uuid,path text)
language plpgsql set search_path='' as $$
begin
 perform 1 from public.fb_config cfg where cfg.id for update;
 -- Mark unusable before returning paths. Save triggers below prevent a race with new references.
 return query update public.fb_media m set ready=false where m.id in(select q.id from public.fb_media_cleanup q)
 and not exists(select 1 from public.fb_documents d where (d.draft::text||coalesce(d.published::text,'')) like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_deleted_items d where d.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_audit a where a.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_config c where c.settings::text like '%/api/media/'||m.id::text||'.%')
 returning m.id,m.path;
end $$;
-- End 20260927153217_media_cleanup_lock.sql

-- Begin 20261001202740_admin_people_reads.sql
-- Keep People independent of installation-wide learning history.
-- This invoker function is callable only by the server's service role.
set local lock_timeout = '5s';

create function public.fb_admin_people_snapshot(p_actor uuid, p_user uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select 1 from public.fb_profiles where id=p_actor and active and role='admin' and deleted_at is null) then
    raise exception 'Administrator access is required';
  end if;
  if p_user is not null and not exists (select 1 from public.fb_profiles where id=p_user and deleted_at is null) then
    raise exception 'Person is no longer available';
  end if;
  select jsonb_build_object(
    'revision', c.governance_revision,
    'users', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.fb_profiles p where p.deleted_at is null), '[]'::jsonb),
    'groups', c.groups,
    'teams', c.teams,
    'curricula', c.curricula,
    'pending', coalesce((select jsonb_agg(to_jsonb(p) order by p.email) from public.fb_pending_profiles p), '[]'::jsonb),
    'progress', coalesce((select jsonb_agg(to_jsonb(p) order by p.content_id,p.version) from public.fb_progress p where p_user is not null and p.user_id=p_user), '[]'::jsonb)
  ) into result from public.fb_config c where c.id;
  return result;
end;
$$;
revoke all on function public.fb_admin_people_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fb_admin_people_snapshot(uuid,uuid) to service_role;

-- The existing compound keys begin with user_id or guest_key.
-- Content deletion and content-scoped reads need the reverse lookup too.
create index fb_progress_content_id_idx on public.fb_progress(content_id);
create index fb_feedback_content_id_idx on public.fb_feedback(content_id);
create index fb_feedback_user_content_idx on public.fb_feedback(user_id,content_id,updated_at desc);
create index fb_feedback_guest_content_idx on public.fb_feedback(guest_key,content_id,updated_at desc);
-- End 20261001202740_admin_people_reads.sql

-- Begin 20261001222227_roster_people.sql
-- Stable roster people exist before a provider login. Existing IDs and histories stay unchanged.
begin;
set local lock_timeout = '5s';

alter table public.fb_profiles
  add column auth_user_id uuid,
  add column hire_date date,
  add column onboarding_days integer check(onboarding_days between 1 and 365);
update public.fb_profiles set auth_user_id=id where auth_user_id is null;
alter table public.fb_profiles drop constraint fb_profiles_id_fkey;
alter table public.fb_profiles alter column id set default gen_random_uuid();
alter table public.fb_profiles add constraint fb_profiles_auth_user_id_key unique(auth_user_id);
-- Preserve the existing supported Auth-deletion cascade through the person row.
alter table public.fb_profiles add constraint fb_profiles_auth_user_id_fkey foreign key(auth_user_id) references auth.users(id) on delete cascade;
alter table public.fb_progress drop constraint fb_progress_user_id_fkey;
alter table public.fb_progress add constraint fb_progress_user_id_fkey foreign key(user_id) references public.fb_profiles(id) on delete cascade;
alter table public.fb_feedback drop constraint fb_feedback_user_id_fkey;
alter table public.fb_feedback add constraint fb_feedback_user_id_fkey foreign key(user_id) references public.fb_profiles(id) on delete cascade;
alter table public.fb_mcp_grants drop constraint fb_mcp_grants_user_id_fkey;
alter table public.fb_mcp_grants add constraint fb_mcp_grants_user_id_fkey foreign key(user_id) references public.fb_profiles(id) on delete cascade;

create unique index fb_profiles_normalized_email_key on public.fb_profiles(lower(trim(email)));

-- Preserve legacy clocks as recorded dates; do not invent a hire date.
update public.fb_profiles set onboarding_days=coalesce((select (settings->>'onboardingDays')::integer from public.fb_config where id),90) where onboarding_start is not null;

create function public.fb_roster_clock() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.hire_date is null and new.onboarding_start is null then
    new.onboarding_days:=null;
  elsif new.onboarding_days is null then
    select coalesce((settings->>'onboardingDays')::integer,90) into new.onboarding_days from public.fb_config where id;
  end if;
  return new;
end $$;
revoke all on function public.fb_roster_clock() from public,anon,authenticated;
create trigger fb_roster_clock before insert or update on public.fb_profiles for each row execute function public.fb_roster_clock();

-- A conflicting legacy identity must be reviewed rather than silently merged.
do $$ begin
  if exists(select 1 from public.fb_pending_profiles x join public.fb_profiles p on lower(trim(p.email))=lower(trim(x.email))) then
    raise exception 'Review duplicate pending and registered email records before applying the roster migration';
  end if;
end $$;
insert into public.fb_profiles(id,email,name,role,groups,team_id,onboarding_start,group_joined_at,effective_group_joined_at)
select gen_random_uuid(),lower(trim(p.email)),p.name,p.role,p.groups,p.team_id,p.onboarding_start,
  (select coalesce(jsonb_object_agg(g,to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),'{}') from jsonb_array_elements_text(p.groups) g),
  (select coalesce(jsonb_object_agg(g.id,to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),'{}') from public.fb_config c,public.fb_member_groups(p.groups,p.team_id,c.groups) g)
from public.fb_pending_profiles p;

create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    -- Preregistration creates a person; later edits/deletion use its stable ID.
    if coalesce((p_data->>'revoke')::boolean,false) then raise exception 'Use recoverable person deletion'; end if;
    if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'A person already uses that email'; end if;
    if exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'Account is pending deletion'; end if;
    if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
    if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
    select coalesce(jsonb_object_agg(g,stamp),'{}') into direct_dates from jsonb_array_elements_text(p_data->'groups') g;
    select coalesce(jsonb_object_agg(g.id,stamp),'{}') into effective_dates from public.fb_member_groups(p_data->'groups',p_data->>'teamId',cfg.groups) g;
    insert into public.fb_profiles(id,email,name,role,groups,team_id,hire_date,group_joined_at,effective_group_joined_at)
    values(gen_random_uuid(),lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'hireDate')::date,direct_dates,effective_dates);
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_groups(u->'groups',u->>'teamId',p_data->'groups') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

create or replace function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns public.fb_profiles language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; preregistered boolean:=false;
begin
  select * into cfg from public.fb_config where id for update;
  select * into result from public.fb_profiles where auth_user_id=p_id;
  if found then return result; end if;
  if exists(select 1 from public.fb_deleted_items where entity='user' and (id=p_id or lower(trim(email))=lower(trim(p_email)))) then raise exception 'Account is pending deletion'; end if;
  select * into result from public.fb_profiles where lower(trim(email))=lower(trim(p_email)) for update;
  if found then
    if result.auth_user_id is not null then raise exception 'Email is already linked to an account'; end if;
    if not result.active or result.deleted_at is not null then raise exception 'This account is inactive'; end if;
    preregistered:=true;
    -- Verified first activation attaches the login; no membership, clock or progress reset.
    update public.fb_profiles set auth_user_id=p_id,role=case when p_owner then 'admin' else role end where id=result.id returning * into result;
  else
    if not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
    -- An account's first login is not evidence of its employee hire date.
    insert into public.fb_profiles(id,auth_user_id,email,name,role)
    values(p_id,p_id,lower(trim(p_email)),p_name,case when p_owner then 'admin' else 'learner' end) returning * into result;
  end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(result.id,'auth','register',result.id::text,jsonb_build_object('preRegistered',preregistered,'role',result.role));
  return result;
end $$;
revoke all on function public.fb_register_profile from public,anon,authenticated;
grant execute on function public.fb_register_profile to service_role;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active and auth_user_id is not null),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role='manager' and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role='manager' and p.active and p.team_id in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;


create or replace function public.fb_admin_people_snapshot(p_actor uuid, p_user uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select 1 from public.fb_profiles where id=p_actor and active and role='admin' and deleted_at is null and auth_user_id is not null) then
    raise exception 'Administrator access is required';
  end if;
  if p_user is not null and not exists (select 1 from public.fb_profiles where id=p_user and deleted_at is null) then
    raise exception 'Person is no longer available';
  end if;
  select jsonb_build_object(
    'revision', c.governance_revision,
    'users', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.fb_profiles p where p.deleted_at is null), '[]'::jsonb),
    'groups', c.groups,
    'teams', c.teams,
    'curricula', c.curricula,
    'pending', '[]'::jsonb,
    'progress', coalesce((select jsonb_agg(to_jsonb(p) order by p.content_id,p.version) from public.fb_progress p where p_user is not null and p.user_id=p_user), '[]'::jsonb)
  ) into result from public.fb_config c where c.id;
  return result;
end;
$$;
revoke all on function public.fb_admin_people_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fb_admin_people_snapshot(uuid,uuid) to service_role;

create or replace function public.fb_delete_users(p_actor uuid,p_expected integer,p_ids jsonb,p_owner text) returns jsonb
language plpgsql set search_path='' as $$
declare cfg public.fb_config; u public.fb_profiles; uid uuid; results jsonb:='[]'; changed boolean:=false;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
 for uid in select value::uuid from jsonb_array_elements_text(p_ids) loop
  begin
   select * into u from public.fb_profiles where id=uid for update;
   if not found then raise exception 'Account not found'; end if;
   if u.deleted_at is not null then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','unchanged')); continue; end if;
   if uid=p_actor then raise exception 'You cannot delete your own account'; end if;
   if lower(u.email)=lower(p_owner) then raise exception 'The installation owner cannot be deleted'; end if;
   if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'managerId'=uid::text) then raise exception 'Reassign this person''s managed teams first'; end if;
   if u.role='admin' and not exists(select 1 from public.fb_profiles where id<>uid and active and role='admin' and auth_user_id is not null) then raise exception 'Keep an active administrator'; end if;
   insert into public.fb_deleted_items(entity,id,name,email,revision,deleted_by,snapshot) values('user',uid,u.name,u.email,1,p_actor,to_jsonb(u));
   update public.fb_deleted_items set claimed_at=now(),claim=gen_random_uuid() where entity='user' and id=uid;
   update public.fb_profiles set active=false,deleted_at=now(),groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=uid;
   update public.fb_mcp_grants set enabled=false where user_id=uid;
   insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','delete_user',uid::text);
   results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','changed')); changed:=true;
  exception when raise_exception then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','failed','message',sqlerrm)); end;
 end loop;
 if changed then update public.fb_config set governance_revision=governance_revision+1 where id; end if;
 return results;
end $$;

create or replace function public.fb_finish_deletion(p_entity text,p_id uuid,p_claim uuid) returns void
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items; cfg public.fb_config;
begin
 select * into cfg from public.fb_config where id for update;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim and purging and purge_after<=now() for update;
 if not found then raise exception 'Deletion claim expired'; end if;
 insert into public.fb_media_cleanup(id) select m.id from public.fb_media m where (p_entity='user' and m.owner=p_id) or d.snapshot::text like '%/api/media/'||m.id::text||'.%' or exists(select 1 from public.fb_audit a where a.entity_id=p_id::text and a.snapshot::text like '%/api/media/'||m.id::text||'.%') on conflict do nothing;
 if p_entity='user' then update public.fb_media set owner='00000000-0000-0000-0000-000000000000' where owner=p_id; end if;
 if p_entity='content' then
  delete from public.fb_progress where content_id=p_id;
  delete from public.fb_feedback where content_id=p_id;
  update public.fb_config set curricula=(select coalesce(jsonb_agg(c||jsonb_build_object('courseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(c->'courseIds') x where x#>>'{}'<>p_id::text),'[]'),'status',case when c->'courseIds'=jsonb_build_array(p_id::text) then 'draft' else c->>'status' end)),'[]') from jsonb_array_elements(curricula) c),
    groups=(select coalesce(jsonb_agg(g||jsonb_build_object('requiredCourseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'requiredCourseIds','[]')) x where x#>>'{}'<>p_id::text),'[]'),'learningItems',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'learningItems','[]')) x where not(x->>'kind'='course' and x->>'id'=p_id::text)),'[]'))),'[]') from jsonb_array_elements(groups) g),governance_revision=governance_revision+1 where id;
  -- An emptied curriculum becomes a draft; remove its assignments so later governance saves remain valid.
  update public.fb_config c set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('learningItems',coalesce((select jsonb_agg(i) from jsonb_array_elements(g->'learningItems') i where i->>'kind'<>'curriculum' or exists(select 1 from jsonb_array_elements(c.curricula) x where x->>'id'=i->>'id' and x->>'status'='published')),'[]'))),'[]') from jsonb_array_elements(c.groups) g) where id;
  delete from public.fb_documents where id=p_id and deleted_at is not null;
  delete from public.fb_audit where entity_id=p_id::text;
 else
  -- Linked identities cascade through the roster; never-signed-in people have no Auth account.
  if exists(select 1 from public.fb_profiles where id=p_id and auth_user_id is not null) then raise exception 'Delete the Auth account before finalizing'; end if;
  delete from public.fb_profiles where id=p_id and auth_user_id is null and deleted_at is not null;
  if exists(select 1 from public.fb_profiles where id=p_id) then raise exception 'Person is not pending deletion'; end if;
  update public.fb_deleted_items set deleted_by='00000000-0000-0000-0000-000000000000' where deleted_by=p_id;
  update public.fb_audit set actor='00000000-0000-0000-0000-000000000000',snapshot=null where actor=p_id;
  delete from public.fb_audit where entity_id=p_id::text;
 end if;
 -- Historical full governance snapshots can contain the erased user's identity or content references.
 update public.fb_audit set snapshot=null where snapshot is not null and (snapshot::text like '%'||p_id::text||'%' or (d.email is not null and lower(snapshot::text) like '%'||lower(d.email)||'%'));
 delete from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim;
end $$;
-- Enable this function as the Custom Access Token Hook in Supabase Auth.
-- OAuth tokens for approved Fieldbook clients are bound to this MCP endpoint.
create or replace function public.fb_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb; client text; resource text;
begin
  claims := event->'claims';
  client := coalesce(event->>'client_id',claims->>'client_id');
  if client is not null and exists(select 1 from public.fb_mcp_grants g join public.fb_profiles p on p.id=g.user_id where p.auth_user_id=(event->>'user_id')::uuid and p.active and p.deleted_at is null and g.client_id=client and g.enabled) then
    select c.resource into resource from public.fb_oauth_config c where id=true;
    if resource is not null then claims := jsonb_set(claims,'{aud}',to_jsonb(resource)); end if;
  end if;
  return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.fb_access_token_hook from public,anon,authenticated;
grant execute on function public.fb_access_token_hook to supabase_auth_admin;
-- All live preregistration reads/writes now use fb_profiles; remove the redundant store.
drop table public.fb_pending_profiles;
commit;
-- End 20261001222227_roster_people.sql

-- Begin 20261001232329_stable_assignment_episodes.sql
begin;
set local lock_timeout = '5s';

-- Existing team links retain their old reach until reviewed in the group UI.
update public.fb_config set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('teamLinkScope',case when jsonb_array_length(coalesce(g->'teamIds','[]'))>0 then 'direct' else 'subtree' end)),'[]') from jsonb_array_elements(groups) g) where id;

create function public.fb_team_ancestors(p_team text,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 with recursive branch(id) as (
  select p_team where p_team is not null
  union select t->>'parentId' from branch b,jsonb_array_elements(p_teams) t where t->>'id'=b.id and t->>'parentId' is not null
 ) select id from branch;
$$;
create function public.fb_member_group_tree(p_direct jsonb,p_team text,p_nodes jsonb,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select * from public.fb_effective_groups(p_direct || (
  select coalesce(jsonb_agg(g->>'id'),'[]') from jsonb_array_elements(p_nodes) g
  where exists(select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
   where t=p_team or (coalesce(g->>'teamLinkScope','subtree')='subtree' and t in(select id from public.fb_team_ancestors(p_team,p_teams))))
 ),p_nodes);
$$;
create or replace function public.fb_member_groups(p_direct jsonb,p_team text,p_nodes jsonb) returns table(id text)
language sql stable set search_path='' as $$
 select * from public.fb_member_group_tree(p_direct,p_team,p_nodes,(select teams from public.fb_config where id));
$$;

-- A legacy link may be narrowed without broadening its reach. New links always
-- include descendants; old clients must not silently drop the migration marker.
alter function public.fb_validate_learning(jsonb,jsonb,jsonb) rename to fb_validate_learning_sources;
create function public.fb_validate_learning(p_groups jsonb,p_teams jsonb,p_curricula jsonb) returns void
language plpgsql set search_path='' as $$
declare g jsonb; old jsonb;
begin
 perform public.fb_validate_learning_sources(p_groups,p_teams,p_curricula);
 for g in select * from jsonb_array_elements(p_groups) loop
  select n into old from public.fb_config c,jsonb_array_elements(c.groups) n where n->>'id'=g->>'id';
  if old->>'teamLinkScope'='direct' and g->>'teamLinkScope' is null then raise exception 'Learning links changed. Reload with the matching application'; end if;
  if g->>'teamLinkScope'='direct' and (old->>'teamLinkScope' is distinct from 'direct' or exists(select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t where not coalesce(old->'teamIds','[]') ? t)) then raise exception 'New team links include all subteams. Review expansion first'; end if;
  if g->>'teamLinkScope' is not null and g->>'teamLinkScope' not in ('direct','subtree') then raise exception 'Invalid team link scope'; end if;
 end loop;
end $$;

create table public.fb_assignment_episodes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.fb_profiles(id) on delete cascade,
 content_id uuid not null references public.fb_documents(id) on delete cascade,
 version integer not null check(version>0),
 started_at timestamptz not null,
 due_date date not null,
 catch_up_days integer not null check(catch_up_days between 1 and 365),
 onboarding_end date,
 source_groups jsonb not null check(jsonb_typeof(source_groups)='array'),
 baseline boolean not null default false,
 ended_at timestamptz
);
create unique index fb_assignment_active_key on public.fb_assignment_episodes(user_id,content_id,version) where ended_at is null;
create index fb_assignment_course_active on public.fb_assignment_episodes(content_id,user_id) where ended_at is null;
create index fb_assignment_person_history on public.fb_assignment_episodes(user_id,started_at desc);
create index fb_assignment_course_history on public.fb_assignment_episodes(content_id);
alter table public.fb_assignment_episodes enable row level security;
revoke all on public.fb_assignment_episodes from public,anon,authenticated;
grant select,insert,update,delete on public.fb_assignment_episodes to service_role;

create function public.fb_assignment_coverage(p_user uuid default null,p_content uuid default null)
returns table(user_id uuid,content_id uuid,version integer,source_groups jsonb,baseline_at timestamptz)
language sql stable set search_path='' as $$
 with cfg as (select * from public.fb_config where id),
 memberships as materialized (
  select p.id,p.group_joined_at,p.effective_group_joined_at,g.id as group_id
  from public.fb_profiles p,cfg,public.fb_member_group_tree(p.groups,p.team_id,cfg.groups,cfg.teams) g
  where p.deleted_at is null and (p_user is null or p.id=p_user)
 ), rules as (
  select d.id,(d.published->>'version')::integer as version,r
  from public.fb_documents d,jsonb_array_elements(coalesce(d.published->'assignments','[]')) r
  where d.deleted_at is null and d.published->>'kind'='course' and (p_content is null or d.id=p_content)
 )
 select m.id,r.id,r.version,jsonb_agg(distinct m.group_id order by m.group_id),
  min(greatest(coalesce((m.effective_group_joined_at->>m.group_id)::timestamptz,(m.group_joined_at->>m.group_id)::timestamptz,(r.r->>'assignedAt')::timestamptz), (r.r->>'assignedAt')::timestamptz))
 from memberships m join rules r on r.r->>'groupId'=m.group_id
 group by m.id,r.id,r.version;
$$;
create function public.fb_assignment_due(p_at timestamptz,p_start date,p_onboarding integer,p_catch integer)
returns date language sql immutable set search_path='' as $$
 select greatest((p_at at time zone 'UTC')::date+p_catch,p_start+p_onboarding);
$$;
create function public.fb_reconcile_assignments(p_user uuid default null,p_content uuid default null,p_baseline boolean default false)
returns void language plpgsql set search_path='' as $$
declare cfg public.fb_config; stamp timestamptz:=clock_timestamp();
begin
 select * into cfg from public.fb_config where id for update;
 update public.fb_assignment_episodes e set ended_at=stamp
 where ended_at is null and (p_user is null or e.user_id=p_user) and (p_content is null or e.content_id=p_content)
 and not exists(select 1 from public.fb_assignment_coverage(p_user,p_content) c where c.user_id=e.user_id and c.content_id=e.content_id and c.version=e.version);
 insert into public.fb_assignment_episodes(user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,source_groups,baseline)
 select c.user_id,c.content_id,c.version,
  case when p_baseline then coalesce(c.baseline_at,stamp) else stamp end,
  public.fb_assignment_due(case when p_baseline then coalesce(c.baseline_at,stamp) else stamp end,coalesce(p.hire_date,p.onboarding_start),p.onboarding_days,coalesce((cfg.settings->>'catchUpDays')::integer,30)),
  coalesce((cfg.settings->>'catchUpDays')::integer,30),coalesce(p.hire_date,p.onboarding_start)+p.onboarding_days,c.source_groups,p_baseline
 from public.fb_assignment_coverage(p_user,p_content) c join public.fb_profiles p on p.id=c.user_id
 on conflict(user_id,content_id,version) where ended_at is null do update set source_groups=excluded.source_groups
 where public.fb_assignment_episodes.source_groups is distinct from excluded.source_groups;
end $$;

-- Keep source reconciliation and obligation reconciliation in one transaction.
alter function public.fb_sync_learning() rename to fb_sync_learning_sources;
create function public.fb_sync_learning() returns void language plpgsql set search_path='' as $$
declare previous text:=coalesce(current_setting('fieldbook.learning_batch',true),''); stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 perform set_config('fieldbook.learning_batch','on',true);
 perform public.fb_sync_learning_sources();
 update public.fb_profiles p set effective_group_joined_at=(
  select coalesce(jsonb_object_agg(g.id,coalesce(p.effective_group_joined_at->>g.id,stamp)),'{}')
  from public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g
 ) where p.deleted_at is null;
 perform set_config('fieldbook.learning_batch',previous,true);
 perform public.fb_reconcile_assignments();
end $$;

create function public.fb_assignment_person_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(current_setting('fieldbook.learning_batch',true),'')<>'on' then perform public.fb_reconcile_assignments(new.id); end if;
 return new;
end $$;
create trigger fb_assignment_person_changed after insert or update of groups,team_id,hire_date,onboarding_start,deleted_at on public.fb_profiles
for each row execute function public.fb_assignment_person_changed();
create function public.fb_assignment_course_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(current_setting('fieldbook.learning_batch',true),'')<>'on' then perform public.fb_reconcile_assignments(null,new.id); end if;
 return new;
end $$;
create trigger fb_assignment_course_changed after insert or update of published,deleted_at on public.fb_documents
for each row execute function public.fb_assignment_course_changed();

-- Current effective records become a documented baseline; this changes no deadlines.
select public.fb_reconcile_assignments(null,null,true);

create function public.fb_person_assignments(p_user uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('episodeId',id,'contentId',content_id,'version',version,
  'assignedAt',to_char(started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'dueDate',due_date,'catchUpDays',catch_up_days,'onboardingEnd',onboarding_end,'sourceGroups',source_groups,'baseline',baseline) order by content_id),'[]')
 from public.fb_assignment_episodes where user_id=p_user and ended_at is null;
$$;

create function public.fb_review_deadlines(p_actor uuid,p_apply boolean default false,p_token text default null)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; clocks jsonb; courses jsonb; token text; review jsonb; previous text;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 -- Serialize the short apply against learner progress so newly completed courses
 -- cannot have their deadline changed halfway through the reviewed transaction.
 if p_apply then lock table public.fb_progress in share mode; end if;
 token:=md5(cfg.revision::text||':'||cfg.governance_revision::text||':'||cfg.settings::text||
  coalesce((select string_agg(id::text||coalesce(coalesce(hire_date,onboarding_start)::text,'')||coalesce(onboarding_days,0)::text||active::text,',' order by id) from public.fb_profiles),'')||
  coalesce((select string_agg(id::text||started_at::text||due_date::text||source_groups::text,',' order by id) from public.fb_assignment_episodes where ended_at is null),'')||
  coalesce((select string_agg(user_id::text||content_id::text||version::text||revision::text,',' order by user_id,content_id,version) from public.fb_progress),''));
 select coalesce(jsonb_agg(jsonb_build_object('personId',id,'name',name,'before',coalesce(hire_date,onboarding_start)+onboarding_days,'after',coalesce(hire_date,onboarding_start)+(cfg.settings->>'onboardingDays')::integer) order by name,id),'[]') into clocks
 from public.fb_profiles where active and deleted_at is null and coalesce(hire_date,onboarding_start) is not null and onboarding_days is distinct from (cfg.settings->>'onboardingDays')::integer;
 select coalesce(jsonb_agg(jsonb_build_object('personId',p.id,'name',p.name,'contentId',d.id,'title',d.published->>'title','before',e.due_date,'after',public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),(cfg.settings->>'onboardingDays')::integer,(cfg.settings->>'catchUpDays')::integer)) order by p.name,d.published->>'title',e.id),'[]') into courses
 from public.fb_assignment_episodes e join public.fb_profiles p on p.id=e.user_id join public.fb_documents d on d.id=e.content_id
 where e.ended_at is null and p.active and p.deleted_at is null
 and e.due_date is distinct from public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),(cfg.settings->>'onboardingDays')::integer,(cfg.settings->>'catchUpDays')::integer)
 and not exists(select 1 from public.fb_progress r where r.user_id=e.user_id and r.content_id=e.content_id and r.version=e.version and r.passed
   and not exists(select 1 from jsonb_array_elements(coalesce(d.published->'lessons','[]')) l where not r.lessons ? (l->>'id')));
 review:=jsonb_build_object('token',token,'clocks',clocks,'courses',courses,'onboardingDays',(cfg.settings->>'onboardingDays')::integer,'catchUpDays',(cfg.settings->>'catchUpDays')::integer);
 if not p_apply then return review; end if;
 if p_token is distinct from token then raise exception 'People, assignments or settings changed. Review deadlines again'; end if;
 previous:=coalesce(current_setting('fieldbook.learning_batch',true),'');
 perform set_config('fieldbook.learning_batch','on',true);
 update public.fb_profiles set onboarding_days=(cfg.settings->>'onboardingDays')::integer where active and deleted_at is null and coalesce(hire_date,onboarding_start) is not null;
 update public.fb_assignment_episodes e set due_date=public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),p.onboarding_days,(cfg.settings->>'catchUpDays')::integer),catch_up_days=(cfg.settings->>'catchUpDays')::integer,onboarding_end=coalesce(p.hire_date,p.onboarding_start)+p.onboarding_days
 from public.fb_profiles p,public.fb_documents d where e.user_id=p.id and e.content_id=d.id and e.ended_at is null and p.active and p.deleted_at is null
 and not exists(select 1 from public.fb_progress r where r.user_id=e.user_id and r.content_id=e.content_id and r.version=e.version and r.passed
   and not exists(select 1 from jsonb_array_elements(coalesce(d.published->'lessons','[]')) l where not r.lessons ? (l->>'id')));
 perform set_config('fieldbook.learning_batch',previous,true);
 update public.fb_config set governance_revision=governance_revision+1 where id;
 insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_actor,'web','recalculate_deadlines','governance',review-'courses'-'clocks'||jsonb_build_object('clockCount',jsonb_array_length(clocks),'courseCount',jsonb_array_length(courses)));
 return review;
end $$;
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare previous text:=coalesce(current_setting('fieldbook.learning_batch',true),''); cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  perform set_config('fieldbook.learning_batch','on',true);
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    -- Preregistration creates a person; later edits/deletion use its stable ID.
    if coalesce((p_data->>'revoke')::boolean,false) then raise exception 'Use recoverable person deletion'; end if;
    if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'A person already uses that email'; end if;
    if exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'Account is pending deletion'; end if;
    if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
    if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
    select coalesce(jsonb_object_agg(g,stamp),'{}') into direct_dates from jsonb_array_elements_text(p_data->'groups') g;
    select coalesce(jsonb_object_agg(g.id,stamp),'{}') into effective_dates from public.fb_member_groups(p_data->'groups',p_data->>'teamId',cfg.groups) g;
    insert into public.fb_profiles(id,email,name,role,groups,team_id,hire_date,group_joined_at,effective_group_joined_at)
    values(gen_random_uuid(),lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'hireDate')::date,direct_dates,effective_dates);
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_group_tree(u->'groups',u->>'teamId',p_data->'groups',p_data->'teams') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;

  else raise exception 'Unknown governance operation'; end if;
  perform public.fb_sync_learning();
  perform set_config('fieldbook.learning_batch',previous,true);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

drop function public.fb_register_profile(uuid,text,text,boolean);
create function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; preregistered boolean:=false;
begin
  select * into cfg from public.fb_config where id for update;
  select * into result from public.fb_profiles where auth_user_id=p_id;
  if found then return to_jsonb(result)||jsonb_build_object('learning_assignments',public.fb_person_assignments(result.id)); end if;
  if exists(select 1 from public.fb_deleted_items where entity='user' and (id=p_id or lower(trim(email))=lower(trim(p_email)))) then raise exception 'Account is pending deletion'; end if;
  select * into result from public.fb_profiles where lower(trim(email))=lower(trim(p_email)) for update;
  if found then
    if result.auth_user_id is not null then raise exception 'Email is already linked to an account'; end if;
    if not result.active or result.deleted_at is not null then raise exception 'This account is inactive'; end if;
    preregistered:=true;
    -- Verified first activation attaches the login; no membership, clock or progress reset.
    update public.fb_profiles set auth_user_id=p_id,role=case when p_owner then 'admin' else role end where id=result.id returning * into result;
  else
    if not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
    -- An account's first login is not evidence of its employee hire date.
    insert into public.fb_profiles(id,auth_user_id,email,name,role)
    values(p_id,p_id,lower(trim(p_email)),p_name,case when p_owner then 'admin' else 'learner' end) returning * into result;
  end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(result.id,'auth','register',result.id::text,jsonb_build_object('preRegistered',preregistered,'role',result.role));
  return to_jsonb(result)||jsonb_build_object('learning_assignments',public.fb_person_assignments(result.id));
end $$;
revoke all on function public.fb_register_profile from public,anon,authenticated;
grant execute on function public.fb_register_profile to service_role;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active and auth_user_id is not null),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role='manager' and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role='manager' and p.active and p.team_id in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('learning_assignments',public.fb_person_assignments(p.id))) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;


create or replace function public.fb_admin_people_snapshot(p_actor uuid, p_user uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select 1 from public.fb_profiles where id=p_actor and active and role='admin' and deleted_at is null and auth_user_id is not null) then
    raise exception 'Administrator access is required';
  end if;
  if p_user is not null and not exists (select 1 from public.fb_profiles where id=p_user and deleted_at is null) then
    raise exception 'Person is no longer available';
  end if;
  select jsonb_build_object(
    'revision', c.governance_revision,
    'users', coalesce((select jsonb_agg(to_jsonb(p)||case when p.id=p_user then jsonb_build_object('learning_assignments',public.fb_person_assignments(p.id)) else '{}'::jsonb end order by p.id) from public.fb_profiles p where p.deleted_at is null), '[]'::jsonb),
    'groups', c.groups,
    'teams', c.teams,
    'curricula', c.curricula,
    'pending', '[]'::jsonb,
    'progress', coalesce((select jsonb_agg(to_jsonb(p) order by p.content_id,p.version) from public.fb_progress p where p_user is not null and p.user_id=p_user), '[]'::jsonb)
  ) into result from public.fb_config c where c.id;
  return result;
end;
$$;
revoke all on function public.fb_admin_people_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fb_admin_people_snapshot(uuid,uuid) to service_role;


-- Restrict helpers and writes to the server's service role; API handlers also check the actor.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fb_validate_learning','fb_validate_learning_sources','fb_team_ancestors','fb_member_group_tree','fb_member_groups','fb_assignment_coverage','fb_assignment_due','fb_reconcile_assignments','fb_sync_learning','fb_sync_learning_sources','fb_assignment_person_changed','fb_assignment_course_changed','fb_person_assignments','fb_review_deadlines') loop
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
-- End 20261001232329_stable_assignment_episodes.sql

-- Begin 20261001234401_contributor_permissions.sql
-- Contributor publishing is independent of explicitly assigned team management.
-- Existing data, revisions, service-role grants and administrator governance stay intact.
begin;
alter table public.fb_profiles drop constraint fb_profiles_role_check;
alter table public.fb_profiles add constraint fb_profiles_role_check check(role in ('admin','manager','learner','contributor'));

create function public.fb_require_publisher(p_actor uuid) returns text
language plpgsql stable set search_path='' as $$
declare account_role text;
begin
 select role into account_role from public.fb_profiles where id=p_actor and active and deleted_at is null and auth_user_id is not null and role in ('admin','contributor');
 if account_role is null then raise exception 'Administrator or contributor publishing access is required'; end if;
 return account_role;
end $$;
revoke all on function public.fb_require_publisher from public,anon,authenticated;
grant execute on function public.fb_require_publisher to service_role;

-- Match encodeURIComponent used by existing legacy Docs section IDs.
create function public.fb_section_component(p_value text) returns text
language plpgsql immutable set search_path='' as $$
declare bytes bytea:=convert_to(p_value,'UTF8'); result text:=''; code integer;
begin
 if length(bytes)=0 then return result; end if;
 for i in 0..length(bytes)-1 loop
  code:=get_byte(bytes,i);
  result:=result||case when (code between 65 and 90) or (code between 97 and 122) or (code between 48 and 57) or code in (45,95,46,33,126,42,39,40,41) then chr(code) else '%'||upper(lpad(to_hex(code),2,'0')) end;
 end loop;
 return result;
end $$;
revoke all on function public.fb_section_component from public,anon,authenticated;
grant execute on function public.fb_section_component to service_role;

create function public.fb_validate_contributor_section(p_doc jsonb) returns void
language plpgsql stable set search_path='' as $$
declare cfg public.fb_config; section jsonb; parent jsonb; category text:=coalesce(p_doc->>'category',''); folder text:=coalesce(p_doc->>'folder',''); sid text:=coalesce(p_doc->>'sectionId','');
begin
 select * into cfg from public.fb_config where id;
 select s into section from jsonb_array_elements(coalesce(cfg.settings->'docSections','[]')) s where s->>'id'=sid;
 if section is not null then
  select s into parent from jsonb_array_elements(coalesce(cfg.settings->'docSections','[]')) s where s->>'id'=section->>'parentId';
  if category=coalesce(parent->>'name',section->>'name') and folder=(case when parent is null then '' else section->>'name' end) then return; end if;
 elsif (sid='' or sid='legacy:'||public.fb_section_component(category)||':'||public.fb_section_component(folder)) and
   ((category='' and folder='' and sid='') or
    exists(select 1 from jsonb_array_elements(coalesce(cfg.settings->'docCategoryOrder','[]')) n where n#>>'{}'=category and folder='') or
    exists(select 1 from public.fb_documents d where d.deleted_at is null and d.draft->>'kind'='doc' and coalesce(d.draft->>'category','')=category and coalesce(d.draft->>'folder','')=folder)) then return;
 end if;
 -- Keep documents in a retired section editable without permitting a new hierarchy.
 if exists(select 1 from public.fb_documents d where d.deleted_at is null and d.draft->>'kind'='doc' and d.draft->>'sectionId'=sid and coalesce(d.draft->>'category','')=category and coalesce(d.draft->>'folder','')=folder) then return; end if;
 raise exception 'Choose an existing Docs section';
end $$;
revoke all on function public.fb_validate_contributor_section from public,anon,authenticated;
grant execute on function public.fb_validate_contributor_section to service_role;
create or replace function public.fb_save_document(p_id uuid, p_expected integer, p_draft jsonb, p_publish boolean, p_unpublish boolean, p_actor uuid, p_source text)
returns public.fb_documents language plpgsql set search_path = '' as $$
declare d public.fb_documents;
begin
  perform 1 from public.fb_config where id for update;
  perform public.fb_require_publisher(p_actor);
  -- Validate protected authoring fields against the stored draft before writing.
  select * into d from public.fb_documents where id=p_id for update;
  if public.fb_require_publisher(p_actor)='contributor' then
    if d.id is not null and p_draft->>'kind' is distinct from d.draft->>'kind' then raise exception 'Content type cannot change'; end if;
    if p_draft->>'kind'='course' and
      (coalesce(p_draft->'groups','[]') is distinct from coalesce(d.draft->'groups','[]') or
       coalesce(p_draft->'assignments','[]') is distinct from coalesce(d.draft->'assignments','[]')) then
      raise exception 'Only administrators can change course assignments';
    end if;
    if p_draft->>'kind'='doc' then
      if p_draft->'sectionOrder' is distinct from d.draft->'sectionOrder' then raise exception 'Only administrators can reorder Docs'; end if;
      perform public.fb_validate_contributor_section(p_draft);
    end if;
  end if;
  if p_expected = 0 then
    insert into public.fb_documents(id,draft) values(p_id,p_draft) on conflict do nothing;
    if not found then raise exception 'Revision conflict'; end if;
    select * into d from public.fb_documents where id=p_id for update;
  else
    select * into d from public.fb_documents where id=p_id for update;
    if d.deleted_at is not null then raise exception 'Content is in Recently deleted'; end if;
    if not found or d.revision <> p_expected then raise exception 'Revision conflict'; end if;
    update public.fb_documents set draft=p_draft,revision=revision+1,updated_at=now() where id=p_id returning * into d;
  end if;
  if p_publish then
    update public.fb_documents set published=p_draft,published_revision=d.revision where id=p_id returning * into d;
  elsif p_unpublish then
    update public.fb_documents set published=null,published_revision=null where id=p_id returning * into d;
  end if;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot)
    values(p_actor,p_source,case when p_publish then 'publish' when p_unpublish then 'unpublish' else 'save_draft' end,p_id::text,d.revision,d.draft);
  return d;
end $$;

create or replace function public.fb_bulk_content(p_actor uuid,p_id uuid,p_expected integer,p_operation text,p_patch jsonb default '{}',p_settings_expected integer default null) returns text
language plpgsql set search_path='' as $$
declare d public.fb_documents; cfg public.fb_config; old_live integer;
begin
 select * into cfg from public.fb_config where id for update;
 perform public.fb_require_publisher(p_actor);
 select * into d from public.fb_documents where id=p_id for update;
 if not found then raise exception 'Content not found'; end if;
 if d.deleted_at is not null then
  if p_operation='delete' then return 'unchanged'; end if;
  raise exception 'Content is in Recently deleted';
 end if;
 if d.revision<>p_expected then raise exception 'Revision conflict'; end if;
 if p_operation='delete' then
  insert into public.fb_deleted_items(entity,id,name,kind,revision,deleted_by,snapshot) values('content',d.id,d.draft->>'title',d.draft->>'kind',d.revision+1,p_actor,to_jsonb(d));
  update public.fb_documents set deleted_at=now(),draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 elsif p_operation='metadata' then
  if cfg.revision is distinct from p_settings_expected then raise exception 'Settings changed. Reload before moving content'; end if;
  if p_patch-'category'-'folder'-'sectionId'<>'{}'::jsonb or not p_patch ? 'category' then raise exception 'Invalid metadata patch'; end if;
  if public.fb_require_publisher(p_actor)='contributor' and d.draft->>'kind'='doc' then perform public.fb_validate_contributor_section(d.draft||p_patch); end if;
  if d.draft @> p_patch and (d.published is null or d.published @> p_patch) then return 'unchanged'; end if;
  if p_patch ? 'sectionId' then
   p_patch:=p_patch||jsonb_build_object('sectionOrder',1+(select coalesce(max(coalesce((v->>'sectionOrder')::integer,0)),0) from public.fb_documents x cross join lateral (values(x.draft),(x.published)) copies(v) where v->>'sectionId'=p_patch->>'sectionId'));
  end if;
  update public.fb_documents set draft=draft||p_patch,published=case when published is null then null else published||p_patch end,
   published_revision=case when published_revision=revision then revision+1 else published_revision end,revision=revision+1 where id=p_id;
 elsif p_operation='unpublish' then
  if d.published is null then return 'unchanged'; end if;
  update public.fb_documents set draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 else raise exception 'Unsupported content action'; end if;
 insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','bulk_'||p_operation,p_id::text,d.revision+1,p_patch);
 return 'changed';
end $$;

create or replace function public.fb_restore_deleted(p_actor uuid,p_entity text,p_id uuid,p_expected integer) returns text
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items;
begin
 perform 1 from public.fb_config where id for update;
 if public.fb_require_publisher(p_actor)<>'admin' and p_entity<>'content' then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id for update;
 if not found then raise exception 'Deleted item not found'; end if;
 if d.entity='user' and not d.auth_locked then raise exception 'Account deactivation is finishing. Try restoration after the worker retries'; end if;
 if d.purging or d.purge_after<=clock_timestamp() then raise exception 'The recovery window has ended'; end if;
 if d.revision<>p_expected then raise exception 'Revision conflict'; end if;
 if p_entity='content' then
  update public.fb_documents set deleted_at=null,revision=revision+1,draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null where id=p_id;
 else
  update public.fb_profiles set deleted_at=null,active=false,role='learner',groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=p_id;
  update public.fb_config set governance_revision=governance_revision+1 where id;
 end if;
 delete from public.fb_deleted_items where entity=p_entity and id=p_id;
 insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','restore_'||p_entity,p_id::text);
 return 'changed';
end $$;

create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    -- Preregistration creates a person; later edits/deletion use its stable ID.
    if coalesce((p_data->>'revoke')::boolean,false) then raise exception 'Use recoverable person deletion'; end if;
    if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'A person already uses that email'; end if;
    if exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'Account is pending deletion'; end if;
    if p_data->>'role' not in ('learner','manager','admin','contributor') then raise exception 'Invalid role'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
    if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
    select coalesce(jsonb_object_agg(g,stamp),'{}') into direct_dates from jsonb_array_elements_text(p_data->'groups') g;
    select coalesce(jsonb_object_agg(g.id,stamp),'{}') into effective_dates from public.fb_member_groups(p_data->'groups',p_data->>'teamId',cfg.groups) g;
    insert into public.fb_profiles(id,email,name,role,groups,team_id,hire_date,group_joined_at,effective_group_joined_at)
    values(gen_random_uuid(),lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'hireDate')::date,direct_dates,effective_dates);
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_groups(u->'groups',u->>'teamId',p_data->'groups') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin','contributor')) then raise exception 'Team managers must be active managers, contributors or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active and auth_user_id is not null),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role in ('manager','contributor') and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role in ('manager','contributor') and p.active and p.team_id in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;
commit;
-- End 20261001234401_contributor_permissions.sql

-- Begin 20261002011512_ask_ai_passages.sql
-- Read-only retrieval over the existing publication-maintained index.
-- No new table, embedding job, transcript persistence, or ordinary-search change.
create function public.fb_ai_passages(
  p_queries text[], p_kinds text[], p_limit integer default 12
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with queries as (
    select distinct pg_catalog.websearch_to_tsquery('simple',
      pg_catalog.left(pg_catalog.regexp_replace(q, '[^[:alnum:] -]', ' ', 'g'), 120)) as query
    from pg_catalog.unnest(p_queries[1:3]) q
    where pg_catalog.length(pg_catalog.btrim(q)) > 0
  ), candidates as (
    select s.content_id, s.passage_id, max(pg_catalog.ts_rank(s.search_vector, q.query)) as score,
      (array_agg(q.query order by pg_catalog.ts_rank(s.search_vector, q.query) desc))[1] as query
    from public.fb_search_passages s
    join public.fb_documents d on d.id = s.content_id
    cross join queries q
    where s.kind = any(p_kinds[1:3]) and s.search_vector @@ q.query
      and d.deleted_at is null and d.published is not null
      and s.published_revision is not null
      and d.published_revision = s.published_revision
      and d.published->>'kind' = s.kind
    group by s.content_id, s.passage_id
  ), diverse as (
    select c.*, row_number() over (partition by c.content_id order by c.score desc, c.passage_id) as item_rank
    from candidates c
  ), limited as (
    select c.* from diverse c where c.item_rank <= 3
    order by c.score desc, c.content_id, c.passage_id
    limit greatest(1, least(coalesce(p_limit, 12), 12))
  ), results as (
    select s.content_id, s.passage_id, s.kind, s.title, s.lesson_id, s.lesson_title,
      -- Select matching windows even when a term is near the end of a long lesson.
      pg_catalog.ts_headline('simple', s.source_text, l.query,
        'StartSel="",StopSel="",MaxWords=200,MinWords=100,MaxFragments=2,FragmentDelimiter= … ') as source_text,
      s.published_revision, s.content_date, l.score
    from limited l join public.fb_search_passages s using(content_id, passage_id)
  ) select coalesce(jsonb_agg(to_jsonb(r) - 'score' order by r.score desc, r.content_id, r.passage_id), '[]'::jsonb)
    from results r;
$$;
revoke all on function public.fb_ai_passages(text[],text[],integer) from public, anon, authenticated;
grant execute on function public.fb_ai_passages(text[],text[],integer) to service_role;

-- The application calls this before generation and before sending final citations.
create function public.fb_ai_sources_current(p_sources jsonb) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case when p_sources is null or jsonb_typeof(p_sources) <> 'array' then false
  when jsonb_array_length(p_sources) > 12 then false
  else not exists (
    select 1 from jsonb_to_recordset(p_sources) as expected(content_id uuid, passage_id text, published_revision integer)
    left join public.fb_search_passages s
      on s.content_id = expected.content_id and s.passage_id = expected.passage_id
    left join public.fb_documents d on d.id = expected.content_id
    where s.content_id is null or d.id is null or d.deleted_at is not null
      or d.published is null or expected.published_revision is null
      or d.published_revision is distinct from expected.published_revision
      or s.published_revision is distinct from expected.published_revision
      or d.published->>'kind' is distinct from s.kind
  ) end;
$$;
revoke all on function public.fb_ai_sources_current(jsonb) from public, anon, authenticated;
grant execute on function public.fb_ai_sources_current(jsonb) to service_role;
-- End 20261002011512_ask_ai_passages.sql

-- Begin 20261002022921_flat_learning_groups.sql
begin;
set local lock_timeout = '5s';

-- This is a coordinated model upgrade. Pause organization/content writes and
-- deploy the matching application after applying it. All coverage changes below
-- are visible together; no transient remove/rejoin can reset a saved deadline.
select id from public.fb_config where id for update;
select set_config('fieldbook.learning_batch','on',true);
create temporary table fb_flat_old_config on commit drop as select * from public.fb_config where id;
create temporary table fb_flat_ancestors on commit drop as
 select g->>'id' as source_id,a.id as target_id
 from fb_flat_old_config c,jsonb_array_elements(c.groups) g,
 public.fb_effective_groups(jsonb_build_array(g->>'id'),c.groups) a;
create temporary table fb_flat_group_order on commit drop as
 select g->>'id' as id,row_number() over(order by (select count(*) from fb_flat_ancestors a where a.source_id=g->>'id'),lower(g->>'name'),g->>'id') as position,g
 from fb_flat_old_config c,jsonb_array_elements(c.groups) g;
create temporary table fb_flat_old_memberships on commit drop as
 select p.id as person_id,g.id as group_id from public.fb_profiles p,fb_flat_old_config c,
 public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g where p.deleted_at is null;
create temporary table fb_flat_old_coverage on commit drop as
 select user_id,content_id,version from public.fb_assignment_coverage();
create temporary table fb_flat_old_episodes on commit drop as
 select id,user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,baseline,ended_at from public.fb_assignment_episodes;
create temporary table fb_flat_old_updates on commit drop as
 select distinct m.person_id,d.id as content_id from fb_flat_old_memberships m,public.fb_documents d
 where d.deleted_at is null and d.published->>'kind'='brief' and coalesce(d.published->'groups','[]') ? m.group_id;
create temporary table fb_flat_guest_groups on commit drop as
 select a.target_id from fb_flat_old_config c,fb_flat_ancestors a where a.source_id=c.settings->>'guestGroupId';
create temporary table fb_flat_old_guest on commit drop as
 select distinct d.id as content_id from public.fb_documents d,fb_flat_guest_groups g
 where d.deleted_at is null and d.published->>'kind' in ('course','brief') and coalesce(d.published->'groups','[]') ? g.target_id;

-- Preserve direct people in each former ancestor. Team-derived people are never
-- copied into individual membership lists: their team source stays live.
update public.fb_profiles p set
 groups=(select coalesce(jsonb_agg(x.id order by o.position),'[]') from (select distinct a.target_id as id from jsonb_array_elements_text(p.groups) d join fb_flat_ancestors a on a.source_id=d) x join fb_flat_group_order o on o.id=x.id),
 group_joined_at=(select coalesce(jsonb_object_agg(x.id,x.joined),'{}') from (
  select a.target_id as id,coalesce(p.effective_group_joined_at->>a.target_id,p.group_joined_at->>a.target_id,min(p.group_joined_at->>d)) as joined
  from jsonb_array_elements_text(p.groups) d join fb_flat_ancestors a on a.source_id=d group by a.target_id
 ) x where x.joined is not null);
-- Recovery snapshots are operator-owned records too. Restoring a person must not
-- discard their formerly inherited individual audiences.
update public.fb_deleted_items p set snapshot=jsonb_set(jsonb_set(p.snapshot,'{groups}',(
 select coalesce(jsonb_agg(x.id order by o.position),'[]') from (select distinct a.target_id as id from jsonb_array_elements_text(coalesce(p.snapshot->'groups','[]')) d join fb_flat_ancestors a on a.source_id=d) x join fb_flat_group_order o on o.id=x.id
 )),'{group_joined_at}',(
 select coalesce(jsonb_object_agg(x.id,x.joined),'{}') from (
  select a.target_id as id,coalesce(p.snapshot->'effective_group_joined_at'->>a.target_id,p.snapshot->'group_joined_at'->>a.target_id,min(p.snapshot->'group_joined_at'->>d)) as joined
  from jsonb_array_elements_text(coalesce(p.snapshot->'groups','[]')) d join fb_flat_ancestors a on a.source_id=d group by a.target_id
 ) x where x.joined is not null
 )) where p.entity='user' and p.snapshot is not null;

-- Group-level legacy scope cannot express a mixture of copied direct/subtree
-- sources. Canonical teamIds now mean subtrees; legacyDirectTeamIds preserve only
-- old direct sources and may be narrowed or explicitly expanded by an admin.
with sources as (
 select a.target_id,g->>'id' as source_id,t as team_id,coalesce(g->>'teamLinkScope','subtree') as scope
 from fb_flat_old_config c,jsonb_array_elements(c.groups) g join fb_flat_ancestors a on a.source_id=g->>'id',jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
 union all
 select a.target_id,g->>'id',t,'direct' from fb_flat_old_config c,jsonb_array_elements(c.groups) g join fb_flat_ancestors a on a.source_id=g->>'id',jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')) t
), links as (
 select target_id,team_id,bool_or(scope='subtree') as subtree from sources group by target_id,team_id
), flat as (
 select o.position,(o.g-'parentId'-'teamLinkScope')||jsonb_build_object(
  'teamIds',(select coalesce(jsonb_agg(l.team_id order by l.team_id),'[]') from links l where l.target_id=o.id and l.subtree),
  'legacyDirectTeamIds',(select coalesce(jsonb_agg(l.team_id order by l.team_id),'[]') from links l where l.target_id=o.id and not l.subtree),
  'learningItems',case when o.id=c.settings->>'guestGroupId' then (
   select coalesce(jsonb_agg(i order by position,subposition),'[]') from (
    select distinct on(i->>'kind',i->>'id') i,p.position,subposition from fb_flat_group_order p join fb_flat_guest_groups a on a.target_id=p.id,
     jsonb_array_elements(coalesce(p.g->'learningItems','[]')) with ordinality item(i,subposition)
    order by i->>'kind',i->>'id',p.position,subposition
   ) unique_items
  ) else coalesce(o.g->'learningItems','[]') end
 ) as g from fb_flat_group_order o,fb_flat_old_config c
)
update public.fb_config set groups=(select coalesce(jsonb_agg(g order by position),'[]') from flat),governance_revision=governance_revision+1 where id;

-- The selected guest audience formerly received its ancestors' recommendations.
-- Retain those existing choices explicitly, without a guest account or automatic
-- future group inheritance. Course plans are synchronized once below.
update public.fb_documents d set
 draft=case when d.draft->>'kind'='brief' and exists(select 1 from fb_flat_guest_groups g where coalesce(d.draft->'groups','[]') ? g.target_id) then jsonb_set(d.draft,'{groups}',(select jsonb_agg(distinct x) from jsonb_array_elements_text(coalesce(d.draft->'groups','[]')||jsonb_build_array(c.settings->>'guestGroupId')) x)) else d.draft end,
 published=case when d.published->>'kind'='brief' and exists(select 1 from fb_flat_guest_groups g where coalesce(d.published->'groups','[]') ? g.target_id) then jsonb_set(d.published,'{groups}',(select jsonb_agg(distinct x) from jsonb_array_elements_text(coalesce(d.published->'groups','[]')||jsonb_build_array(c.settings->>'guestGroupId')) x)) else d.published end,
 revision=d.revision+1
 from fb_flat_old_config c where c.settings->>'guestGroupId' is not null
 and d.draft->>'kind'='brief' and (
  (exists(select 1 from fb_flat_guest_groups g where coalesce(d.draft->'groups','[]') ? g.target_id) and not coalesce(d.draft->'groups','[]') ? (c.settings->>'guestGroupId'))
  or (exists(select 1 from fb_flat_guest_groups g where coalesce(d.published->'groups','[]') ? g.target_id) and not coalesce(d.published->'groups','[]') ? (c.settings->>'guestGroupId'))
 );

create or replace function public.fb_effective_groups(p_direct jsonb,p_nodes jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select distinct d from jsonb_array_elements_text(p_direct) d where exists(select 1 from jsonb_array_elements(p_nodes) g where g->>'id'=d);
$$;
create or replace function public.fb_member_group_tree(p_direct jsonb,p_team text,p_nodes jsonb,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select * from public.fb_effective_groups(p_direct||(
  select coalesce(jsonb_agg(g->>'id'),'[]') from jsonb_array_elements(p_nodes) g
  where coalesce(g->'legacyDirectTeamIds','[]') ? p_team or exists(
   select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
   where t=p_team or t in(select id from public.fb_team_ancestors(p_team,p_teams))
  )
 ),p_nodes);
$$;
create or replace function public.fb_validate_learning(p_groups jsonb,p_teams jsonb,p_curricula jsonb) returns void
language plpgsql set search_path='' as $$
declare g jsonb; old jsonb;
begin
 perform public.fb_validate_learning_sources(p_groups,p_teams,p_curricula);
 -- Same deletion rule for preserved direct sources as canonical subtree links:
 -- first remove the source in one save, then delete its referenced team.
 if exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) n,jsonb_array_elements_text(coalesce(n->'legacyDirectTeamIds','[]')) t where not exists(select 1 from jsonb_array_elements(p_teams) x where x->>'id'=t)) then raise exception 'Remove learning-group links before deleting a team'; end if;
 for g in select * from jsonb_array_elements(p_groups) loop
  if g->>'parentId' is not null then raise exception 'Learning groups are independent audiences and cannot have parents'; end if;
  if g->>'teamLinkScope'='direct' then raise exception 'Legacy learning links changed. Reload with the matching application'; end if;
  if jsonb_typeof(coalesce(g->'legacyDirectTeamIds','[]')) is distinct from 'array' then raise exception 'Invalid legacy team links'; end if;
  select n into old from public.fb_config c,jsonb_array_elements(c.groups) n where n->>'id'=g->>'id';
  if jsonb_array_length(coalesce(old->'legacyDirectTeamIds','[]'))>0 and g->'legacyDirectTeamIds' is null then raise exception 'Learning links changed. Reload with the matching application'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')) t where not coalesce(old->'legacyDirectTeamIds','[]') ? t) then raise exception 'New team links include all subteams'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')||coalesce(g->'teamIds','[]')) t group by t having count(*)>1) then raise exception 'Duplicate team link'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')) t where not exists(select 1 from jsonb_array_elements(p_teams) x where x->>'id'=t)) then raise exception 'Team does not exist'; end if;
 end loop;
end $$;
create function public.fb_groups_are_flat(p_groups jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_groups)='array' and not exists(select 1 from jsonb_array_elements(p_groups) g where g->>'parentId' is not null or g->>'teamLinkScope'='direct');
$$;
alter table public.fb_config add constraint fb_config_flat_learning_groups check(public.fb_groups_are_flat(groups));
revoke all on function public.fb_groups_are_flat(jsonb) from public,anon,authenticated;
grant execute on function public.fb_groups_are_flat(jsonb) to service_role;

-- Restore episode-aware atomic governance after the contributor upgrade,
-- retaining publisher permissions and explicit contributor team reporting.
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare previous text:=coalesce(current_setting('fieldbook.learning_batch',true),''); cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  perform set_config('fieldbook.learning_batch','on',true);
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    -- Preregistration creates a person; later edits/deletion use its stable ID.
    if coalesce((p_data->>'revoke')::boolean,false) then raise exception 'Use recoverable person deletion'; end if;
    if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'A person already uses that email'; end if;
    if exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'Account is pending deletion'; end if;
    if p_data->>'role' not in ('learner','manager','admin','contributor') then raise exception 'Invalid role'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
    if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
    select coalesce(jsonb_object_agg(g,stamp),'{}') into direct_dates from jsonb_array_elements_text(p_data->'groups') g;
    select coalesce(jsonb_object_agg(g.id,stamp),'{}') into effective_dates from public.fb_member_groups(p_data->'groups',p_data->>'teamId',cfg.groups) g;
    insert into public.fb_profiles(id,email,name,role,groups,team_id,hire_date,group_joined_at,effective_group_joined_at)
    values(gen_random_uuid(),lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'hireDate')::date,direct_dates,effective_dates);
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_group_tree(u->'groups',u->>'teamId',p_data->'groups',p_data->'teams') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin','contributor')) then raise exception 'Team managers must be active managers, contributors or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;

  else raise exception 'Unknown governance operation'; end if;
  perform public.fb_sync_learning();
  perform set_config('fieldbook.learning_batch',previous,true);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active and auth_user_id is not null),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role in ('manager','contributor') and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role in ('manager','contributor') and p.active and p.team_id in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('learning_assignments',public.fb_person_assignments(p.id))) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;


select public.fb_sync_learning();
select set_config('fieldbook.learning_batch','',true);

-- Refuse the entire upgrade if it changes effective learning/relevance or resets
-- any existing episode. More explicit sources may change source_groups only.
do $$ begin
 if exists((select person_id,group_id from fb_flat_old_memberships except select p.id,g.id from public.fb_profiles p,public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g where p.deleted_at is null)
 union all (select p.id,g.id from public.fb_profiles p,public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g where p.deleted_at is null except select person_id,group_id from fb_flat_old_memberships)) then raise exception 'Flat conversion changed effective memberships'; end if;
 if exists((select * from fb_flat_old_coverage except select user_id,content_id,version from public.fb_assignment_coverage())
 union all (select user_id,content_id,version from public.fb_assignment_coverage() except select * from fb_flat_old_coverage)) then raise exception 'Flat conversion changed assigned course versions'; end if;
 if exists((select * from fb_flat_old_episodes except select id,user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,baseline,ended_at from public.fb_assignment_episodes)
 union all (select id,user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,baseline,ended_at from public.fb_assignment_episodes except select * from fb_flat_old_episodes)) then raise exception 'Flat conversion changed assignment history or deadlines'; end if;
 if exists((select * from fb_flat_old_updates except select distinct p.id,d.id from public.fb_profiles p,public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g,public.fb_documents d where p.deleted_at is null and d.deleted_at is null and d.published->>'kind'='brief' and coalesce(d.published->'groups','[]') ? g.id)
 union all (select distinct p.id,d.id from public.fb_profiles p,public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g,public.fb_documents d where p.deleted_at is null and d.deleted_at is null and d.published->>'kind'='brief' and coalesce(d.published->'groups','[]') ? g.id except select * from fb_flat_old_updates)) then raise exception 'Flat conversion changed Update relevance'; end if;
 if exists((select * from fb_flat_old_guest except select d.id from public.fb_documents d,public.fb_config c where d.deleted_at is null and d.published->>'kind' in ('course','brief') and coalesce(d.published->'groups','[]') ? (c.settings->>'guestGroupId'))
 union all (select d.id from public.fb_documents d,public.fb_config c where d.deleted_at is null and d.published->>'kind' in ('course','brief') and coalesce(d.published->'groups','[]') ? (c.settings->>'guestGroupId') except select * from fb_flat_old_guest)) then raise exception 'Flat conversion changed guest recommendations'; end if;
end $$;
commit;
-- End 20261002022921_flat_learning_groups.sql

-- Begin 20261002064454_team_group_course_assignments.sql
begin;
set local lock_timeout = '5s';
-- Build on the immutable assignment-episode prerequisite shared with roster work.
alter table public.fb_assignment_episodes add column source_audiences jsonb not null default '[]' check(jsonb_typeof(source_audiences)='array');
update public.fb_assignment_episodes e set source_audiences=(select coalesce(jsonb_agg(jsonb_build_object('kind','group','id',g)),'[]') from jsonb_array_elements_text(e.source_groups) g);

create function public.fb_assignment_audience_coverage(p_user uuid default null,p_content uuid default null)
returns table(user_id uuid,content_id uuid,version integer,source_groups jsonb,source_audiences jsonb,baseline_at timestamptz)
language sql stable set search_path='' as $$
 with cfg as (select * from public.fb_config where id),
 people as (select p.* from public.fb_profiles p where p.deleted_at is null and (p_user is null or p.id=p_user)),
 memberships as materialized (
  select p.id,'group' as kind,g.id as audience_id,p.group_joined_at,p.effective_group_joined_at from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
  union all
  select p.id,'team',t.id,p.group_joined_at,p.effective_group_joined_at from people p,cfg,public.fb_team_ancestors(p.team_id,cfg.teams) t
 ), rules as (
  select d.id,(d.published->>'version')::integer as version,r from public.fb_documents d,jsonb_array_elements(coalesce(d.published->'assignments','[]')) r
  where d.deleted_at is null and d.published->>'kind'='course' and (p_content is null or d.id=p_content)
 )
 select m.id,r.id,r.version,
 coalesce(jsonb_agg(distinct m.audience_id order by m.audience_id) filter(where m.kind='group'),'[]'),
 jsonb_agg(distinct jsonb_build_object('kind',m.kind,'id',m.audience_id)),
 min(greatest(case when m.kind='group' then coalesce((m.effective_group_joined_at->>m.audience_id)::timestamptz,(m.group_joined_at->>m.audience_id)::timestamptz,(r.r->>'assignedAt')::timestamptz) else (r.r->>'assignedAt')::timestamptz end,(r.r->>'assignedAt')::timestamptz))
 from memberships m join rules r on (m.kind='group' and r.r->>'groupId'=m.audience_id) or (m.kind='team' and r.r->>'teamId'=m.audience_id)
 group by m.id,r.id,r.version;
$$;
create or replace function public.fb_assignment_coverage(p_user uuid default null,p_content uuid default null)
returns table(user_id uuid,content_id uuid,version integer,source_groups jsonb,baseline_at timestamptz)
language sql stable set search_path='' as $$
 select user_id,content_id,version,source_groups,baseline_at from public.fb_assignment_audience_coverage(p_user,p_content);
$$;
create or replace function public.fb_reconcile_assignments(p_user uuid default null,p_content uuid default null,p_baseline boolean default false)
returns void language plpgsql set search_path='' as $$
declare cfg public.fb_config; stamp timestamptz:=clock_timestamp();
begin
 select * into cfg from public.fb_config where id for update;
 update public.fb_assignment_episodes e set ended_at=stamp
 where ended_at is null and (p_user is null or e.user_id=p_user) and (p_content is null or e.content_id=p_content)
 and not exists(select 1 from public.fb_assignment_audience_coverage(p_user,p_content) c where c.user_id=e.user_id and c.content_id=e.content_id and c.version=e.version);
 insert into public.fb_assignment_episodes(user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,source_groups,source_audiences,baseline)
 select c.user_id,c.content_id,c.version,
  case when p_baseline then coalesce(c.baseline_at,stamp) else stamp end,
  public.fb_assignment_due(case when p_baseline then coalesce(c.baseline_at,stamp) else stamp end,coalesce(p.hire_date,p.onboarding_start),p.onboarding_days,coalesce((cfg.settings->>'catchUpDays')::integer,30)),
  coalesce((cfg.settings->>'catchUpDays')::integer,30),coalesce(p.hire_date,p.onboarding_start)+p.onboarding_days,c.source_groups,c.source_audiences,p_baseline
 from public.fb_assignment_audience_coverage(p_user,p_content) c join public.fb_profiles p on p.id=c.user_id
 on conflict(user_id,content_id,version) where ended_at is null do update set source_groups=excluded.source_groups,source_audiences=excluded.source_audiences
 where public.fb_assignment_episodes.source_audiences is distinct from excluded.source_audiences;
end $$;
create or replace function public.fb_assignment_guard() returns trigger language plpgsql set search_path='' as $$
declare cfg public.fb_config; payload jsonb; rules jsonb; prior jsonb; g jsonb; field text; stamp text; audience_kind text; audience_field text;
begin
 select * into cfg from public.fb_config where id for update;
 stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 foreach field in array array['draft','published'] loop
  payload:=case when field='draft' then new.draft else new.published end;
  if payload is null then continue; end if;
  rules:='[]';
  if payload->>'kind'='course' then
   if exists(select 1 from jsonb_array_elements(coalesce(payload->'assignments','[]')) a where a->>'userId' is not null or a->'due'->>'type' is distinct from 'none') then raise exception 'Assigned learning uses teams or groups and organization windows'; end if;
   foreach audience_kind in array array['group','team'] loop
    audience_field:=audience_kind||'Id';
    for g in select n from jsonb_array_elements(case when audience_kind='group' then cfg.groups else cfg.teams end) n where coalesce(n->'requiredCourseIds','[]') ? new.id::text loop
     prior:=null;
     if TG_OP='UPDATE' and old.published->>'version'=payload->>'version' then
      select a into prior from jsonb_array_elements(coalesce(old.published->'assignments','[]')) a where a->>audience_field=g->>'id';
     end if;
     rules:=rules||jsonb_build_array(jsonb_build_object(audience_field,g->>'id','assignedAt',coalesce(prior->>'assignedAt',stamp),'due',jsonb_build_object('type','none')));
    end loop;
   end loop;
   payload:=payload||jsonb_build_object('groups',(select coalesce(jsonb_agg(a->>'groupId'),'[]') from jsonb_array_elements(rules) a where a->>'groupId' is not null));
  elsif payload->>'kind'='brief' then
   if exists(select 1 from jsonb_array_elements_text(coalesce(payload->'groups','[]')) gid where not exists(select 1 from jsonb_array_elements(cfg.groups) n where n->>'id'=gid)) then raise exception 'Learning group does not exist'; end if;
  else payload:=payload||jsonb_build_object('groups','[]'::jsonb);
  end if;
  payload:=payload||jsonb_build_object('assignments',rules);
  if field='draft' then new.draft:=payload; else new.published:=payload; end if;
 end loop;
 return new;
end $$;
create or replace function public.fb_sync_learning_sources() returns void language plpgsql set search_path='' as $$
declare cfg public.fb_config; d public.fb_documents; ids jsonb; old_ids jsonb; draft_groups jsonb; pub_groups jsonb;
begin
 update public.fb_config c set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('requiredCourseIds',public.fb_learning_ids(g->'learningItems',c.curricula))),'[]') from jsonb_array_elements(c.groups) g) where id;
 update public.fb_config c set teams=(select coalesce(jsonb_agg(t||jsonb_build_object('requiredCourseIds',public.fb_learning_ids(coalesce(t->'learningItems','[]'),c.curricula))),'[]') from jsonb_array_elements(c.teams) t) where id returning * into cfg;
 for d in select * from public.fb_documents loop
  if d.draft->>'kind'='course' then
   select coalesce(jsonb_agg(k order by k),'[]') into ids from (
    select 'group:'||(g->>'id') k from jsonb_array_elements(cfg.groups) g where g->'requiredCourseIds' ? d.id::text
    union all select 'team:'||(t->>'id') from jsonb_array_elements(cfg.teams) t where t->'requiredCourseIds' ? d.id::text
   ) sources;
   select coalesce(jsonb_agg(k order by k),'[]') into old_ids from (
    select case when a->>'groupId' is not null then 'group:'||(a->>'groupId') else 'team:'||(a->>'teamId') end k
    from jsonb_array_elements(coalesce(coalesce(d.published,d.draft)->'assignments','[]')) a
   ) sources;
   if ids<>old_ids then update public.fb_documents set revision=revision+1 where id=d.id; end if;
  elsif d.draft->>'kind'='brief' then
   select coalesce(jsonb_agg(g),'[]') into draft_groups from jsonb_array_elements_text(coalesce(d.draft->'groups','[]')) g where exists(select 1 from jsonb_array_elements(cfg.groups) n where n->>'id'=g);
   select coalesce(jsonb_agg(g),'[]') into pub_groups from jsonb_array_elements_text(coalesce(d.published->'groups','[]')) g where exists(select 1 from jsonb_array_elements(cfg.groups) n where n->>'id'=g);
   if draft_groups<>coalesce(d.draft->'groups','[]') or pub_groups<>coalesce(d.published->'groups','[]') then
    update public.fb_documents set draft=jsonb_set(draft,'{groups}',draft_groups),published=case when published is null then null else jsonb_set(published,'{groups}',pub_groups) end,revision=revision+1 where id=d.id;
   end if;
  end if;
 end loop;
end $$;
alter function public.fb_validate_learning(jsonb,jsonb,jsonb) rename to fb_validate_learning_before_teams;
create function public.fb_validate_learning(p_groups jsonb,p_teams jsonb,p_curricula jsonb) returns void
language plpgsql set search_path='' as $$
declare a jsonb; i jsonb; old_items jsonb; nodes jsonb; kind text;
begin
 perform public.fb_validate_learning_before_teams(p_groups,p_teams,p_curricula);
 foreach kind in array array['group','team'] loop
  nodes:=case when kind='group' then p_groups else p_teams end;
  for a in select * from jsonb_array_elements(nodes) loop
   if jsonb_typeof(coalesce(a->'learningItems','[]'))<>'array' or jsonb_array_length(coalesce(a->'learningItems','[]'))>1000 then raise exception 'Invalid learning plan'; end if;
   if exists(select 1 from jsonb_array_elements(coalesce(a->'learningItems','[]')) item group by item->>'kind',item->>'id' having count(*)>1) then raise exception 'Duplicate learning item'; end if;
   select coalesce(n->'learningItems','[]') into old_items from public.fb_config c,jsonb_array_elements(case when kind='group' then c.groups else c.teams end) n where n->>'id'=a->>'id';
   for i in select * from jsonb_array_elements(coalesce(a->'learningItems','[]')) loop
    if i->>'kind'='course' then
     if not exists(select 1 from public.fb_documents d where d.id::text=i->>'id' and d.draft->>'kind'='course' and ((d.deleted_at is null and d.published is not null) or coalesce(old_items,'[]') @> jsonb_build_array(i))) then raise exception 'Choose a published course'; end if;
    elsif i->>'kind'='curriculum' then
     if not exists(select 1 from jsonb_array_elements(p_curricula) c where c->>'id'=i->>'id' and c->>'status'='published') then raise exception 'Choose a published curriculum'; end if;
    else raise exception 'Invalid learning item'; end if;
   end loop;
  end loop;
 end loop;
end $$;
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare previous text:=coalesce(current_setting('fieldbook.learning_batch',true),''); cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  perform set_config('fieldbook.learning_batch','on',true);
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    -- Preregistration creates a person; later edits/deletion use its stable ID.
    if coalesce((p_data->>'revoke')::boolean,false) then raise exception 'Use recoverable person deletion'; end if;
    if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'A person already uses that email'; end if;
    if exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'Account is pending deletion'; end if;
    if p_data->>'role' not in ('learner','manager','admin','contributor') then raise exception 'Invalid role'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
    if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
    select coalesce(jsonb_object_agg(g,stamp),'{}') into direct_dates from jsonb_array_elements_text(p_data->'groups') g;
    select coalesce(jsonb_object_agg(g.id,stamp),'{}') into effective_dates from public.fb_member_groups(p_data->'groups',p_data->>'teamId',cfg.groups) g;
    insert into public.fb_profiles(id,email,name,role,groups,team_id,hire_date,group_joined_at,effective_group_joined_at)
    values(gen_random_uuid(),lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'hireDate')::date,direct_dates,effective_dates);
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if jsonb_array_length(coalesce(n->'learningItems','[]'))>0 then raise exception 'Remove assigned learning before deleting a team'; end if;
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_group_tree(u->'groups',u->>'teamId',p_data->'groups',p_data->'teams') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin','contributor')) then raise exception 'Team managers must be active managers, contributors or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;

  else raise exception 'Unknown governance operation'; end if;
  perform public.fb_sync_learning();
  perform set_config('fieldbook.learning_batch',previous,true);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;
create function public.fb_person_assignment_teams(p_user uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t->>'id','name',t->>'name','learningItems',coalesce(t->'learningItems','[]'),'requiredCourseIds',coalesce(t->'requiredCourseIds','[]')) order by (select count(*) from public.fb_team_ancestors(t->>'id',c.teams)),t->>'id'),'[]')
 from public.fb_profiles p,public.fb_config c,jsonb_array_elements(c.teams) t
 where p.id=p_user and (jsonb_array_length(coalesce(t->'learningItems','[]'))>0 or jsonb_array_length(coalesce(t->'requiredCourseIds','[]'))>0) and t->>'id' in(select id from public.fb_team_ancestors(p.team_id,c.teams));
$$;
create function public.fb_profile_learning(p public.fb_profiles) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('learning_assignments',public.fb_person_assignments(p.id),'assignment_teams',public.fb_person_assignment_teams(p.id),'effective_group_ids',(select coalesce(jsonb_agg(g.id),'[]') from public.fb_config c,public.fb_member_groups(p.groups,p.team_id,c.groups) g));
$$;
create or replace function public.fb_person_assignments(p_user uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('episodeId',id,'contentId',content_id,'version',version,
  'assignedAt',to_char(started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'dueDate',due_date,'catchUpDays',catch_up_days,'onboardingEnd',onboarding_end,'sourceGroups',source_groups,'sourceAudiences',source_audiences,'baseline',baseline) order by content_id),'[]')
 from public.fb_assignment_episodes where user_id=p_user and ended_at is null;
$$;

create or replace function public.fb_review_deadlines(p_actor uuid,p_apply boolean default false,p_token text default null)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; clocks jsonb; courses jsonb; token text; review jsonb; previous text;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 -- Serialize the short apply against learner progress so newly completed courses
 -- cannot have their deadline changed halfway through the reviewed transaction.
 if p_apply then lock table public.fb_progress in share mode; end if;
 token:=md5(cfg.revision::text||':'||cfg.governance_revision::text||':'||cfg.settings::text||
  coalesce((select string_agg(id::text||coalesce(coalesce(hire_date,onboarding_start)::text,'')||coalesce(onboarding_days,0)::text||active::text,',' order by id) from public.fb_profiles),'')||
  coalesce((select string_agg(id::text||started_at::text||due_date::text||source_groups::text,',' order by id) from public.fb_assignment_episodes where ended_at is null),'')||
  coalesce((select string_agg(user_id::text||content_id::text||version::text||revision::text,',' order by user_id,content_id,version) from public.fb_progress),''));
 select coalesce(jsonb_agg(jsonb_build_object('personId',id,'name',name,'before',coalesce(hire_date,onboarding_start)+onboarding_days,'after',coalesce(hire_date,onboarding_start)+(cfg.settings->>'onboardingDays')::integer) order by name,id),'[]') into clocks
 from public.fb_profiles where active and deleted_at is null and coalesce(hire_date,onboarding_start) is not null and onboarding_days is distinct from (cfg.settings->>'onboardingDays')::integer;
 select coalesce(jsonb_agg(jsonb_build_object('personId',p.id,'name',p.name,'contentId',d.id,'title',d.published->>'title','before',e.due_date,'after',public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),(cfg.settings->>'onboardingDays')::integer,(cfg.settings->>'catchUpDays')::integer)) order by p.name,d.published->>'title',e.id),'[]') into courses
 from public.fb_assignment_episodes e join public.fb_profiles p on p.id=e.user_id join public.fb_documents d on d.id=e.content_id
 where e.ended_at is null and p.active and p.deleted_at is null
 and e.due_date is distinct from public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),(cfg.settings->>'onboardingDays')::integer,(cfg.settings->>'catchUpDays')::integer)
 and not exists(select 1 from public.fb_progress r where r.user_id=e.user_id and r.content_id=e.content_id and r.version=e.version and r.passed
   and not exists(select 1 from jsonb_array_elements(coalesce(d.published->'lessons','[]')) l where not r.lessons ? (l->>'id')));
 review:=jsonb_build_object('token',token,'clocks',clocks,'courses',courses,'onboardingDays',(cfg.settings->>'onboardingDays')::integer,'catchUpDays',(cfg.settings->>'catchUpDays')::integer);
 if not p_apply then return review; end if;
 if p_token is distinct from token then raise exception 'People, assignments or settings changed. Review deadlines again'; end if;
 previous:=coalesce(current_setting('fieldbook.learning_batch',true),'');
 perform set_config('fieldbook.learning_batch','on',true);
 update public.fb_profiles set onboarding_days=(cfg.settings->>'onboardingDays')::integer where active and deleted_at is null and coalesce(hire_date,onboarding_start) is not null;
 update public.fb_assignment_episodes e set due_date=public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),p.onboarding_days,(cfg.settings->>'catchUpDays')::integer),catch_up_days=(cfg.settings->>'catchUpDays')::integer,onboarding_end=coalesce(p.hire_date,p.onboarding_start)+p.onboarding_days
 from public.fb_profiles p,public.fb_documents d where e.user_id=p.id and e.content_id=d.id and e.ended_at is null and p.active and p.deleted_at is null
 and not exists(select 1 from public.fb_progress r where r.user_id=e.user_id and r.content_id=e.content_id and r.version=e.version and r.passed
   and not exists(select 1 from jsonb_array_elements(coalesce(d.published->'lessons','[]')) l where not r.lessons ? (l->>'id')));
 perform set_config('fieldbook.learning_batch',previous,true);
 update public.fb_config set governance_revision=governance_revision+1 where id;
 insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_actor,'web','recalculate_deadlines','governance',review-'courses'-'clocks'||jsonb_build_object('clockCount',jsonb_array_length(clocks),'courseCount',jsonb_array_length(courses)));
 return review;
end $$;
create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active and auth_user_id is not null),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role in ('manager','contributor') and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role in ('manager','contributor') and p.active and p.team_id in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)||public.fb_profile_learning(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;
create or replace function public.fb_admin_people_snapshot(p_actor uuid, p_user uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select 1 from public.fb_profiles where id=p_actor and active and role='admin' and deleted_at is null and auth_user_id is not null) then
    raise exception 'Administrator access is required';
  end if;
  if p_user is not null and not exists (select 1 from public.fb_profiles where id=p_user and deleted_at is null) then
    raise exception 'Person is no longer available';
  end if;
  select jsonb_build_object(
    'revision', c.governance_revision,
    'users', coalesce((select jsonb_agg(to_jsonb(p)||case when p.id=p_user then public.fb_profile_learning(p) else public.fb_profile_learning(p)-'learning_assignments' end order by p.id) from public.fb_profiles p where p.deleted_at is null), '[]'::jsonb),
    'groups', c.groups,
    'teams', c.teams,
    'curricula', c.curricula,
    'pending', '[]'::jsonb,
    'progress', coalesce((select jsonb_agg(to_jsonb(p) order by p.content_id,p.version) from public.fb_progress p where p_user is not null and p.user_id=p_user), '[]'::jsonb)
  ) into result from public.fb_config c where c.id;
  return result;
end;
$$;
revoke all on function public.fb_admin_people_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fb_admin_people_snapshot(uuid,uuid) to service_role;


-- Restrict helpers and writes to the server's service role; API handlers also check the actor.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fb_validate_learning','fb_validate_learning_sources','fb_team_ancestors','fb_member_group_tree','fb_member_groups','fb_assignment_coverage','fb_assignment_due','fb_reconcile_assignments','fb_sync_learning','fb_sync_learning_sources','fb_assignment_person_changed','fb_assignment_course_changed','fb_person_assignments','fb_review_deadlines') loop
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
end $$;
drop function public.fb_register_profile(uuid,text,text,boolean);
create function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; preregistered boolean:=false;
begin
  select * into cfg from public.fb_config where id for update;
  select * into result from public.fb_profiles where auth_user_id=p_id;
  if found then return to_jsonb(result)||public.fb_profile_learning(result); end if;
  if exists(select 1 from public.fb_deleted_items where entity='user' and (id=p_id or lower(trim(email))=lower(trim(p_email)))) then raise exception 'Account is pending deletion'; end if;
  select * into result from public.fb_profiles where lower(trim(email))=lower(trim(p_email)) for update;
  if found then
    if result.auth_user_id is not null then raise exception 'Email is already linked to an account'; end if;
    if not result.active or result.deleted_at is not null then raise exception 'This account is inactive'; end if;
    preregistered:=true;
    -- Verified first activation attaches the login; no membership, clock or progress reset.
    update public.fb_profiles set auth_user_id=p_id,role=case when p_owner then 'admin' else role end where id=result.id returning * into result;
  else
    if not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
    -- An account's first login is not evidence of its employee hire date.
    insert into public.fb_profiles(id,auth_user_id,email,name,role)
    values(p_id,p_id,lower(trim(p_email)),p_name,case when p_owner then 'admin' else 'learner' end) returning * into result;
  end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(result.id,'auth','register',result.id::text,jsonb_build_object('preRegistered',preregistered,'role',result.role));
  return to_jsonb(result)||public.fb_profile_learning(result);
end $$;
create or replace function public.fb_manage_learning(p_actor uuid,p_data jsonb) returns jsonb language plpgsql set search_path='' as $$
declare d public.fb_documents; p public.fb_progress; before_p jsonb; op text:=p_data->>'operation';
 cid uuid:=(p_data->>'contentId')::uuid; uid uuid:=(p_data->>'userId')::uuid; gid text:=p_data->>'groupId'; tid text:=p_data->>'teamId';
 rules jsonb; draft_rules jsonb; rule jsonb; group_ids jsonb; nodes jsonb; recipient text;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_documents where id=cid for update;
 if not found or d.published is null or (d.published->>'kind'<>'course' and op not in ('target','untarget')) then raise exception 'Publish the course before managing assignments'; end if;
 if d.revision<>(p_data->>'expected')::integer then raise exception 'Course changed. Reload before saving'; end if;
 if num_nonnulls(uid,gid,tid)<>1 then raise exception 'Choose exactly one recipient'; end if;
 if uid is not null and not exists(select 1 from public.fb_profiles where id=uid) then raise exception 'Person does not exist'; end if;
 if op in ('target','untarget') then
   if gid is null or uid is not null or tid is not null or d.published->>'kind'<>'brief' then raise exception 'Choose an update and a learning group'; end if;
   if not exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) g where g->>'id'=gid) then raise exception 'Group does not exist'; end if;
   select coalesce(jsonb_agg(g),'[]') into group_ids from jsonb_array_elements_text(coalesce(d.published->'groups','[]')) g where g<>gid;
   if op='target' then group_ids:=group_ids||jsonb_build_array(gid); end if;
   select coalesce(jsonb_agg(g),'[]') into draft_rules from jsonb_array_elements_text(coalesce(d.draft->'groups','[]')) g where g<>gid;
   if op='target' then draft_rules:=draft_rules||jsonb_build_array(gid); end if;
   update public.fb_documents set published=jsonb_set(published,'{groups}',group_ids),draft=jsonb_set(draft,'{groups}',draft_rules),revision=revision+1 where id=cid returning * into d;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','update_'||op,cid::text,d.revision,p_data);
 elsif op in ('assign','unassign') then
   if uid is not null or (gid is null and tid is null) then raise exception 'Choose a team or learning group'; end if;
   recipient:=coalesce(gid,tid);
   select case when tid is null then groups else teams end into nodes from public.fb_config where id;
   if not exists(select 1 from jsonb_array_elements(nodes) n where n->>'id'=recipient) then raise exception 'Assignment audience does not exist'; end if;
   select coalesce(n->'learningItems','[]') into rules from jsonb_array_elements(nodes) n where n->>'id'=recipient;
   if op='assign' and not rules @> jsonb_build_array(jsonb_build_object('kind','course','id',cid)) then rules:=rules||jsonb_build_array(jsonb_build_object('kind','course','id',cid)); end if;
   if op='unassign' then select coalesce(jsonb_agg(i),'[]') into rules from jsonb_array_elements(rules) i where not(i->>'kind'='course' and i->>'id'=cid::text); end if;
   select jsonb_agg(case when n->>'id'=recipient then n||jsonb_build_object('learningItems',rules) else n end) into nodes from jsonb_array_elements(nodes) n;
   update public.fb_config set groups=case when tid is null then nodes else groups end,teams=case when tid is not null then nodes else teams end,governance_revision=governance_revision+1 where id;
   perform public.fb_sync_learning();
   insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_actor,'web','assignment_'||op,cid::text,p_data);
 elsif op in ('complete','reset') then
   if uid is null or (d.published->>'version')::integer<>(p_data->>'version')::integer then raise exception 'Course version changed. Reload before saving'; end if;
   -- Insert a placeholder so concurrent first writes and resets share a row lock.
   insert into public.fb_progress(user_id,content_id,version,revision) values(uid,cid,(p_data->>'version')::integer,0) on conflict do nothing;
   select * into p from public.fb_progress where user_id=uid and content_id=cid and version=(p_data->>'version')::integer for update;
   if p.revision is distinct from (p_data->>'progressExpected')::integer then raise exception 'Progress changed. Reload before saving'; end if;
   before_p:=to_jsonb(p);
   update public.fb_progress set lessons=case when op='complete' then (select coalesce(jsonb_agg(l->>'id'),'[]') from jsonb_array_elements(d.published->'lessons') l) else '[]'::jsonb end,
     passed=(op='complete'), attempts=case when op='reset' then '[]'::jsonb else attempts end
     where user_id=uid and content_id=cid and version=p.version returning * into p;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','progress_'||op,cid::text,p.revision,jsonb_build_object('before',before_p,'after',to_jsonb(p)));
 else raise exception 'Unknown learning operation'; end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.fb_finish_deletion(p_entity text,p_id uuid,p_claim uuid) returns void
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items; cfg public.fb_config;
begin
 select * into cfg from public.fb_config where id for update;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim and purging and purge_after<=now() for update;
 if not found then raise exception 'Deletion claim expired'; end if;
 insert into public.fb_media_cleanup(id) select m.id from public.fb_media m where (p_entity='user' and m.owner=p_id) or d.snapshot::text like '%/api/media/'||m.id::text||'.%' or exists(select 1 from public.fb_audit a where a.entity_id=p_id::text and a.snapshot::text like '%/api/media/'||m.id::text||'.%') on conflict do nothing;
 if p_entity='user' then update public.fb_media set owner='00000000-0000-0000-0000-000000000000' where owner=p_id; end if;
 if p_entity='content' then
  delete from public.fb_progress where content_id=p_id;
  delete from public.fb_feedback where content_id=p_id;
  update public.fb_config set curricula=(select coalesce(jsonb_agg(c||jsonb_build_object('courseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(c->'courseIds') x where x#>>'{}'<>p_id::text),'[]'),'status',case when c->'courseIds'=jsonb_build_array(p_id::text) then 'draft' else c->>'status' end)),'[]') from jsonb_array_elements(curricula) c),
    groups=(select coalesce(jsonb_agg(g||jsonb_build_object('requiredCourseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'requiredCourseIds','[]')) x where x#>>'{}'<>p_id::text),'[]'),'learningItems',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'learningItems','[]')) x where not(x->>'kind'='course' and x->>'id'=p_id::text)),'[]'))),'[]') from jsonb_array_elements(groups) g),governance_revision=governance_revision+1 where id;
  -- An emptied curriculum becomes a draft; remove its assignments so later governance saves remain valid.
  update public.fb_config c set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('learningItems',coalesce((select jsonb_agg(i) from jsonb_array_elements(g->'learningItems') i where i->>'kind'<>'curriculum' or exists(select 1 from jsonb_array_elements(c.curricula) x where x->>'id'=i->>'id' and x->>'status'='published')),'[]'))),'[]') from jsonb_array_elements(c.groups) g) where id;
  update public.fb_config c set teams=(select coalesce(jsonb_agg(t||jsonb_build_object('learningItems',coalesce((select jsonb_agg(i) from jsonb_array_elements(coalesce(t->'learningItems','[]')) i where (i->>'kind'<>'course' or i->>'id'<>p_id::text) and (i->>'kind'<>'curriculum' or exists(select 1 from jsonb_array_elements(c.curricula) x where x->>'id'=i->>'id' and x->>'status'='published'))),'[]'))),'[]') from jsonb_array_elements(c.teams) t) where id;
  perform public.fb_sync_learning();
  delete from public.fb_documents where id=p_id and deleted_at is not null;
  delete from public.fb_audit where entity_id=p_id::text;
 else
  -- Auth deletion happens first through the supported Admin API. The profile and learner records cascade.
  if exists(select 1 from public.fb_profiles where id=p_id) then raise exception 'Delete the Auth account before finalizing'; end if;
  update public.fb_deleted_items set deleted_by='00000000-0000-0000-0000-000000000000' where deleted_by=p_id;
  update public.fb_audit set actor='00000000-0000-0000-0000-000000000000',snapshot=null where actor=p_id;
  delete from public.fb_audit where entity_id=p_id::text;
 end if;
 -- Historical full governance snapshots can contain the erased user's identity or content references.
 update public.fb_audit set snapshot=null where snapshot is not null and (snapshot::text like '%'||p_id::text||'%' or (d.email is not null and lower(snapshot::text) like '%'||lower(d.email)||'%'));
 delete from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim;
end $$;
-- Preserve the independently installed Organization membership rule when present.
-- Fresh main has no Organization helper; no root is introduced by this feature.
do $$ declare definition text; begin
 if to_regprocedure('public.fb_reporting_team_id(text,jsonb)') is not null then
  select pg_get_functiondef('public.fb_governance_snapshot(uuid)'::regprocedure) into definition;
  execute replace(definition,'p.team_id in(select id from allowed)',
   'public.fb_reporting_team_id(p.team_id,(select teams from cfg)) in(select id from allowed)');
 end if;
end $$;
select public.fb_sync_learning();
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fb_assignment_audience_coverage','fb_assignment_coverage','fb_reconcile_assignments','fb_assignment_guard','fb_sync_learning_sources','fb_validate_learning','fb_validate_learning_before_teams','fb_person_assignment_teams','fb_profile_learning','fb_person_assignments','fb_save_governance','fb_register_profile','fb_manage_learning','fb_governance_snapshot','fb_admin_people_snapshot','fb_finish_deletion') loop
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
-- End 20261002064454_team_group_course_assignments.sql

-- Begin 20261002135103_builtin_organization_team.sql
-- Requires the roster, stable-assignment, contributor and flat-group migrations.
-- This independent config guard does not replace assignment or governance RPCs.
-- Rehearse against an isolated backend and coordinate matching code; never mix old writers.
begin;
set local lock_timeout = '5s';
lock table public.fb_config in share row exclusive mode;

create temporary table fb_org_before on commit drop as
 select * from public.fb_config where id;
create temporary table fb_org_people_before on commit drop as select * from public.fb_profiles;
create temporary table fb_org_progress_before on commit drop as select * from public.fb_progress;
create temporary table fb_org_episodes_before on commit drop as select * from public.fb_assignment_episodes;
create temporary table fb_org_coverage_before on commit drop as select user_id,content_id,version from public.fb_assignment_coverage();
create temporary table fb_org_documents_before on commit drop as select * from public.fb_documents;

-- Keep only an explicitly designated, sole existing root. Do not infer intent from names.
do $$
declare cfg public.fb_config; root jsonb; root_id text; root_name text:='Organization'; suffix integer:=2; nodes jsonb;
begin
 select * into cfg from public.fb_config where id for update;
 perform public.fb_validate_nodes(cfg.teams);
 if exists(select 1 from jsonb_array_elements(cfg.teams) t where t ? 'system') then
   raise exception 'Unexpected existing system team; review before applying';
 end if;
 if (select count(*) from jsonb_array_elements(cfg.teams) t where t->>'parentId' is null)=1 then
   select t into root from jsonb_array_elements(cfg.teams) t
    where t->>'parentId' is null and t->>'id'=cfg.settings->>'organizationTeamId';
 end if;
 if root is null then
   root_id:=gen_random_uuid()::text;
   while exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'id'=root_id) loop root_id:=gen_random_uuid()::text; end loop;
   while exists(select 1 from jsonb_array_elements(cfg.teams) t where lower(trim(t->>'name'))=lower(root_name)) loop
     root_name:='Organization ('||suffix||')'; suffix:=suffix+1;
   end loop;
   root:=jsonb_build_object('id',root_id,'name',root_name);
 else root_id:=root->>'id'; end if;
 root:=root-'parentId'||jsonb_build_object('system','organization');
 select jsonb_build_array(root)||coalesce(jsonb_agg(case when t->>'parentId' is null then t||jsonb_build_object('parentId',root_id) else t end order by position),'[]')
   into nodes from jsonb_array_elements(cfg.teams) with ordinality as existing(t,position) where t->>'id'<>root_id;
 update public.fb_config set teams=nodes,settings=jsonb_set(settings,'{organizationTeamId}',to_jsonb(root_id)),revision=revision+1,governance_revision=governance_revision+1 where id;
end $$;

create function public.fb_organization_team(p_settings jsonb,p_teams jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select t from jsonb_array_elements(p_teams) t
 where t->>'system'='organization' and t->>'id'=p_settings->>'organizationTeamId' and t->>'parentId' is null
 and (select count(*) from jsonb_array_elements(p_teams) n where n->>'system'='organization')=1
 and not exists(select 1 from jsonb_array_elements(p_teams) n where n->>'id'<>t->>'id' and n->>'parentId' is null);
$$;
create function public.fb_validate_organization(p_settings jsonb,p_teams jsonb,p_previous_settings jsonb default null,p_previous_teams jsonb default null) returns void
language plpgsql set search_path='' as $$
declare root jsonb; previous_root jsonb;
begin
 perform public.fb_validate_nodes(p_teams);
 if exists(select 1 from jsonb_array_elements(p_teams) t where t->>'system' is not null and t->>'system'<>'organization') then raise exception 'Invalid system team'; end if;
 root:=public.fb_organization_team(p_settings,p_teams);
 if root is null then raise exception 'Keep the built-in Organization team as the only top-level team'; end if;
 if p_previous_settings is not null then
   previous_root:=public.fb_organization_team(p_previous_settings,p_previous_teams);
   if previous_root is null or root->>'id' is distinct from previous_root->>'id' or root->>'name' is distinct from previous_root->>'name' then
     raise exception 'The Organization team cannot be deleted, renamed or replaced';
   end if;
 end if;
end $$;
create function public.fb_guard_organization() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'The built-in Organization team cannot be deleted'; end if;
 if tg_op='INSERT' then
   if new.teams<>'[]'::jsonb or new.settings->>'organizationTeamId' is not null then
     raise exception 'New installations start with the built-in Organization team';
   end if;
   new.settings:=jsonb_set(new.settings,'{organizationTeamId}',to_jsonb(gen_random_uuid()::text));
   new.teams:=jsonb_build_array(jsonb_build_object('id',new.settings->>'organizationTeamId','name','Organization','system','organization'));
   perform public.fb_validate_organization(new.settings,new.teams);
 else
   perform public.fb_validate_organization(new.settings,new.teams,old.settings,old.teams);
 end if;
 return new;
end $$;
create trigger fb_guard_organization before insert or update or delete on public.fb_config
 for each row execute function public.fb_guard_organization();

-- Adding an empty system root changes no coverage, clocks, progress or history.
-- A reused root already covered the whole existing hierarchy; a new root has no manager.
do $$ declare cfg public.fb_config; before_cfg public.fb_config; root jsonb; previous_root jsonb; expected_team jsonb; prior jsonb; actual jsonb;
begin
 select * into cfg from public.fb_config where id;
 select * into before_cfg from fb_org_before;
 root:=public.fb_organization_team(cfg.settings,cfg.teams);
 if cfg.groups is distinct from before_cfg.groups or cfg.curricula is distinct from before_cfg.curricula or cfg.settings-'organizationTeamId' is distinct from before_cfg.settings-'organizationTeamId' then raise exception 'Organization upgrade changed learning groups, curricula or unrelated settings'; end if;
 if cfg.revision<>before_cfg.revision+1 or cfg.governance_revision<>before_cfg.governance_revision+1 then raise exception 'Organization upgrade revisions were not advanced once'; end if;
 for prior in select * from jsonb_array_elements(before_cfg.teams) loop
   expected_team:=prior;
   if prior->>'id'=root->>'id' then expected_team:=prior-'parentId'||jsonb_build_object('system','organization');
   elsif prior->>'parentId' is null then expected_team:=prior||jsonb_build_object('parentId',root->>'id'); end if;
   select t into actual from jsonb_array_elements(cfg.teams) t where t->>'id'=prior->>'id';
   if actual is distinct from expected_team then raise exception 'Organization upgrade changed an existing team beyond its root attachment'; end if;
 end loop;
 select t into previous_root from jsonb_array_elements(before_cfg.teams) t where t->>'id'=root->>'id';
 if jsonb_array_length(cfg.teams)<>jsonb_array_length(before_cfg.teams)+(case when previous_root is null then 1 else 0 end) then raise exception 'Organization upgrade changed existing team identities'; end if;
 if previous_root is null and root is distinct from jsonb_build_object('id',root->>'id','name',root->>'name','system','organization') then raise exception 'New Organization root must start without a manager or learning assignments'; end if;
 if exists((select * from fb_org_people_before except select * from public.fb_profiles) union all (select * from public.fb_profiles except select * from fb_org_people_before)) then raise exception 'Organization upgrade changed people'; end if;
 if exists((select * from fb_org_progress_before except select * from public.fb_progress) union all (select * from public.fb_progress except select * from fb_org_progress_before)) then raise exception 'Organization upgrade changed progress'; end if;
 if exists((select * from fb_org_episodes_before except select * from public.fb_assignment_episodes) union all (select * from public.fb_assignment_episodes except select * from fb_org_episodes_before)) then raise exception 'Organization upgrade changed assignment history or deadlines'; end if;
 if exists((select * from fb_org_coverage_before except select user_id,content_id,version from public.fb_assignment_coverage()) union all (select user_id,content_id,version from public.fb_assignment_coverage() except select * from fb_org_coverage_before)) then raise exception 'Organization upgrade changed assigned course versions'; end if;
 if exists((select * from fb_org_documents_before except select * from public.fb_documents) union all (select * from public.fb_documents except select * from fb_org_documents_before)) then raise exception 'Organization upgrade changed content or Update relevance'; end if;
 perform public.fb_validate_organization(settings,teams) from public.fb_config where id;
end $$;
revoke all on function public.fb_organization_team(jsonb,jsonb),public.fb_validate_organization(jsonb,jsonb,jsonb,jsonb),public.fb_guard_organization() from public,anon,authenticated;
grant execute on function public.fb_organization_team(jsonb,jsonb),public.fb_validate_organization(jsonb,jsonb,jsonb,jsonb),public.fb_guard_organization() to service_role;
notify pgrst,'reload schema';
commit;
-- End 20261002135103_builtin_organization_team.sql

-- Begin 20261002184642_organization_membership.sql
begin;
set local lock_timeout = '5s';

-- A missing direct team is an effective membership of the built-in root.
-- Do not manufacture people, change saved team fields, or reset existing deadlines.
create function public.fb_reporting_team_id(p_team text,p_teams jsonb) returns text
language sql immutable set search_path='' as $$
 select coalesce(nullif(p_team,''),(select t->>'id' from jsonb_array_elements(p_teams) t where t->>'system'='organization'));
$$;
create or replace function public.fb_team_ancestors(p_team text,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 with recursive branch(id) as (
  select public.fb_reporting_team_id(p_team,p_teams) where public.fb_reporting_team_id(p_team,p_teams) is not null
  union select t->>'parentId' from branch b,jsonb_array_elements(p_teams) t where t->>'id'=b.id and t->>'parentId' is not null
 ) select id from branch;
$$;
create or replace function public.fb_member_group_tree(p_direct jsonb,p_team text,p_nodes jsonb,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select * from public.fb_effective_groups(p_direct||(
  select coalesce(jsonb_agg(g->>'id'),'[]') from jsonb_array_elements(p_nodes) g
  where coalesce(g->'legacyDirectTeamIds','[]') ? public.fb_reporting_team_id(p_team,p_teams) or exists(
   select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
   where t=public.fb_reporting_team_id(p_team,p_teams) or t in(select id from public.fb_team_ancestors(p_team,p_teams))
  )
 ),p_nodes);
$$;
-- Preserve additive learning projections from compatible releases. Refuse an
-- unexpected scope implementation instead of replacing unrelated function work.
do $$
declare definition text; old_predicate text := 'p.team_id in(select id from allowed)';
begin
 select pg_get_functiondef('public.fb_governance_snapshot(uuid)'::regprocedure) into definition;
 if strpos(definition,old_predicate)=0 then
  raise exception 'Reporting scope changed. Reconcile the Organization upgrade with this release';
 end if;
 execute replace(definition,old_predicate,'public.fb_reporting_team_id(p.team_id,(select teams from cfg)) in(select id from allowed)');
end $$;

revoke all on function public.fb_reporting_team_id(text,jsonb) from public,anon,authenticated;
grant execute on function public.fb_reporting_team_id(text,jsonb) to service_role;
-- Reconcile newly gained Organization-linked learning at the time of this change.
-- The episode reconciler retains every continuously assigned deadline and history.
select public.fb_sync_learning();
update public.fb_config set governance_revision=governance_revision+1 where id;
commit;
-- End 20261002184642_organization_membership.sql

-- Begin 20261002210106_combined_assignment_organization.sql
-- Combined successor for flat Groups, typed Team/Group course sources and Organization.
-- Apply after the direct-assignment, built-in-root and root-membership migrations.
-- This supports both fresh filename order and previously upgraded installations.
-- Coordinate the matching application; older writers cannot preserve these contracts.
begin;
set local lock_timeout = '5s';
select id from public.fb_config where id for update;
create temporary table fb_combined_config_before on commit drop as select * from public.fb_config where id;
create temporary table fb_combined_people_before on commit drop as select * from public.fb_profiles;
create temporary table fb_combined_progress_before on commit drop as select * from public.fb_progress;
create temporary table fb_combined_episodes_before on commit drop as select * from public.fb_assignment_episodes;
create temporary table fb_combined_documents_before on commit drop as select * from public.fb_documents;
create temporary table fb_combined_coverage_before on commit drop as select * from public.fb_assignment_coverage();
create or replace function public.fb_effective_groups(p_direct jsonb,p_nodes jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select distinct d from jsonb_array_elements_text(p_direct) d where exists(select 1 from jsonb_array_elements(p_nodes) g where g->>'id'=d);
$$;
create or replace function public.fb_reporting_team_id(p_team text,p_teams jsonb) returns text
language sql immutable set search_path='' as $$
 select coalesce(nullif(p_team,''),(select t->>'id' from jsonb_array_elements(p_teams) t where t->>'system'='organization'));
$$;
create or replace function public.fb_team_ancestors(p_team text,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 with recursive branch(id) as (
  select public.fb_reporting_team_id(p_team,p_teams) where public.fb_reporting_team_id(p_team,p_teams) is not null
  union select t->>'parentId' from branch b,jsonb_array_elements(p_teams) t where t->>'id'=b.id and t->>'parentId' is not null
 ) select id from branch;
$$;
create or replace function public.fb_member_group_tree(p_direct jsonb,p_team text,p_nodes jsonb,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select * from public.fb_effective_groups(p_direct||(
  select coalesce(jsonb_agg(g->>'id'),'[]') from jsonb_array_elements(p_nodes) g
  where coalesce(g->'legacyDirectTeamIds','[]') ? public.fb_reporting_team_id(p_team,p_teams) or exists(
   select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
   where t=public.fb_reporting_team_id(p_team,p_teams) or t in(select id from public.fb_team_ancestors(p_team,p_teams))
  )
 ),p_nodes);
$$;
create or replace function public.fb_validate_learning(p_groups jsonb,p_teams jsonb,p_curricula jsonb) returns void
language plpgsql set search_path='' as $$
declare g jsonb; old jsonb; a jsonb; i jsonb; old_items jsonb; nodes jsonb; kind text;
begin
 perform public.fb_validate_learning_sources(p_groups,p_teams,p_curricula);
 perform public.fb_validate_organization((select settings from public.fb_config where id),p_teams,(select settings from public.fb_config where id),(select teams from public.fb_config where id));
 -- Same deletion rule for preserved direct sources as canonical subtree links:
 -- first remove the source in one save, then delete its referenced team.
 if exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) n,jsonb_array_elements_text(coalesce(n->'legacyDirectTeamIds','[]')) t where not exists(select 1 from jsonb_array_elements(p_teams) x where x->>'id'=t)) then raise exception 'Remove learning-group links before deleting a team'; end if;
 for g in select * from jsonb_array_elements(p_groups) loop
  if g->>'parentId' is not null then raise exception 'Learning groups are independent audiences and cannot have parents'; end if;
  if g->>'teamLinkScope'='direct' then raise exception 'Legacy learning links changed. Reload with the matching application'; end if;
  if jsonb_typeof(coalesce(g->'legacyDirectTeamIds','[]')) is distinct from 'array' then raise exception 'Invalid legacy team links'; end if;
  select n into old from public.fb_config c,jsonb_array_elements(c.groups) n where n->>'id'=g->>'id';
  if jsonb_array_length(coalesce(old->'legacyDirectTeamIds','[]'))>0 and g->'legacyDirectTeamIds' is null then raise exception 'Learning links changed. Reload with the matching application'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')) t where not coalesce(old->'legacyDirectTeamIds','[]') ? t) then raise exception 'New team links include all subteams'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')||coalesce(g->'teamIds','[]')) t group by t having count(*)>1) then raise exception 'Duplicate team link'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')) t where not exists(select 1 from jsonb_array_elements(p_teams) x where x->>'id'=t)) then raise exception 'Team does not exist'; end if;
 end loop;
 foreach kind in array array['group','team'] loop
  nodes:=case when kind='group' then p_groups else p_teams end;
  for a in select * from jsonb_array_elements(nodes) loop
   if jsonb_typeof(coalesce(a->'learningItems','[]'))<>'array' or jsonb_array_length(coalesce(a->'learningItems','[]'))>1000 then raise exception 'Invalid learning plan'; end if;
   if exists(select 1 from jsonb_array_elements(coalesce(a->'learningItems','[]')) item group by item->>'kind',item->>'id' having count(*)>1) then raise exception 'Duplicate learning item'; end if;
   select coalesce(n->'learningItems','[]') into old_items from public.fb_config c,jsonb_array_elements(case when kind='group' then c.groups else c.teams end) n where n->>'id'=a->>'id';
   for i in select * from jsonb_array_elements(coalesce(a->'learningItems','[]')) loop
    if i->>'kind'='course' then
     if not exists(select 1 from public.fb_documents d where d.id::text=i->>'id' and d.draft->>'kind'='course' and ((d.deleted_at is null and d.published is not null) or coalesce(old_items,'[]') @> jsonb_build_array(i))) then raise exception 'Choose a published course'; end if;
    elsif i->>'kind'='curriculum' then
     if not exists(select 1 from jsonb_array_elements(p_curricula) c where c->>'id'=i->>'id' and c->>'status'='published') then raise exception 'Choose a published curriculum'; end if;
    else raise exception 'Invalid learning item'; end if;
   end loop;
  end loop;
 end loop;
end $$;
create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active and auth_user_id is not null),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role in ('manager','contributor') and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role in ('manager','contributor') and p.active and public.fb_reporting_team_id(p.team_id,(select teams from cfg)) in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)||public.fb_profile_learning(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;

-- Validate the installed contracts without rewriting any content or obligation.
select public.fb_validate_learning(groups,teams,curricula) from public.fb_config where id;
update public.fb_config set governance_revision=governance_revision+1 where id;
do $$ declare before_cfg public.fb_config; after_cfg public.fb_config;
begin
 select * into before_cfg from fb_combined_config_before;
 select * into after_cfg from public.fb_config where id;
 if to_jsonb(after_cfg)-'governance_revision' is distinct from to_jsonb(before_cfg)-'governance_revision' or after_cfg.governance_revision<>before_cfg.governance_revision+1 then raise exception 'Combined upgrade changed configuration beyond its governance revision'; end if;
 if exists((select * from fb_combined_people_before except select * from public.fb_profiles) union all (select * from public.fb_profiles except select * from fb_combined_people_before)) then raise exception 'Combined upgrade changed people'; end if;
 if exists((select * from fb_combined_progress_before except select * from public.fb_progress) union all (select * from public.fb_progress except select * from fb_combined_progress_before)) then raise exception 'Combined upgrade changed progress'; end if;
 if exists((select * from fb_combined_episodes_before except select * from public.fb_assignment_episodes) union all (select * from public.fb_assignment_episodes except select * from fb_combined_episodes_before)) then raise exception 'Combined upgrade changed assignment history or deadlines'; end if;
 if exists((select * from fb_combined_documents_before except select * from public.fb_documents) union all (select * from public.fb_documents except select * from fb_combined_documents_before)) then raise exception 'Combined upgrade changed content'; end if;
 if exists((select * from fb_combined_coverage_before except select * from public.fb_assignment_coverage()) union all (select * from public.fb_assignment_coverage() except select * from fb_combined_coverage_before)) then raise exception 'Combined upgrade changed effective learning coverage'; end if;
end $$;
revoke all on function public.fb_effective_groups(jsonb,jsonb),public.fb_reporting_team_id(text,jsonb),public.fb_team_ancestors(text,jsonb),public.fb_member_group_tree(jsonb,text,jsonb,jsonb),public.fb_validate_learning(jsonb,jsonb,jsonb),public.fb_governance_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.fb_effective_groups(jsonb,jsonb),public.fb_reporting_team_id(text,jsonb),public.fb_team_ancestors(text,jsonb),public.fb_member_group_tree(jsonb,text,jsonb,jsonb),public.fb_validate_learning(jsonb,jsonb,jsonb),public.fb_governance_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
commit;
-- End 20261002210106_combined_assignment_organization.sql

-- Begin 20261002214011_combined_governance_safeguards.sql
-- Apply after the combined assignment/Organization successor.
-- Flat conversion may follow typed assignments on an existing installation.
-- Restore their governance save safeguards without replacing the final validator.
begin;
set local lock_timeout = '5s';
lock table public.fb_config in share row exclusive mode;
select id from public.fb_config where id for update;
-- Refuse an incomplete rollout rather than restoring saves over an older validator.
do $$ begin
 if strpos(pg_get_functiondef('public.fb_validate_learning(jsonb,jsonb,jsonb)'::regprocedure),'public.fb_validate_organization(')=0 then
  raise exception 'Apply the combined assignment/Organization successor before its governance safeguards';
 end if;
end $$;

create temporary table fb_safeguards_config_before on commit drop as select * from public.fb_config where id;
create temporary table fb_safeguards_people_before on commit drop as select * from public.fb_profiles;
create temporary table fb_safeguards_progress_before on commit drop as select * from public.fb_progress;
create temporary table fb_safeguards_episodes_before on commit drop as select * from public.fb_assignment_episodes;
create temporary table fb_safeguards_documents_before on commit drop as select * from public.fb_documents;
create temporary table fb_safeguards_coverage_before on commit drop as select * from public.fb_assignment_coverage();
-- Fail closed if an operator has omitted the final flat/root prerequisite.
select public.fb_validate_learning(groups,teams,curricula) from public.fb_config where id;
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare previous text:=coalesce(current_setting('fieldbook.learning_batch',true),''); cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  perform set_config('fieldbook.learning_batch','on',true);
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    -- Preregistration creates a person; later edits/deletion use its stable ID.
    if coalesce((p_data->>'revoke')::boolean,false) then raise exception 'Use recoverable person deletion'; end if;
    if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'A person already uses that email'; end if;
    if exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'Account is pending deletion'; end if;
    if p_data->>'role' not in ('learner','manager','admin','contributor') then raise exception 'Invalid role'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
    if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
    select coalesce(jsonb_object_agg(g,stamp),'{}') into direct_dates from jsonb_array_elements_text(p_data->'groups') g;
    select coalesce(jsonb_object_agg(g.id,stamp),'{}') into effective_dates from public.fb_member_groups(p_data->'groups',p_data->>'teamId',cfg.groups) g;
    insert into public.fb_profiles(id,email,name,role,groups,team_id,hire_date,group_joined_at,effective_group_joined_at)
    values(gen_random_uuid(),lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'hireDate')::date,direct_dates,effective_dates);
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if jsonb_array_length(coalesce(n->'learningItems','[]'))>0 then raise exception 'Remove assigned learning before deleting a team'; end if;
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_group_tree(u->'groups',u->>'teamId',p_data->'groups',p_data->'teams') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin','contributor')) then raise exception 'Team managers must be active managers, contributors or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;

  else raise exception 'Unknown governance operation'; end if;
  perform public.fb_sync_learning();
  perform set_config('fieldbook.learning_batch',previous,true);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;
-- Invalidate pending governance saves; all saved configuration values remain fixed.
update public.fb_config set governance_revision=governance_revision+1 where id;
do $$ declare before_cfg public.fb_config; after_cfg public.fb_config;
begin
 select * into before_cfg from fb_safeguards_config_before;
 select * into after_cfg from public.fb_config where id;
 if to_jsonb(after_cfg)-'governance_revision' is distinct from to_jsonb(before_cfg)-'governance_revision' or after_cfg.governance_revision<>before_cfg.governance_revision+1 then raise exception 'Governance safeguards upgrade changed configuration beyond its governance revision'; end if;
 if exists((select * from fb_safeguards_people_before except select * from public.fb_profiles) union all (select * from public.fb_profiles except select * from fb_safeguards_people_before)) then raise exception 'Governance safeguards upgrade changed people'; end if;
 if exists((select * from fb_safeguards_progress_before except select * from public.fb_progress) union all (select * from public.fb_progress except select * from fb_safeguards_progress_before)) then raise exception 'Governance safeguards upgrade changed progress'; end if;
 if exists((select * from fb_safeguards_episodes_before except select * from public.fb_assignment_episodes) union all (select * from public.fb_assignment_episodes except select * from fb_safeguards_episodes_before)) then raise exception 'Governance safeguards upgrade changed assignment history or deadlines'; end if;
 if exists((select * from fb_safeguards_documents_before except select * from public.fb_documents) union all (select * from public.fb_documents except select * from fb_safeguards_documents_before)) then raise exception 'Governance safeguards upgrade changed content'; end if;
 if exists((select * from fb_safeguards_coverage_before except select * from public.fb_assignment_coverage()) union all (select * from public.fb_assignment_coverage() except select * from fb_safeguards_coverage_before)) then raise exception 'Governance safeguards upgrade changed effective learning coverage'; end if;
end $$;

revoke all on function public.fb_save_governance(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.fb_save_governance(uuid,integer,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
-- End 20261002214011_combined_governance_safeguards.sql

-- Begin 20261002222314_mcp_catalog.sql
-- Complete publisher catalog and ready-media listing, with bounded keyset pages.
-- Additive service-only functions; no existing documents, grants or shared functions change.
begin;
create function public.fb_mcp_catalog(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare q text:=coalesce(p_input->>'query',''); k text:=coalesce(p_input->>'kind','all');
 n integer:=coalesce((p_input->>'limit')::integer,50); token jsonb; last_date timestamptz; last_id uuid;
 page jsonb; tail jsonb; more boolean;
begin
 perform public.fb_require_publisher(p_actor);
 if length(q)>200 or k not in ('all','doc','brief','course') or n not between 1 and 100 then raise exception 'Invalid catalog request'; end if;
 if p_input->>'cursor' is not null then
  begin token:=(p_input->>'cursor')::jsonb;
   if token->>'actor' is distinct from p_actor::text or token->>'query' is distinct from q or token->>'kind' is distinct from k or token->>'version'<>'1' then raise exception 'Invalid cursor'; end if;
   last_date:=(token->>'date')::timestamptz; last_id:=(token->>'id')::uuid;
   if last_date is null or last_id is null then raise exception 'Invalid cursor'; end if;
  exception when others then raise exception 'Invalid cursor'; end;
 end if;
 select coalesce(jsonb_agg(row_value order by updated_at desc,id desc),'[]') into page from (
  select d.id,d.updated_at,jsonb_build_object('id',d.id,'title',d.draft->>'title','summary',d.draft->>'summary','kind',d.draft->>'kind',
   'revision',d.revision,'status',d.draft->>'status','published',d.published is not null,'date',d.updated_at) row_value
  from public.fb_documents d where d.deleted_at is null
   and (k='all' or d.draft->>'kind'=k)
   and (last_id is null or (d.updated_at,d.id)<(last_date,last_id))
   and (q='' or position(lower(q) in lower(concat(d.draft->>'title',' ',d.draft->>'summary',' ',d.draft->>'body',' ',
    (select string_agg(concat(l->>'title',' ',l->>'body'),' ') from jsonb_array_elements(coalesce(d.draft->'lessons','[]')) l))))>0)
  order by d.updated_at desc,d.id desc limit n+1
 ) rows;
 more:=jsonb_array_length(page)>n;
 if more then page:=page-(jsonb_array_length(page)-1); end if;
 tail:=page->(jsonb_array_length(page)-1);
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item-'date'),'[]') from jsonb_array_elements(page) item),
  'complete',not more,'nextCursor',case when more then jsonb_build_object('actor',p_actor,'query',q,'kind',k,'version',1,'date',tail->'date','id',tail->'id')::text else null end);
end $$;

create function public.fb_mcp_media(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare q text:=coalesce(p_input->>'query',''); t text:=coalesce(p_input->>'type','all');
 n integer:=coalesce((p_input->>'limit')::integer,50); token jsonb; last_date timestamptz; last_id uuid;
 page jsonb; tail jsonb; more boolean;
begin
 perform public.fb_require_publisher(p_actor);
 if length(q)>200 or t not in ('all','image','video') or n not between 1 and 100 then raise exception 'Invalid media request'; end if;
 if p_input->>'cursor' is not null then
  begin token:=(p_input->>'cursor')::jsonb;
   if token->>'actor' is distinct from p_actor::text or token->>'query' is distinct from q or token->>'type' is distinct from t or token->>'version'<>'1' then raise exception 'Invalid cursor'; end if;
   last_date:=(token->>'date')::timestamptz; last_id:=(token->>'id')::uuid;
   if last_date is null or last_id is null then raise exception 'Invalid cursor'; end if;
  exception when others then raise exception 'Invalid cursor'; end;
 end if;
 select coalesce(jsonb_agg(row_value order by created_at desc,id desc),'[]') into page from (
  select m.id,m.created_at,jsonb_build_object('id',m.id,'name',m.filename,'type',m.mime,'bytes',m.bytes,
   'url','/api/media/'||split_part(m.path,'/',2),'date',m.created_at) row_value
  from public.fb_media m where m.ready
   and (t='all' or split_part(m.mime,'/',1)=t)
   and (q='' or position(lower(q) in lower(m.filename))>0)
   and (last_id is null or (m.created_at,m.id)<(last_date,last_id))
  order by m.created_at desc,m.id desc limit n+1
 ) rows;
 more:=jsonb_array_length(page)>n;
 if more then page:=page-(jsonb_array_length(page)-1); end if;
 tail:=page->(jsonb_array_length(page)-1);
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item-'date'),'[]') from jsonb_array_elements(page) item),
  'complete',not more,'nextCursor',case when more then jsonb_build_object('actor',p_actor,'query',q,'type',t,'version',1,'date',tail->'date','id',tail->'id')::text else null end);
end $$;
revoke all on function public.fb_mcp_catalog(uuid,jsonb),public.fb_mcp_media(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fb_mcp_catalog(uuid,jsonb),public.fb_mcp_media(uuid,jsonb) to service_role;
commit;
-- End 20261002222314_mcp_catalog.sql

-- Begin 20261002222344_mcp_connection_capabilities.sql
-- Consent is application policy; OIDC identity scopes do not grant Fieldbook tools.
-- The default preserves the original deployed admin consent during rolling upgrades.
begin;
alter table public.fb_mcp_grants
  add column capabilities text[] not null default array['content:read','content:write','media:read','reports:aggregate']::text[],
  add column capability_version integer not null default 0,
  add column role_at_consent text not null default 'admin' check(role_at_consent in ('admin','contributor','manager'));
alter table public.fb_mcp_grants add constraint fb_mcp_grants_capabilities_check
  check (capabilities <@ array['content:read','content:write','content:assign','media:read','media:write','reports:aggregate','reports:read','feedback:read']::text[]
    and array_position(capabilities,null) is null and capability_version in (0,1));
-- Earlier code allowed only admins to approve a connection. Any unexpected
-- non-admin legacy row is disabled instead of acquiring publishing permissions.
update public.fb_mcp_grants g set enabled=false
from public.fb_profiles p where p.id=g.user_id and p.role<>'admin';

-- Privileged application adapter only. Check current roster linkage, role and
-- reporting responsibility in the same database transaction as the consent write.
create function public.fb_enable_mcp_grant(p_person uuid,p_client text,p_name text,p_capabilities text[],p_require_enabled boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.fb_profiles; available text[]; managed boolean;
begin
  select * into p from public.fb_profiles where id=p_person for update;
  if not found or not p.active or p.deleted_at is not null or p.auth_user_id is null or p.role='learner' then
    raise exception 'Active administrator, contributor or scoped manager access required';
  end if;
  select exists(select 1 from public.fb_config c,jsonb_array_elements(c.teams) t where t->>'managerId'=p_person::text) into managed;
  if p.role='admin' then
    available:=array['content:read','content:write','content:assign','media:read','media:write','reports:aggregate','reports:read','feedback:read'];
  elsif p.role='contributor' then
    available:=array['content:read','content:write','media:read','media:write','feedback:read'];
    if managed then available:=array_append(available,'reports:read'); end if;
  elsif p.role='manager' and managed then available:=array['reports:read'];
  else raise exception 'An explicitly managed reporting team is required';
  end if;
  if p_client is null or length(p_client) not between 1 and 200 or p_name is null or length(p_name) not between 1 and 200
    or p_capabilities is null or cardinality(p_capabilities)=0
    or array_position(p_capabilities,null) is not null or not (p_capabilities <@ available) then
    raise exception 'Invalid or unavailable MCP permissions';
  end if;
  if p_require_enabled then
    perform 1 from public.fb_mcp_grants where user_id=p_person and client_id=p_client and enabled for update;
    if not found then raise exception 'Connection has been revoked; reconnect before granting permissions'; end if;
  end if;
  insert into public.fb_mcp_grants(user_id,client_id,client_name,enabled,granted_at,capabilities,capability_version,role_at_consent)
  values(p_person,p_client,p_name,true,now(),p_capabilities,1,p.role)
  on conflict(user_id,client_id) do update set client_name=excluded.client_name,enabled=true,
    granted_at=excluded.granted_at,capabilities=excluded.capabilities,capability_version=1,role_at_consent=excluded.role_at_consent;
end $$;
revoke all on function public.fb_enable_mcp_grant(uuid,text,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.fb_enable_mcp_grant(uuid,text,text,text[],boolean) to service_role;
commit;
-- End 20261002222344_mcp_connection_capabilities.sql

-- Begin 20261002222355_mcp_scoped_reports.sql
-- New, service-only reporting operations. These do not replace shared governance
-- functions or change people, content, progress, assignments or saved deadlines.
begin;
set local lock_timeout = '5s';

create function public.fb_mcp_report_teams(p_actor uuid) returns table(id text)
language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.fb_profiles p where p.id=p_actor and p.active and p.deleted_at is null and p.auth_user_id is not null and p.role in ('admin','manager','contributor')) then
  raise exception using errcode='42501',message='Reporting access is required';
 end if;
 return query with recursive me as(select p.role from public.fb_profiles p where p.id=p_actor),
 nodes as(select n from public.fb_config c,jsonb_array_elements(c.teams) n where c.id),
 allowed(team_id) as(
  select n->>'id' from nodes,me where me.role='admin' or n->>'managerId'=p_actor::text
  union select n->>'id' from nodes join allowed a on n->>'parentId'=a.team_id
 ) select team_id from allowed;
 if not exists(select 1 from public.fb_profiles p where p.id=p_actor and p.role='admin') and not found then
  raise exception using errcode='42501',message='An explicitly managed reporting team is required';
 end if;
end $$;

create function public.fb_mcp_reporting_scopes(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare allowed text[]; cfg public.fb_config; organization boolean;
begin
 select coalesce(array_agg(id),'{}') into allowed from public.fb_mcp_report_teams(p_actor);
 select * into cfg from public.fb_config where id;
 select role='admin' into organization from public.fb_profiles where id=p_actor;
 return jsonb_build_object(
  'organizationWide',organization,
  'teams',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',n->>'id','name',n->>'name','parentId',case when n->>'parentId'=any(allowed) then n->>'parentId' end)) order by n->>'name',n->>'id') from jsonb_array_elements(cfg.teams) n where n->>'id'=any(allowed)),'[]'),
  -- Group names are discovery metadata only; team links and member lists stay private.
  'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g->>'id','name',g->>'name') order by g->>'name',g->>'id') from jsonb_array_elements(cfg.groups) g where organization or exists(
   select 1 from public.fb_profiles p,public.fb_member_group_tree(p.groups,p.team_id,cfg.groups,cfg.teams) m
   where p.active and p.deleted_at is null and public.fb_reporting_team_id(p.team_id,cfg.teams)=any(allowed) and m.id=g->>'id'
  )),'[]'),
  'courses',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.published->>'title','version',(d.published->>'version')::integer) order by d.published->>'title',d.id) from public.fb_documents d where d.deleted_at is null and d.published->>'kind'='course'),'[]')
 );
end $$;

create function public.fb_mcp_learning_report(p_actor uuid,p_input jsonb,
 p_after_person uuid default null,p_after_course uuid default null,p_expected_fingerprint text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare allowed text[]; cfg public.fb_config; organization boolean; team_filter text[]; group_filter text[]; course_filter text[];
 assignment_filter text:=coalesce(p_input->>'assignment','assigned'); status_filter text:=coalesce(p_input->>'status','all');
 page_limit integer:=coalesce((p_input->>'limit')::integer,50); day date:=(current_timestamp at time zone 'UTC')::date;
 result jsonb; fingerprint text; k text;
begin
 select coalesce(array_agg(id),'{}') into allowed from public.fb_mcp_report_teams(p_actor);
 select * into cfg from public.fb_config where id;
 select role='admin' into organization from public.fb_profiles where id=p_actor;
 if jsonb_typeof(p_input) is distinct from 'object' or page_limit not between 1 and 100 or assignment_filter not in ('all','assigned','optional') or status_filter not in ('all','not_started','in_progress','complete','overdue') or (p_after_person is null)<>(p_after_course is null) then
  raise exception using errcode='22023',message='Invalid report filters';
 end if;
 foreach k in array array['teamIds','groupIds','courseIds'] loop
  if p_input ? k and (jsonb_typeof(p_input->k) is distinct from 'array' or jsonb_array_length(p_input->k)>100) then
   raise exception using errcode='22023',message='Invalid report filter array';
  end if;
 end loop;
 select coalesce(array_agg(x),'{}') into team_filter from jsonb_array_elements_text(coalesce(p_input->'teamIds','[]')) x;
 select coalesce(array_agg(x),'{}') into group_filter from jsonb_array_elements_text(coalesce(p_input->'groupIds','[]')) x;
 select coalesce(array_agg(x),'{}') into course_filter from jsonb_array_elements_text(coalesce(p_input->'courseIds','[]')) x;
 if exists(select 1 from unnest(team_filter) t where not t=any(allowed)) then
  raise exception using errcode='42501',message='Requested team is outside reporting access';
 end if;
 if exists(select 1 from unnest(group_filter) g where not exists(
  select 1 from jsonb_array_elements(cfg.groups) n where n->>'id'=g and (organization or exists(
   select 1 from public.fb_profiles p,public.fb_member_group_tree(p.groups,p.team_id,cfg.groups,cfg.teams) m
   where p.active and p.deleted_at is null and public.fb_reporting_team_id(p.team_id,cfg.teams)=any(allowed) and m.id=g
  ))
 )) then raise exception using errcode='42501',message='Requested group is outside reporting access'; end if;
 if exists(select 1 from unnest(course_filter) c where not exists(select 1 from public.fb_documents d where d.id::text=c and d.deleted_at is null and d.published->>'kind'='course')) then
  raise exception using errcode='22023',message='Requested course is unavailable';
 end if;

 with people as materialized(
  -- Scope people in the database before joining any progress or assignments.
  -- Do not add the actor's own row unless it lies in the reporting branches.
  select p.id,p.name,public.fb_reporting_team_id(p.team_id,cfg.teams) team_id,
   (select coalesce(jsonb_agg(jsonb_build_object('id',g->>'id','name',g->>'name') order by g->>'id'),'[]') from jsonb_array_elements(cfg.groups) g where g->>'id' in(select id from public.fb_member_group_tree(p.groups,p.team_id,cfg.groups,cfg.teams))) memberships
  from public.fb_profiles p where p.active and p.deleted_at is null
   and (organization or public.fb_reporting_team_id(p.team_id,cfg.teams)=any(allowed))
   and (cardinality(team_filter)=0 or exists(select 1 from public.fb_team_ancestors(p.team_id,cfg.teams) a where a.id=any(team_filter)))
   and (cardinality(group_filter)=0 or exists(select 1 from public.fb_member_group_tree(p.groups,p.team_id,cfg.groups,cfg.teams) g where g.id=any(group_filter)))
 ), courses as materialized(
  select d.id,(d.published->>'version')::integer version,d.published->>'title' title,coalesce(d.published->>'category','') category,
   (select coalesce(jsonb_agg(l->>'id'),'[]') from jsonb_array_elements(coalesce(d.published->'lessons','[]')) l) lesson_ids
  from public.fb_documents d where d.deleted_at is null and d.published->>'kind'='course' and (cardinality(course_filter)=0 or d.id::text=any(course_filter))
 ), candidates as(
  select p.*,c.id course_id,c.title,c.category,c.version,c.lesson_ids,e.id episode_id,e.started_at,e.due_date,e.catch_up_days,e.onboarding_end,e.source_groups,e.source_audiences,e.baseline,
   coalesce(r.lessons,'[]') lessons,coalesce(r.passed,false) passed,jsonb_array_length(coalesce(r.attempts,'[]')) attempt_count,
   coalesce(r.passed,false) and not exists(select 1 from jsonb_array_elements_text(c.lesson_ids) l where not coalesce(r.lessons,'[]') ? l) completed,
   coalesce(r.passed,false) or jsonb_array_length(coalesce(r.attempts,'[]'))>0 or exists(select 1 from jsonb_array_elements_text(c.lesson_ids) l where coalesce(r.lessons,'[]') ? l) started
  from people p cross join courses c
  left join public.fb_assignment_episodes e on e.user_id=p.id and e.content_id=c.id and e.version=c.version and e.ended_at is null
  left join public.fb_progress r on r.user_id=p.id and r.content_id=c.id and r.version=c.version
 ), classified as(
  select *,case when completed then 'complete' when episode_id is not null and coalesce((cfg.settings->>'dueDatesEnabled')::boolean,true) and due_date<day then 'overdue' when started then 'in_progress' else 'not_started' end learning_status
  from candidates where (episode_id is not null or started) and (assignment_filter='all' or (assignment_filter='assigned' and episode_id is not null) or (assignment_filter='optional' and episode_id is null))
 ), full_rows as materialized(
  select * from classified where status_filter='all' or learning_status=status_filter
 ), page as(select * from full_rows where p_after_person is null or (id,course_id)>(p_after_person,p_after_course) order by id,course_id limit page_limit),
 projected_page as(
  select id person_id,course_id,episode_id,learning_status,
   jsonb_build_object('personId',id,'personName',name,'teamId',team_id,'teamName',coalesce((select n->>'name' from jsonb_array_elements(cfg.teams) n where n->>'id'=team_id),'No team'),'groups',memberships,
    'course',jsonb_build_object('id',course_id,'title',title,'category',category,'version',version,'lessonIds',lesson_ids),
    'assignment',case when episode_id is not null then jsonb_build_object('episodeId',episode_id,'contentId',course_id,'version',version,'assignedAt',to_char(started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'dueDate',due_date,'catchUpDays',catch_up_days,'onboardingEnd',onboarding_end,'sourceGroups','[]'::jsonb,'sourceAudiences','[]'::jsonb,'baseline',baseline) else null end,
    'sources',(select coalesce(jsonb_agg(jsonb_build_object('kind',s->>'kind','id',case when s->>'kind'='group' or s->>'id'=any(allowed) then s->>'id' end,
     'name',case when s->>'kind'='group' then coalesce((select n->>'name' from jsonb_array_elements(cfg.groups) n where n->>'id'=s->>'id'),'Removed learning group')
       when s->>'id'=any(allowed) then coalesce((select n->>'name' from jsonb_array_elements(cfg.teams) n where n->>'id'=s->>'id'),'Removed team') else 'Inherited team assignment' end) order by s->>'kind',s->>'id'),'[]') from jsonb_array_elements(coalesce(source_audiences,'[]')) s),
    'progress',jsonb_build_object('lessons',lessons,'passed',passed,'attemptCount',attempt_count),'status',learning_status
   ) row
  from page
 ), fingerprint as(select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by r.id,r.course_id),'')||cfg.governance_revision::text||day::text||organization::text||coalesce((cfg.settings->>'dueDatesEnabled'),'true')) value from full_rows r)
 select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(row order by person_id,course_id) from projected_page),'[]'),
  'total',(select count(*) from full_rows),'asOf',day,'dueDatesEnabled',coalesce((cfg.settings->>'dueDatesEnabled')::boolean,true),
  'fingerprint',(select value from fingerprint),
  'hasMore',(select count(*)>page_limit from full_rows where p_after_person is null or (id,course_id)>(p_after_person,p_after_course)),
  'totals',jsonb_build_object(
   'assigned',(select jsonb_build_object('total',count(*),'complete',count(*) filter(where learning_status='complete'),'overdue',count(*) filter(where learning_status='overdue'),'not_started',count(*) filter(where learning_status='not_started'),'in_progress',count(*) filter(where learning_status='in_progress')) from full_rows where episode_id is not null),
   'optional',(select jsonb_build_object('total',count(*),'complete',count(*) filter(where learning_status='complete'),'not_started',count(*) filter(where learning_status='not_started'),'in_progress',count(*) filter(where learning_status='in_progress')) from full_rows where episode_id is null)
  )
 ) into result;
 fingerprint:=result->>'fingerprint';
 if p_expected_fingerprint is not null and p_expected_fingerprint is distinct from fingerprint then
  raise exception using errcode='40001',message='Report changed during pagination';
 end if;
 return result;
end $$;

create function public.fb_mcp_feedback_report(p_actor uuid,p_input jsonb,p_after uuid default null,p_expected_fingerprint text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare kind_filter text:=coalesce(p_input->>'kind','all'); rating_filter text:=coalesce(p_input->>'rating','all');
 content_filter text:=p_input->>'contentId'; page_limit integer:=coalesce((p_input->>'limit')::integer,50); result jsonb;
begin
 -- Publishers may review feedback names/comments, never learner course progress,
 -- email addresses, authentication identifiers, guest keys or quiz answers.
 if not exists(select 1 from public.fb_profiles p where p.id=p_actor and p.active and p.auth_user_id is not null and p.deleted_at is null and p.role in ('admin','contributor')) then
  raise exception using errcode='42501',message='Publisher access is required';
 end if;
 if jsonb_typeof(p_input) is distinct from 'object' or kind_filter not in ('all','doc','brief','course','general') or rating_filter not in ('all','up','down') or page_limit not between 1 and 100 then
  raise exception using errcode='22023',message='Invalid feedback report filters';
 end if;
 with full_rows as materialized(
  select f.id,jsonb_build_object('id',f.id,'contentId',f.content_id,'version',f.version,'rating',f.rating,'comment',f.comment,'updatedAt',f.updated_at,
   'person',case when f.user_id is null then 'Guest visitor' else coalesce(p.name,'Former user') end,
   'title',case when f.content_id is null then 'Fieldbook feedback' else coalesce(d.draft->>'title',d.published->>'title','Removed content') end,
   'kind',case when f.content_id is null then 'general' else coalesce(d.draft->>'kind',d.published->>'kind','removed') end
  ) row
  from public.fb_feedback f left join public.fb_profiles p on p.id=f.user_id left join public.fb_documents d on d.id=f.content_id
  where (rating_filter='all' or f.rating=rating_filter) and (content_filter is null or f.content_id::text=content_filter)
   and (kind_filter='all' or (kind_filter='general' and f.content_id is null) or coalesce(d.draft->>'kind',d.published->>'kind')=kind_filter)
 ), page as(select * from full_rows where p_after is null or id>p_after order by id limit page_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(row order by id) from page),'[]'),
  'total',(select count(*) from full_rows),'fingerprint',(select md5(coalesce(string_agg(row::text,',' order by id),'')) from full_rows),
  'hasMore',(select count(*)>page_limit from full_rows where p_after is null or id>p_after)) into result;
 if p_expected_fingerprint is not null and p_expected_fingerprint is distinct from result->>'fingerprint' then
  raise exception using errcode='40001',message='Feedback changed during pagination';
 end if;
 return result;
end $$;

revoke all on function public.fb_mcp_report_teams(uuid),public.fb_mcp_reporting_scopes(uuid),public.fb_mcp_learning_report(uuid,jsonb,uuid,uuid,text),public.fb_mcp_feedback_report(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.fb_mcp_report_teams(uuid),public.fb_mcp_reporting_scopes(uuid),public.fb_mcp_learning_report(uuid,jsonb,uuid,uuid,text),public.fb_mcp_feedback_report(uuid,jsonb,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
-- End 20261002222355_mcp_scoped_reports.sql

-- Begin 20261002232135_progress_report.sql
-- Compact, service-only report reads. No existing function or operator data changes.
begin;
set local lock_timeout = '5s';
create function public.fb_progress_report(p_actor uuid, p_person uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare allowed text[]; cfg public.fb_config; organization boolean; result jsonb;
begin
 select coalesce(array_agg(id),'{}') into allowed from public.fb_mcp_report_teams(p_actor);
 select * into cfg from public.fb_config where id;
 select role='admin' into organization from public.fb_profiles where id=p_actor;
 if p_person is not null and not exists(select 1 from public.fb_profiles p where p.id=p_person and p.active and p.deleted_at is null and (organization or public.fb_reporting_team_id(p.team_id,cfg.teams)=any(allowed))) then
  raise exception using errcode='42501',message='This person is outside your current reporting access';
 end if;
 with people as materialized (
  select p.id,p.name,p.email,p.role,p.auth_user_id is not null registered,p.hire_date,p.onboarding_start,p.onboarding_days,public.fb_reporting_team_id(p.team_id,cfg.teams) team_id,
   (select coalesce(jsonb_agg(m.id order by m.id),'[]') from public.fb_member_group_tree(p.groups,p.team_id,cfg.groups,cfg.teams) m) group_ids
  from public.fb_profiles p where p.active and p.deleted_at is null and (organization or public.fb_reporting_team_id(p.team_id,cfg.teams)=any(allowed)) and (p_person is null or p.id=p_person)
 ), courses as materialized (
  select d.id,d.published->>'title' title,coalesce(d.published->>'category','') category,(d.published->>'version')::integer version,
   (select coalesce(jsonb_agg(l->>'id'),'[]') from jsonb_array_elements(coalesce(d.published->'lessons','[]')) l) lesson_ids
  from public.fb_documents d where d.deleted_at is null and d.published->>'kind'='course'
 ), obligations as materialized (
  select p.id person_id,c.*,e.due_date,e.started_at,e.source_audiences,
   coalesce(r.passed,false) and not exists(select 1 from jsonb_array_elements_text(c.lesson_ids) l where not coalesce(r.lessons,'[]') ? l) complete,
   coalesce(r.passed,false) or jsonb_array_length(coalesce(r.attempts,'[]'))>0 or exists(select 1 from jsonb_array_elements_text(c.lesson_ids) l where coalesce(r.lessons,'[]') ? l) started
  from people p join public.fb_assignment_episodes e on e.user_id=p.id and e.ended_at is null
  join courses c on c.id=e.content_id and c.version=e.version
  left join public.fb_progress r on r.user_id=p.id and r.content_id=c.id and r.version=c.version
 ), totals as (
  select person_id,count(*) assigned,count(*) filter(where complete) completed,
   count(*) filter(where not complete and due_date<(now() at time zone 'UTC')::date and coalesce((cfg.settings->>'dueDatesEnabled')::boolean,true)) overdue,bool_or(started) started
  from obligations group by person_id
 ) select jsonb_build_object(
  'asOf',(now() at time zone 'UTC')::date,'revision',cfg.governance_revision,
  'settings',jsonb_build_object('name',coalesce(cfg.settings->>'name','Fieldbook'),'accent',cfg.settings->>'accent','dueDatesEnabled',coalesce((cfg.settings->>'dueDatesEnabled')::boolean,true),'onboardingDays',coalesce((cfg.settings->>'onboardingDays')::integer,90)),
  'teams',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',n->>'id','name',n->>'name','system',n->>'system','managerId',case when n->>'managerId'=p_actor::text then n->>'managerId' end,'parentId',case when n->>'parentId'=any(allowed) then n->>'parentId' end)) order by n->>'name',n->>'id') from jsonb_array_elements(cfg.teams) n where n->>'id'=any(allowed)),'[]'),
  'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g->>'id','name',g->>'name') order by g->>'name',g->>'id') from jsonb_array_elements(cfg.groups) g where organization or exists(select 1 from people p where p.group_ids ? (g->>'id'))),'[]'),
  'people',coalesce((select jsonb_agg(jsonb_build_object('u',jsonb_strip_nulls(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'role',p.role,'active',true,'registered',p.registered,'groups','[]'::jsonb,'teamId',p.team_id,'hireDate',p.hire_date,'onboardingStart',p.onboarding_start,'onboardingDays',p.onboarding_days)),
   'groupIds',p.group_ids,'assigned',coalesce(t.assigned,0),'completed',coalesce(t.completed,0),'overdue',coalesce(t.overdue,0),'started',coalesce(t.started,false)) order by p.id) from people p left join totals t on t.person_id=p.id),'[]'),
  'detail',case when p_person is not null then jsonb_build_object('personId',p_person,'courses',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'category',o.category,'version',o.version,'complete',o.complete,'dueDate',case when coalesce((cfg.settings->>'dueDatesEnabled')::boolean,true) then o.due_date end,'assignedAt',o.started_at,
   'sources',(select coalesce(jsonb_agg(case when s->>'kind'='group' then coalesce((select g->>'name' from jsonb_array_elements(cfg.groups) g where g->>'id'=s->>'id'),'Learning group') when s->>'id'=any(allowed) then coalesce((select t->>'name' from jsonb_array_elements(cfg.teams) t where t->>'id'=s->>'id'),'Team') else 'Inherited team assignment' end order by s->>'kind',s->>'id'),'[]') from jsonb_array_elements(o.source_audiences) s)) order by o.title,o.id) from obligations o),'[]')) else null end
 ) into result;
 return result;
end $$;
revoke all on function public.fb_progress_report(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fb_progress_report(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
-- End 20261002232135_progress_report.sql

-- Begin 20261003140729_roster_csv_import.sql
-- CSV review binds a transient file hash to the authoritative roster, learning and date.
-- No uploaded file, personal-data proposal or Auth account is stored here.
begin;
set local lock_timeout = '5s';
do $$ begin
 if strpos(pg_get_functiondef('public.fb_save_governance(uuid,integer,text,jsonb)'::regprocedure),'fieldbook.learning_batch')=0 or strpos(pg_get_functiondef('public.fb_validate_learning(jsonb,jsonb,jsonb)'::regprocedure),'public.fb_validate_organization(')=0 then
  raise exception 'Apply combined assignment/Organization and governance safeguards before CSV import';
 end if;
end $$;
create table public.fb_roster_import_runs (
 id uuid primary key default gen_random_uuid(),
 actor uuid references public.fb_profiles(id) on delete set null,
 file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
 baseline text not null,
 review_day date not null default (now() at time zone 'UTC')::date,
 reviewed_at timestamptz not null default now(),
 result jsonb
);
alter table public.fb_roster_import_runs enable row level security;
revoke all on public.fb_roster_import_runs from public,anon,authenticated;
grant select,insert,update,delete on public.fb_roster_import_runs to service_role;

create function public.fb_roster_import_fingerprint() returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'config',(select to_jsonb(c) from public.fb_config c where id),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'name',name,'role',role,'active',active,'groups',groups,'team',team_id,'hire',hire_date,'start',onboarding_start,'days',onboarding_days,'auth',auth_user_id,'deleted',deleted_at) order by id) from public.fb_profiles),'[]'),
  'published',coalesce((select jsonb_agg(jsonb_build_object('id',id,'published',published,'deleted',deleted_at) order by id) from public.fb_documents where published is not null),'[]'),
  'deleted',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email) order by id) from public.fb_deleted_items where entity='user'),'[]')
 )::text,'UTF8')),'hex')
$$;
revoke all on function public.fb_roster_import_fingerprint() from public,anon,authenticated;
grant execute on function public.fb_roster_import_fingerprint() to service_role;

create function public.fb_roster_import(p_actor uuid,p_file_hash text,p_run uuid default null,p_data jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.fb_config; run public.fb_roster_import_runs; u jsonb; old public.fb_profiles; n jsonb;
 added integer:=0; changed integer:=0; teams_added integer:=0; teams_changed integer:=0;
 saved jsonb; outcome jsonb; previous text:=coalesce(current_setting('fieldbook.learning_batch',true),'');
begin
 perform set_config('lock_timeout','5s',true);
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid import file'; end if;
 if p_run is null then
  if p_data is not null then raise exception 'Review the file before importing'; end if;
  -- Expire abandoned reviews; committed compact receipts remain available for safe retries.
  delete from public.fb_roster_import_runs where result is null and reviewed_at < now()-interval '1 day';
  insert into public.fb_roster_import_runs(actor,file_hash,baseline) values(p_actor,p_file_hash,public.fb_roster_import_fingerprint()) returning * into run;
 else
  select * into run from public.fb_roster_import_runs where id=p_run for update;
  if not found or run.actor is distinct from p_actor or run.file_hash<>p_file_hash then raise exception 'Import review does not match this file or administrator'; end if;
  -- Permission and exact file/actor are checked before returning a committed receipt.
  if run.result is not null then return jsonb_build_object('id',run.id,'result',run.result); end if;
  lock table public.fb_profiles in share row exclusive mode;
  lock table public.fb_documents in share mode;
  lock table public.fb_deleted_items in share mode;
  if run.reviewed_at < now()-interval '1 day' or run.review_day<>(now() at time zone 'UTC')::date or run.baseline<>public.fb_roster_import_fingerprint() then raise exception 'The organization changed. Review the file again before importing'; end if;
  if p_data is not null then
   if jsonb_typeof(p_data->'users') is distinct from 'array' or jsonb_typeof(p_data->'teams') is distinct from 'array' then raise exception 'Invalid import proposal'; end if;
   perform set_config('fieldbook.learning_batch','on',true);
   for n in select * from jsonb_array_elements(p_data->'teams') loop
    if not exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'id'=n->>'id') then teams_added:=teams_added+1;
    elsif exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'id'=n->>'id' and t is distinct from n) then teams_changed:=teams_changed+1; end if;
   end loop;
   for u in select * from jsonb_array_elements(p_data->'users') loop
    select * into old from public.fb_profiles where id=(u->>'id')::uuid;
    if not found then
     if u->>'role' not in ('learner','manager') or not (u->>'active')::boolean or u->'groups'<>'[]'::jsonb or u->>'onboardingStart' is not null then raise exception 'Invalid new import person'; end if;
     if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(u->>'email'))) or exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(u->>'email'))) then raise exception 'A person already uses that email or is pending deletion'; end if;
     insert into public.fb_profiles(id,email,name,role,hire_date) values((u->>'id')::uuid,lower(trim(u->>'email')),u->>'name',u->>'role',(u->>'hireDate')::date);
     added:=added+1;
    else
     if u->>'email' is distinct from old.email or (u->>'active')::boolean is distinct from old.active or u->'groups' is distinct from old.groups or (u->>'onboardingStart')::date is distinct from old.onboarding_start then raise exception 'Import cannot change login identity, activity, direct groups or recorded start'; end if;
     if u->>'role' is distinct from old.role and not (old.role='learner' and u->>'role'='manager' and exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'managerId'=old.id::text)) then raise exception 'Import cannot remove or replace existing access'; end if;
     if u->>'name' is distinct from old.name or u->>'teamId' is distinct from old.team_id or (u->>'hireDate')::date is distinct from old.hire_date or u->>'role' is distinct from old.role then
      if not old.active or old.deleted_at is not null then raise exception 'Inactive or deleted people cannot be changed by import'; end if;
      changed:=changed+1;
     end if;
    end if;
   end loop;
   -- Reuse the current protected Organization, membership and assignment writer.
   -- It validates the complete roster under this same config lock and reconciles once.
   if added+changed+teams_added+teams_changed>0 then
    saved:=public.fb_save_governance(p_actor,cfg.governance_revision,'save',jsonb_build_object('users',p_data->'users','teams',p_data->'teams','groups',cfg.groups,'curricula',cfg.curricula));
   else saved:=jsonb_build_object('revision',cfg.governance_revision); end if;
   perform set_config('fieldbook.learning_batch',previous,true);
   outcome:=jsonb_build_object('peopleAdded',added,'peopleUpdated',changed,'teamsAdded',teams_added,'teamsUpdated',teams_changed,'revision',(saved->>'revision')::integer,'completedAt',now());
   if added+changed+teams_added+teams_changed>0 then
    -- Replace only this transaction's full-governance audit snapshot with its compact receipt.
    update public.fb_audit set action='roster_import',entity_id=run.id::text,snapshot=outcome where actor=p_actor and action='governance_save' and revision=(saved->>'revision')::integer;
   end if;
   update public.fb_roster_import_runs set result=outcome where id=run.id;
   return jsonb_build_object('id',run.id,'result',outcome);
  end if;
 end if;
 return jsonb_build_object('id',run.id,'day',run.review_day,'baseline',run.baseline);
end $$;
revoke all on function public.fb_roster_import(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fb_roster_import(uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
-- End 20261003140729_roster_csv_import.sql

-- Begin 20261003162418_roster_added_at.sql
-- Record when a person enters this installation, independently of hire date,
-- learning clocks and first sign-in. Historical dates are unknown, not backfilled.
set local lock_timeout = '5s';
alter table public.fb_profiles add column added_at timestamptz;
comment on column public.fb_profiles.added_at is
  'Database-owned roster creation time. Null means the historical time is unknown.';

create function public.fb_profile_added_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.added_at := statement_timestamp();
  else
    new.added_at := old.added_at;
  end if;
  return new;
end;
$$;
revoke all on function public.fb_profile_added_at() from public, anon, authenticated;
create trigger fb_profile_added_at
before insert or update on public.fb_profiles
for each row execute function public.fb_profile_added_at();

notify pgrst, 'reload schema';
-- End 20261003162418_roster_added_at.sql

-- Begin 20261003212205_roster_team_deletion.sql
-- Allow manager deletion without deleting teams, and reviewed team deletion
-- with direct users and surviving immediate subteams returning to Organization.
-- No existing data is rewritten by this upgrade.
begin;
set local lock_timeout = '5s';
lock table public.fb_config in share row exclusive mode;
select id from public.fb_config where id for update;
select public.fb_validate_learning(groups,teams,curricula) from public.fb_config where id;

create or replace function public.fb_delete_users(p_actor uuid,p_expected integer,p_ids jsonb,p_owner text) returns jsonb
language plpgsql set search_path='' as $$
declare cfg public.fb_config; u public.fb_profiles; uid uuid; results jsonb:='[]'; changed boolean:=false;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
 for uid in select value::uuid from jsonb_array_elements_text(p_ids) loop
  begin
   select * into u from public.fb_profiles where id=uid for update;
   if not found then raise exception 'Account not found'; end if;
   if u.deleted_at is not null then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','unchanged')); continue; end if;
   if uid=p_actor then raise exception 'You cannot delete your own account'; end if;
   if lower(u.email)=lower(p_owner) then raise exception 'The installation owner cannot be deleted'; end if;
   if u.role='admin' and not exists(select 1 from public.fb_profiles where id<>uid and active and role='admin' and auth_user_id is not null) then raise exception 'Keep an active administrator'; end if;
   insert into public.fb_deleted_items(entity,id,name,email,revision,deleted_by,snapshot) values('user',uid,u.name,u.email,1,p_actor,to_jsonb(u));
   update public.fb_deleted_items set claimed_at=now(),claim=gen_random_uuid() where entity='user' and id=uid;
   update public.fb_profiles set active=false,deleted_at=now(),groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=uid;
   update public.fb_mcp_grants set enabled=false where user_id=uid;
   insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','delete_user',uid::text);
   results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','changed')); changed:=true;
  exception when raise_exception then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','failed','message',sqlerrm)); end;
 end loop;
 if changed then
  update public.fb_config set teams=(
   select coalesce(jsonb_agg(case when exists(
    select 1 from jsonb_array_elements(results) r where r->>'status'='changed' and r->>'id'=t->>'managerId'
   ) then t-'managerId' else t end order by position),'[]'::jsonb)
   from jsonb_array_elements(teams) with ordinality as existing(t,position)
  ), governance_revision=governance_revision+1 where id;
 end if;
 return results;
end $$;

create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare previous text:=coalesce(current_setting('fieldbook.learning_batch',true),''); cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  perform set_config('fieldbook.learning_batch','on',true);
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    -- Preregistration creates a person; later edits/deletion use its stable ID.
    if coalesce((p_data->>'revoke')::boolean,false) then raise exception 'Use recoverable user deletion'; end if;
    if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'A user already uses that email'; end if;
    if exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'Account is pending deletion'; end if;
    if p_data->>'role' not in ('learner','manager','admin','contributor') then raise exception 'Invalid role'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
    if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
    select coalesce(jsonb_object_agg(g,stamp),'{}') into direct_dates from jsonb_array_elements_text(p_data->'groups') g;
    select coalesce(jsonb_object_agg(g.id,stamp),'{}') into effective_dates from public.fb_member_groups(p_data->'groups',p_data->>'teamId',cfg.groups) g;
    insert into public.fb_profiles(id,email,name,role,groups,team_id,hire_date,group_joined_at,effective_group_joined_at)
    values(gen_random_uuid(),lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'hireDate')::date,direct_dates,effective_dates);
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Learning links must be removed in a separate save.
    -- Deleted teams' direct users must move to Organization; selected children
    -- may be removed together; surviving immediate children must move to Organization.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if jsonb_array_length(coalesce(n->'learningItems','[]'))>0 then raise exception 'Remove assigned learning before deleting a team'; end if;
      if exists(
        select 1 from public.fb_profiles p where p.team_id=n->>'id' and p.deleted_at is null
        and not exists(select 1 from jsonb_array_elements(p_data->'users') candidate where candidate->>'id'=p.id::text
          and public.fb_reporting_team_id(candidate->>'teamId',cfg.teams)=cfg.settings->>'organizationTeamId')
      ) then raise exception 'Move deleted teams'' direct users to Organization'; end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id'
        and exists(select 1 from jsonb_array_elements(p_data->'teams') kept where kept->>'id'=t->>'id'
          and (kept->>'parentId') is distinct from (cfg.settings->>'organizationTeamId'))) then
        raise exception 'Move deleted teams'' surviving subteams to Organization';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_group_tree(u->'groups',u->>'teamId',p_data->'groups',p_data->'teams') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin','contributor')) then raise exception 'Team managers must be active managers, contributors or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;

  else raise exception 'Unknown governance operation'; end if;
  perform public.fb_sync_learning();
  perform set_config('fieldbook.learning_batch',previous,true);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;
revoke all on function public.fb_delete_users(uuid,integer,jsonb,text) from public, anon, authenticated;
grant execute on function public.fb_delete_users(uuid,integer,jsonb,text) to service_role;
revoke all on function public.fb_save_governance(uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.fb_save_governance(uuid,integer,text,jsonb) to service_role;
commit;
-- End 20261003212205_roster_team_deletion.sql

-- Begin 20261003222648_roster_import_reactivation.sql
-- Restore exact-email recoverable users through reviewed CSV imports.
-- No existing data is rewritten. Preserve the shared governance writer.
begin;
set local lock_timeout = '5s';
create or replace function public.fb_roster_import_fingerprint() returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'config',(select to_jsonb(c) from public.fb_config c where id),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'name',name,'role',role,'active',active,'groups',groups,'team',team_id,'hire',hire_date,'start',onboarding_start,'days',onboarding_days,'auth',auth_user_id,'deleted',deleted_at) order by id) from public.fb_profiles),'[]'),
  'published',coalesce((select jsonb_agg(jsonb_build_object('id',id,'published',published,'deleted',deleted_at) order by id) from public.fb_documents where published is not null),'[]'),
  'deleted',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'purgeAfter',purge_after,'purging',purging,'authLocked',auth_locked) order by id) from public.fb_deleted_items where entity='user'),'[]')
 )::text,'UTF8')),'hex')
$$;
revoke all on function public.fb_roster_import_fingerprint() from public,anon,authenticated;
grant execute on function public.fb_roster_import_fingerprint() to service_role;

create or replace function public.fb_roster_import(p_actor uuid,p_file_hash text,p_run uuid default null,p_data jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.fb_config; run public.fb_roster_import_runs; u jsonb; old public.fb_profiles; deleted public.fb_deleted_items; n jsonb;
 added integer:=0; changed integer:=0; teams_added integer:=0; teams_changed integer:=0;
 saved jsonb; outcome jsonb; previous text:=coalesce(current_setting('fieldbook.learning_batch',true),'');
begin
 perform set_config('lock_timeout','5s',true);
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid import file'; end if;
 if p_run is null then
  if p_data is not null then raise exception 'Review the file before importing'; end if;
  -- Expire abandoned reviews; committed compact receipts remain available for safe retries.
  delete from public.fb_roster_import_runs where result is null and reviewed_at < now()-interval '1 day';
  insert into public.fb_roster_import_runs(actor,file_hash,baseline) values(p_actor,p_file_hash,public.fb_roster_import_fingerprint()) returning * into run;
 else
  select * into run from public.fb_roster_import_runs where id=p_run for update;
  if not found or run.actor is distinct from p_actor or run.file_hash<>p_file_hash then raise exception 'Import review does not match this file or administrator'; end if;
  -- Permission and exact file/actor are checked before returning a committed receipt.
  if run.result is not null then return jsonb_build_object('id',run.id,'result',run.result); end if;
  lock table public.fb_profiles in share row exclusive mode;
  lock table public.fb_documents in share mode;
  lock table public.fb_deleted_items in share row exclusive mode;
  if run.reviewed_at < now()-interval '1 day' or run.review_day<>(now() at time zone 'UTC')::date or run.baseline<>public.fb_roster_import_fingerprint() then raise exception 'The organization changed. Review the file again before importing'; end if;
  if p_data is not null then
   if jsonb_typeof(p_data->'users') is distinct from 'array' or jsonb_typeof(p_data->'teams') is distinct from 'array' then raise exception 'Invalid import proposal'; end if;
   perform set_config('fieldbook.learning_batch','on',true);
   for n in select * from jsonb_array_elements(p_data->'teams') loop
    if not exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'id'=n->>'id') then teams_added:=teams_added+1;
    elsif exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'id'=n->>'id' and t is distinct from n) then teams_changed:=teams_changed+1; end if;
   end loop;
   for u in select * from jsonb_array_elements(p_data->'users') loop
    select * into old from public.fb_profiles where id=(u->>'id')::uuid;
    if not found then
     if u->>'role' not in ('learner','manager') or not (u->>'active')::boolean or u->'groups'<>'[]'::jsonb or u->>'onboardingStart' is not null then raise exception 'Invalid new import person'; end if;
     if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(u->>'email'))) or exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(u->>'email'))) then raise exception 'A person already uses that email or is pending deletion'; end if;
     insert into public.fb_profiles(id,email,name,role,hire_date) values((u->>'id')::uuid,lower(trim(u->>'email')),u->>'name',u->>'role',(u->>'hireDate')::date);
     added:=added+1;
    elsif old.deleted_at is not null then
     select * into deleted from public.fb_deleted_items where entity='user' and id=old.id for update;
     if not found or deleted.email is null or lower(trim(deleted.email))<>lower(trim(old.email)) or not deleted.auth_locked or deleted.purging or deleted.purge_after<=clock_timestamp() then
      raise exception 'This deleted user is not ready for restoration or its recovery window has ended';
     end if;
     if u->>'email' is distinct from old.email or (u->>'active')::boolean is distinct from true or u->'groups' is distinct from '[]'::jsonb or (u->>'onboardingStart')::date is distinct from old.onboarding_start then
      raise exception 'Restoration cannot change login identity, direct groups or recorded start';
     end if;
     if u->>'role' is distinct from 'learner' and not (u->>'role'='manager' and exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'managerId'=old.id::text)) then
      raise exception 'Restoration only grants learner access or explicitly assigned manager access';
     end if;
     -- The service clears any provider ban before this transaction. The profile
     -- remains denied until the complete roster writer below activates it.
     -- Never resurrect snapshot roles, memberships or disabled MCP consent.
     update public.fb_profiles set deleted_at=null,active=false,role='learner',groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=old.id;
     delete from public.fb_deleted_items where entity='user' and id=old.id;
     changed:=changed+1;
    else
     if u->>'email' is distinct from old.email or (u->>'active')::boolean is distinct from old.active or u->'groups' is distinct from old.groups or (u->>'onboardingStart')::date is distinct from old.onboarding_start then raise exception 'Import cannot change login identity, activity, direct groups or recorded start'; end if;
     if u->>'role' is distinct from old.role and not (old.role='learner' and u->>'role'='manager' and exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'managerId'=old.id::text)) then raise exception 'Import cannot remove or replace existing access'; end if;
     if u->>'name' is distinct from old.name or u->>'teamId' is distinct from old.team_id or (u->>'hireDate')::date is distinct from old.hire_date or u->>'role' is distinct from old.role then
      if not old.active or old.deleted_at is not null then raise exception 'Inactive or deleted people cannot be changed by import'; end if;
      changed:=changed+1;
     end if;
    end if;
   end loop;
   -- Reuse the current protected Organization, membership and assignment writer.
   -- It validates the complete roster under this same config lock and reconciles once.
   if added+changed+teams_added+teams_changed>0 then
    saved:=public.fb_save_governance(p_actor,cfg.governance_revision,'save',jsonb_build_object('users',p_data->'users','teams',p_data->'teams','groups',cfg.groups,'curricula',cfg.curricula));
   else saved:=jsonb_build_object('revision',cfg.governance_revision); end if;
   perform set_config('fieldbook.learning_batch',previous,true);
   outcome:=jsonb_build_object('peopleAdded',added,'peopleUpdated',changed,'teamsAdded',teams_added,'teamsUpdated',teams_changed,'revision',(saved->>'revision')::integer,'completedAt',now());
   if added+changed+teams_added+teams_changed>0 then
    -- Replace only this transaction's full-governance audit snapshot with its compact receipt.
    update public.fb_audit set action='roster_import',entity_id=run.id::text,snapshot=outcome where actor=p_actor and action='governance_save' and revision=(saved->>'revision')::integer;
   end if;
   update public.fb_roster_import_runs set result=outcome where id=run.id;
   return jsonb_build_object('id',run.id,'result',outcome);
  end if;
 end if;
 return jsonb_build_object('id',run.id,'day',run.review_day,'baseline',run.baseline);
end $$;
revoke all on function public.fb_roster_import(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fb_roster_import(uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
-- End 20261003222648_roster_import_reactivation.sql
