import "server-only";
import type { StoragePort } from "./ports/storage";
import { supabaseStorage } from "./providers/supabase/storage";

// The supported installation uses Supabase. A new implementation is wired here.
export function storage(): StoragePort {
  return supabaseStorage;
}
