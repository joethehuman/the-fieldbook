import "server-only";
import type { CleanupDataPort } from "./ports/cleanup-data";
import { supabaseCleanupData } from "./providers/supabase/cleanup-data";

export function cleanupData(): CleanupDataPort {
  return supabaseCleanupData;
}
