import "server-only";
import type { DataStore } from "./ports/data";
import { supabaseData } from "./providers/supabase/data";

/** Current supported data provider. Feature services depend on DataStore. */
export function data(): DataStore {
  return supabaseData;
}
