import "server-only";
import type { MediaDataPort } from "./ports/media-data";
import { supabaseMediaData } from "./providers/supabase/media-data";

export function mediaData(): MediaDataPort {
  return supabaseMediaData;
}
