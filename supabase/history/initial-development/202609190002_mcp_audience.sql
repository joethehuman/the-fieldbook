create table public.fb_oauth_config(id boolean primary key default true check(id),resource text not null);
alter table public.fb_oauth_config enable row level security;
revoke all on public.fb_oauth_config from anon,authenticated;
grant all on public.fb_oauth_config to service_role;

-- Enable this function as the Custom Access Token Hook in Supabase Auth.
-- OAuth tokens for approved Fieldbook clients are bound to this MCP endpoint.
create or replace function public.fb_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb; client text; resource text;
begin
  claims := event->'claims';
  client := coalesce(event->>'client_id',claims->>'client_id');
  if client is not null and exists(select 1 from public.fb_mcp_grants where user_id=(event->>'user_id')::uuid and client_id=client and enabled) then
    select c.resource into resource from public.fb_oauth_config c where id=true;
    if resource is not null then claims := jsonb_set(claims,'{aud}',to_jsonb(resource)); end if;
  end if;
  return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.fb_access_token_hook from public,anon,authenticated;
grant execute on function public.fb_access_token_hook to supabase_auth_admin;
