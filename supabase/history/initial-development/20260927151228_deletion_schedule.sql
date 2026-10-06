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
