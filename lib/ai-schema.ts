import { z } from "zod";
import { defaultAskAiSettings } from "./ai";

const modelId = z
  .string()
  .trim()
  .max(160)
  // IDs are opaque catalog values, not URLs or vendor/model assumptions.
  .regex(/^[a-z0-9][a-z0-9._:/-]*$/i)
  .refine((value) => !value.includes("://"))
  .or(z.literal(""));

export const askAiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    router: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
      .optional(),
    model: modelId.default(""),
    fallbackModel: modelId.default(""),
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
  .strict()
  .superRefine((settings, context) => {
    if (settings.enabled && !settings.model)
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Choose a primary model before enabling Ask AI.",
      });
    if (settings.fallbackModel && settings.fallbackModel === settings.model)
      context.addIssue({
        code: "custom",
        path: ["fallbackModel"],
        message: "Choose a fallback different from the primary model.",
      });
  });

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
