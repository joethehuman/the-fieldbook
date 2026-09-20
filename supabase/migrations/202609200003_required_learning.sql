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
