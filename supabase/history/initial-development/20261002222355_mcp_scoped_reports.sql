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
