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
