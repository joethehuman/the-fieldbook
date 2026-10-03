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
