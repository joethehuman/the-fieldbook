import "server-only";
import { db, check } from "./client";
import type {
  ConnectionGrant,
  ProfileRecord,
  ProfileRegistration,
} from "../../ports/identity";

/** Resolve a verified provider subject to the application person. */
export async function findProfileBySubject(
  subject: string,
  activeOnly = false,
): Promise<ProfileRecord | null> {
  let query = db().from("fb_profiles").select("*").eq("auth_user_id", subject);
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query.maybeSingle();
  check(error);
  return data;
}

export async function registerProfile(
  input: ProfileRegistration,
): Promise<ProfileRecord | null> {
  const { data, error } = await db().rpc("fb_register_profile", {
    p_id: input.subject,
    p_email: input.email,
    p_name: input.name,
    p_owner: input.owner,
  });
  if (error?.code === "P0001") return null;
  check(error);
  return data;
}

/** Inbound MCP credentials carry a provider subject; resolve it before checking person grants. */
export async function hasConnectionGrantForSubject(
  subject: string,
  clientId: string,
): Promise<boolean> {
  const person = await findProfileBySubject(subject, true);
  if (!person) return false;
  const { data, error } = await db()
    .from("fb_mcp_grants")
    .select("enabled")
    .eq("user_id", person.id)
    .eq("client_id", clientId)
    .maybeSingle();
  check(error);
  return Boolean(data?.enabled);
}

/** Lifecycle operations resolve the provider link without making a new identity. */
export async function loginSubjectForPerson(
  personId: string,
): Promise<string | null> {
  const { data, error } = await db()
    .from("fb_profiles")
    .select("auth_user_id")
    .eq("id", personId)
    .maybeSingle();
  check(error);
  return data?.auth_user_id || null;
}

export async function connectionGrants(
  personId: string,
): Promise<ConnectionGrant[] | null> {
  const { data, error } = await db()
    .from("fb_mcp_grants")
    .select("client_id,client_name,enabled,granted_at")
    .eq("user_id", personId);
  check(error);
  return data;
}

export async function enableConnectionGrant(
  personId: string,
  clientId: string,
  clientName: string,
): Promise<void> {
  const { error } = await db().from("fb_mcp_grants").upsert({
    user_id: personId,
    client_id: clientId,
    client_name: clientName,
    enabled: true,
    granted_at: new Date().toISOString(),
  });
  check(error);
}

export async function disableConnectionGrant(
  personId: string,
  clientId: string,
): Promise<void> {
  const { error } = await db()
    .from("fb_mcp_grants")
    .update({ enabled: false })
    .eq("user_id", personId)
    .eq("client_id", clientId);
  check(error);
}

export async function setMcpResource(resource: string): Promise<void> {
  const { error } = await db()
    .from("fb_oauth_config")
    .upsert({ id: true, resource });
  check(error);
}

export async function allowMcpRequest(personId: string): Promise<boolean> {
  const { data, error } = await db().rpc("fb_allow_request", {
    p_key: `mcp:${personId}`,
    p_limit: 120,
    p_seconds: 60,
  });
  check(error);
  return Boolean(data);
}
