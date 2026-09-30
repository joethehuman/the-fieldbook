import { z } from "zod";
export const bulkSchema = z
  .object({
    entity: z.enum(["content", "user"]),
    operation: z.enum([
      "publish",
      "unpublish",
      "category",
      "section",
      "delete",
      "restore",
    ]),
    items: z
      .array(
        z.object({ id: z.uuid(), expected: z.number().int().nonnegative() }),
      )
      .min(1)
      .max(100),
    value: z.string().max(1500).optional(),
    governanceExpected: z.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      new Set(value.items.map((i) => i.id)).size === value.items.length,
    "Select each item once.",
  )
  .refine(
    (value) =>
      value.entity !== "user" ||
      ["delete", "restore"].includes(value.operation),
    "Unsupported account action.",
  );
