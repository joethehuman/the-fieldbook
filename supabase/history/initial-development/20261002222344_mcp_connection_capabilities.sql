-- Consent is application policy; OIDC identity scopes do not grant Fieldbook tools.
-- The default preserves the original deployed admin consent during rolling upgrades.
begin;
alter table public.fb_mcp_grants
  add column capabilities text[] not null default array['content:read','content:write','media:read','reports:aggregate']::text[],
  add column capability_version integer not null default 0,
  add column role_at_consent text not null default 'admin' check(role_at_consent in ('admin','contributor','manager'));
alter table public.fb_mcp_grants add constraint fb_mcp_grants_capabilities_check
  check (capabilities <@ array['content:read','content:write','content:assign','media:read','media:write','reports:aggregate','reports:read','feedback:read']::text[]
    and array_position(capabilities,null) is null and capability_version in (0,1));
-- Earlier code allowed only admins to approve a connection. Any unexpected
-- non-admin legacy row is disabled instead of acquiring publishing permissions.
update public.fb_mcp_grants g set enabled=false
from public.fb_profiles p where p.id=g.user_id and p.role<>'admin';

-- Privileged application adapter only. Check current roster linkage, role and
-- reporting responsibility in the same database transaction as the consent write.
create function public.fb_enable_mcp_grant(p_person uuid,p_client text,p_name text,p_capabilities text[],p_require_enabled boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.fb_profiles; available text[]; managed boolean;
begin
  select * into p from public.fb_profiles where id=p_person for update;
  if not found or not p.active or p.deleted_at is not null or p.auth_user_id is null or p.role='learner' then
    raise exception 'Active administrator, contributor or scoped manager access required';
  end if;
  select exists(select 1 from public.fb_config c,jsonb_array_elements(c.teams) t where t->>'managerId'=p_person::text) into managed;
  if p.role='admin' then
    available:=array['content:read','content:write','content:assign','media:read','media:write','reports:aggregate','reports:read','feedback:read'];
  elsif p.role='contributor' then
    available:=array['content:read','content:write','media:read','media:write','feedback:read'];
    if managed then available:=array_append(available,'reports:read'); end if;
  elsif p.role='manager' and managed then available:=array['reports:read'];
  else raise exception 'An explicitly managed reporting team is required';
  end if;
  if p_client is null or length(p_client) not between 1 and 200 or p_name is null or length(p_name) not between 1 and 200
    or p_capabilities is null or cardinality(p_capabilities)=0
    or array_position(p_capabilities,null) is not null or not (p_capabilities <@ available) then
    raise exception 'Invalid or unavailable MCP permissions';
  end if;
  if p_require_enabled then
    perform 1 from public.fb_mcp_grants where user_id=p_person and client_id=p_client and enabled for update;
    if not found then raise exception 'Connection has been revoked; reconnect before granting permissions'; end if;
  end if;
  insert into public.fb_mcp_grants(user_id,client_id,client_name,enabled,granted_at,capabilities,capability_version,role_at_consent)
  values(p_person,p_client,p_name,true,now(),p_capabilities,1,p.role)
  on conflict(user_id,client_id) do update set client_name=excluded.client_name,enabled=true,
    granted_at=excluded.granted_at,capabilities=excluded.capabilities,capability_version=1,role_at_consent=excluded.role_at_consent;
end $$;
revoke all on function public.fb_enable_mcp_grant(uuid,text,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.fb_enable_mcp_grant(uuid,text,text,text[],boolean) to service_role;
commit;
