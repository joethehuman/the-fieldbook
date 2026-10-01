import "server-only";
import { installation } from "./installation";
import { supabaseEnvironment } from "./providers/supabase/environment";
export { siteOrigins } from "./installation";

/** Compatibility for current provider code and existing configuration tests. */
export function env() {
  return { ...supabaseEnvironment(), ...installation() };
}
