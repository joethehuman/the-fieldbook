import type { ProfileRecord } from "../../ports/identity";

/** Raw Supabase mapping is private to this integration. No external subject is
 * returned to roster services, components or browser payloads. */
export type SupabaseProfile = Omit<ProfileRecord, "registered"> & {
  auth_user_id: string | null;
  deleted_at?: string | null;
};
export function fieldbookProfile(
  row: SupabaseProfile,
): ProfileRecord & { deleted_at?: string | null } {
  const { auth_user_id: subject, ...person } = row;
  return { ...person, registered: Boolean(subject) };
}
