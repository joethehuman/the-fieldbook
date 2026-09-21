insert into fb_documents(id,draft,published,published_revision)
 select md5('fixture-'||n)::uuid,'{}',jsonb_build_object('kind',case when n%3=0 then 'course' when n%3=1 then 'doc' else 'brief' end,
 'title',(array['Platform operations','Customer discovery','Product onboarding','Release notes','Security practices'])[1+n%5]||' '||n,
 'summary','Reference material for independent teams',
 'body',repeat((array['Configure metrics and alerts. Diagnose network latency. ','Qualify customer needs and evaluate business outcomes. ','Manage service accounts and rotate credentials. ','Deploy releases with checkpoints and rollback procedures. '])[1+n%4],20),
 'lessons',case when n%3=0 then jsonb_build_array(
 jsonb_build_object('id','intro','title','Introduction','body',repeat('Observe request throughput and measure response duration. ',15)),
 jsonb_build_object('id','practice','title','Operations','body',repeat('Handle incidents with a clear owner and communication plan. ',15)),
 jsonb_build_object('id','review','title','Review','body',repeat('Review configuration and document the operational decision. ',15))) else '[]'::jsonb end),1
 from generate_series(1,10000) n;
 analyze fb_search_passages;
