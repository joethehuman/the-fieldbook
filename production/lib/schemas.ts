import { z } from "zod";
const text = (max: number) => z.string().max(max);
export const contentBaseSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["doc", "brief", "course"]),
  title: text(160).trim().min(1),
  summary: text(300),
  body: text(200000),
  category: text(80).trim().min(1),
  folder: text(300),
  status: z.enum(["draft", "published"]),
  version: z.number().int().min(1),
  duration: z.number().int().min(0).max(10000),
  groups: z.array(text(80)).max(100),
  lessons: z
    .array(
      z.object({
        id: text(100).min(1),
        title: text(160),
        body: text(200000),
        videoUrl: text(2000).optional(),
      }),
    )
    .max(100),
  questions: z
    .array(
      z.object({
        id: text(100).min(1),
        prompt: text(2000),
        options: z.array(text(1000)).min(2).max(10),
        answer: z.number().int().min(0).optional(),
      }),
    )
    .max(100),
  assignments: z
    .array(
      z.object({
        groupId: text(80),
        assignedAt: z.iso.datetime(),
        due: z.discriminatedUnion("type", [
          z.object({ type: z.literal("none") }),
          z.object({ type: z.literal("date"), date: z.iso.date() }),
          z.object({
            type: z.literal("days"),
            days: z.number().int().min(1).max(3650),
          }),
        ]),
      }),
    )
    .max(100)
    .optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime(),
  revision: z.number().int().min(0).optional(),
  publishedRevision: z.number().int().nullable().optional(),
});
export const contentSchema = contentBaseSchema.superRefine((c, ctx) => {
  for (const nodes of [c.lessons, c.questions])
    if (new Set(nodes.map((n) => n.id)).size !== nodes.length)
      ctx.addIssue({
        code: "custom",
        message: "Lesson and question IDs must be unique.",
      });
});
export const settingsSchema = z.object({
  name: text(60).trim().min(1),
  tagline: text(180),
  logoUrl: text(2000).refine(
    (s) => !s || /^\/api\/media\/[\w.-]+$/.test(s),
    "Upload a logo using Fieldbook.",
  ),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  access: z.enum(["public", "private"]),
  registration: z.enum(["open", "closed"]),
});
export const progressSchema = z.object({
  contentId: z.uuid(),
  version: z.number().int().positive(),
  lessonId: text(100).optional(),
  lessons: z.array(text(100)).max(100).optional(),
  answers: z.array(z.number().int().min(0).max(9)).max(100).optional(),
});
