-- TEST DATA ONLY. Not a migration. Run only on an EMPTY isolated preview backend.
-- Synthetic auth rows have no credentials and cannot sign in. Use real Google
-- test accounts via Pending accounts to exercise authenticated browser flows.
do $$ begin
  if current_setting('fieldbook.preview_seed',true) is distinct from 'isolated-test-only' then raise exception 'Set fieldbook.preview_seed to isolated-test-only on the isolated backend'; end if;
  if exists(select 1 from public.fb_profiles) or exists(select 1 from public.fb_documents) then raise exception 'Preview seed requires an empty backend'; end if;
end $$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('00000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
  (array['admin','west-manager','west-learner','east-learner'])[i]||'@example.test',now(),'{}','{}',now(),now()
from generate_series(1,4) i;
insert into public.fb_profiles(id,name,email,role)
select id,split_part(email,'@',1),email,case when email='admin@example.test' then 'admin' when email='west-manager@example.test' then 'manager' else 'learner' end from auth.users where email like '%@example.test';
select public.fb_save_governance('00000000-0000-4000-8000-000000000001',1,'save','{
  "groups":[{"id":"company","name":"Company"},{"id":"sales","name":"Sales","parentId":"company"},{"id":"solutions","name":"Solutions","parentId":"company"}],
  "teams":[{"id":"west","name":"West","managerId":"00000000-0000-4000-8000-000000000002"},{"id":"west-smb","name":"West SMB","parentId":"west"},{"id":"east","name":"East"}],
  "users":[
    {"id":"00000000-0000-4000-8000-000000000001","name":"Sample administrator","email":"admin@example.test","role":"admin","active":true,"groups":[]},
    {"id":"00000000-0000-4000-8000-000000000002","name":"Jordan West","email":"west-manager@example.test","role":"manager","active":true,"groups":["sales"],"teamId":"west"},
    {"id":"00000000-0000-4000-8000-000000000003","name":"Alex West","email":"west-learner@example.test","role":"learner","active":true,"groups":["sales"],"teamId":"west-smb"},
    {"id":"00000000-0000-4000-8000-000000000004","name":"Sam East","email":"east-learner@example.test","role":"learner","active":true,"groups":["solutions"],"teamId":"east"}
  ]
}');
select public.fb_save_document('10000000-0000-4000-8000-000000000001',0,'{
  "id":"10000000-0000-4000-8000-000000000001","kind":"course","title":"Welcome to Fieldbook","summary":"A sample course assigned through a parent group.","body":"Learn how assignments and reporting work.","category":"Getting started","folder":"","status":"published","version":1,"duration":5,"createdAt":"2026-09-20T00:00:00Z","updatedAt":"2026-09-20T00:00:00Z","groups":["company"],
  "assignments":[{"groupId":"company","due":{"type":"days","days":7}}],
  "lessons":[{"id":"one","title":"Your learning workspace","body":"Groups assign courses. Teams organize reporting. Everyone can browse published content."}],
  "questions":[{"id":"q1","prompt":"What determines course assignments?","options":["Groups","Reporting teams"],"answer":0}]
}',true,false,'00000000-0000-4000-8000-000000000001','preview-seed');
select public.fb_save_document('10000000-0000-4000-8000-000000000002',0,'{
  "id":"10000000-0000-4000-8000-000000000002","kind":"course","title":"Sales discovery practice","summary":"Fixed deadline sample, available to everyone to browse.","body":"Practice discovery.","category":"Sales","folder":"","status":"published","version":1,"duration":10,"createdAt":"2026-09-20T00:00:00Z","updatedAt":"2026-09-20T00:00:00Z","groups":["sales"],
  "assignments":[{"groupId":"sales","due":{"type":"date","date":"2026-12-31"}}],
  "lessons":[{"id":"one","title":"Ask before you explain","body":"Start with the customer’s desired outcome."}],"questions":[]
}',true,false,'00000000-0000-4000-8000-000000000001','preview-seed');
select public.fb_record_progress('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',1,'["one"]',true,null);
select public.fb_record_progress('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',1,'["one"]',false,null);
update public.fb_config set settings=settings||'{"name":"Fieldbook Governance Preview","registration":"closed","access":"public","tagline":"Isolated test environment · sample data only"}';
