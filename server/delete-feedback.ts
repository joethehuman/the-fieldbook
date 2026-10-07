import "server-only";
import { z } from "zod";
import type { User } from "@/lib/types";
import { requireAdmin, HttpError } from "./auth";
import { data as dataStore } from "./data";

export async function deleteFeedback(user: User | null, input: unknown) {
  requireAdmin(user);
  const parsed = z.object({ ids: z.array(z.uuid()).min(1).max(200) }).safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Choose between 1 and 200 valid feedback entries.");
  const { ids } = parsed.data;
  return dataStore().deleteFeedback([...new Set(ids)]);
}
