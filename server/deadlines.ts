import "server-only";
import { z } from "zod";
import type { User } from "@/lib/types";
import { requireAdmin, HttpError } from "./auth";
import { data } from "./data";
const input = z
  .object({
    token: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
  })
  .strict();
export async function reviewDeadlines(user: User | null, payload: unknown) {
  requireAdmin(user);
  const parsed = input.safeParse(payload);
  if (!parsed.success)
    throw new HttpError(400, "A current deadline review is required.");
  return data().reviewDeadlines(
    user.id,
    !!parsed.data.token,
    parsed.data.token,
  );
}
