import { z } from "zod";
import { defaultAskAiSettings } from "./ai";

export const askAiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    model: z
      .string()
      .trim()
      .max(160)
      .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i)
      .default(defaultAskAiSettings.model),
    sources: z
      .array(z.enum(["doc", "brief", "course"]))
      .min(1)
      .max(3)
      .refine((values) => new Set(values).size === values.length)
      .default(defaultAskAiSettings.sources),
    guidance: z
      .string()
      .trim()
      .max(2_000)
      .default(defaultAskAiSettings.guidance),
  })
  .strict();

export const aiSearchPlanSchema = z
  .object({
    queries: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[\p{L}\p{N}\s-]+$/u)
          .refine(
            (value) => (value.match(/[\p{L}\p{N}]+/gu) || []).length <= 12,
          ),
      )
      .min(1)
      .max(3),
  })
  .strict();
