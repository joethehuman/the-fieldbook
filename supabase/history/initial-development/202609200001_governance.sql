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

