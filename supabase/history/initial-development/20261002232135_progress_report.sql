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
