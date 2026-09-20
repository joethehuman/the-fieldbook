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
