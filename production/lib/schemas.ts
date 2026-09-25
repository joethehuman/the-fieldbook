import { z } from "zod";
import { validateDocSections } from "@/lib/docs-navigation";
const text = (max: number) => z.string().max(max);
export const contentBaseSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["doc", "brief", "course"]),
  title: text(160).trim().min(1),
  summary: text(300),
  body: text(200000),
  category: text(80).trim().min(1),
  folder: text(300),
  sectionId: text(1500).optional(),
  status: z.enum(["draft", "published"]),
  version: z.number().int().min(1),
  coverImageUrl: text(2000)
    .refine(
      (s) => !s || /^\/api\/media\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(s),
      "Upload a course cover using Fieldbook.",
    )
    .optional(),
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
        groupId: text(80).optional(),
        userId: z.uuid().optional(),
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
const privacyDocumentSchema = z.object({
  mode: z.enum(["hosted", "external"]),
  operatorName: text(160),
  contactEmail: text(254).refine((s) => !s || z.email().safeParse(s).success),
  contactUrl: text(2000)
    .refine(
      (s) => !s || (z.url().safeParse(s).success && s.startsWith("https://")),
      "Use an HTTPS contact page URL.",
    )
    .optional(),
  body: text(100000),
  url: text(2000).refine(
    (s) => !s || (z.url().safeParse(s).success && s.startsWith("https://")),
  ),
});
const publishedPrivacySchema = privacyDocumentSchema.refine(
  (p) =>
    p.mode === "external"
      ? !!p.url
      : !!p.body.trim() &&
        !!p.operatorName.trim() &&
        !!(p.contactEmail || p.contactUrl),
  "Published policies require text, operator and an email or contact page, or an HTTPS policy URL.",
);
export const settingsSchema = z
  .object({
    guestGroupId: text(80).min(1).nullable().optional(),
    docCategoryOrder: z
      .array(text(80).trim().min(1))
      .max(500)
      .refine(
        (names) => new Set(names).size === names.length,
        "Docs sections must be unique.",
      )
      .optional(),
    docSections: z
      .array(
        z.object({
          id: text(1500).min(1),
          name: text(80).trim().min(1),
          parentId: text(1500).optional(),
          legacyCategory: text(80).optional(),
          legacyFolder: text(300).optional(),
        }),
      )
      .max(500)
      .optional(),
    newUserStage: z.enum(["existing", "newhire"]).default("existing"),
    onboardingDays: z.number().int().min(1).max(365).default(90),
    catchUpDays: z.number().int().min(1).max(365).default(30),
    privacy: z
      .object({
        draft: privacyDocumentSchema,
        published: publishedPrivacySchema.nullable(),
        publishedAt: z.iso.datetime().nullable(),
      })
      .optional(),
    name: text(60).trim().min(1),
    tagline: text(180),
    welcomeDescription: text(180).trim().default(""),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    access: z.enum(["public", "private"]),
    registration: z.enum(["open", "closed"]),
  })
  .superRefine((settings, context) => {
    try {
      validateDocSections(settings.docSections || []);
    } catch (error) {
      context.addIssue({ code: "custom", message: (error as Error).message });
    }
  });
export const progressSchema = z.object({
  contentId: z.uuid(),
  version: z.number().int().positive(),
  lessonId: text(100).optional(),
  lessons: z.array(text(100)).max(100).optional(),
  answers: z.array(z.number().int().min(0).max(9)).max(100).optional(),
});
