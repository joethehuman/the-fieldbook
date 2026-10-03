import { z } from "zod";
import { askAiSettingsSchema } from "@/lib/ai-schema";
import { validateDocSections } from "@/lib/docs-navigation";
import { cardPalettePresets, graphemeCount } from "@/lib/card-art";
import {
  externalLinkUrlError,
  maxExternalLinks,
  maxExternalLinkLabelLength,
  maxExternalLinkUrlLength,
} from "@/lib/external-links";
const text = (max: number) => z.string().max(max);
export const cardImageReference = z
  .string()
  .regex(
    /^\/api\/media\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/,
    "Upload an image using Fieldbook.",
  );
export const cardArtSchema = z
  .object({
    source: z.enum(["generated", "upload"]),
    shortTitle: text(160),
    version: z.union([z.literal(1), z.literal(2)]),
    seed: z.number().int().min(0).max(4294967295),
    imageUrl: cardImageReference.optional(),
  })
  .superRefine((art, ctx) => {
    if (
      graphemeCount(art.shortTitle) > 40 ||
      (art.source === "generated" && !art.shortTitle.trim())
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Generated card artwork needs a short title of up to 40 characters.",
      });
    if (art.source === "upload" && !art.imageUrl)
      ctx.addIssue({
        code: "custom",
        message: "Upload a card image before saving.",
      });
  });
export const contentBaseSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["doc", "brief", "course"]),
  title: text(160).trim().min(1),
  summary: text(300),
  body: text(200000),
  category: text(80).trim().min(1),
  folder: text(300),
  sectionId: text(1500).optional(),
  sectionOrder: z.number().int().nonnegative().optional(),
  status: z.enum(["draft", "published"]),
  version: z.number().int().min(1),
  coverImageUrl: text(2000)
    .refine(
      (s) => !s || /^\/api\/media\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(s),
      "Upload a course cover using Fieldbook.",
    )
    .optional(),
  cardArt: cardArtSchema.optional(),
  duration: z.number().int().min(0).max(10000),
  requirePassing: z.boolean().optional(),
  groups: z.array(text(80)).max(1000),
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
        optionIds: z.array(text(100)).min(2).max(5).optional(),
        correctOptionIds: z.array(text(100)).min(1).max(4).optional(),
        explanation: text(2000).optional(),
        answer: z.number().int().min(0).optional(),
      }),
    )
    .max(100),
  assignments: z
    .array(
      z.object({
        groupId: text(80).optional(),
        teamId: text(80).optional(),
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
    .max(2000)
    .optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime(),
  feedAt: z.iso.datetime().optional(),
  revision: z.number().int().min(0).optional(),
  publishedRevision: z.number().int().nullable().optional(),
});
function uniqueContentIds(
  c: z.infer<typeof contentBaseSchema>,
  ctx: z.RefinementCtx,
) {
  for (const nodes of [c.lessons, c.questions])
    if (new Set(nodes.map((n) => n.id)).size !== nodes.length)
      ctx.addIssue({
        code: "custom",
        message: "Lesson and question IDs must be unique.",
      });
}
export const contentSchema = contentBaseSchema.superRefine(uniqueContentIds);
/** Drafts allow unfinished editorial values, retaining structural and media boundaries.
 * MCP and the editor share this draft schema; publication uses the complete schema.
 */
export const contentDraftSchema = contentBaseSchema
  .extend({
    title: text(160),
    category: text(80),
    cardArt: z
      .object({
        source: z.enum(["generated", "upload"]),
        shortTitle: text(160),
        version: z.union([z.literal(1), z.literal(2)]),
        seed: z.number().int().min(0).max(4294967295),
        imageUrl: cardImageReference.optional(),
      })
      .optional(),
    questions: z
      .array(
        contentBaseSchema.shape.questions.element.extend({
          correctOptionIds: z.array(text(100)).max(4).optional(),
        }),
      )
      .max(100),
  })
  .superRefine(uniqueContentIds);
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
    askAi: askAiSettingsSchema.optional(),
    externalLinks: z
      .array(
        z.object({
          id: z.uuid(),
          label: z.string().trim().min(1).max(maxExternalLinkLabelLength),
          url: z
            .string()
            .trim()
            .max(maxExternalLinkUrlLength)
            .refine(
              (url) => !externalLinkUrlError(url),
              "Use a full http:// or https:// URL without spaces or sign-in details.",
            ),
        }),
      )
      .max(maxExternalLinks, "Add no more than three external links.")
      .refine(
        (links) => new Set(links.map((link) => link.id)).size === links.length,
        "External links must have unique IDs.",
      )
      .default([]),
    homePage: z.enum(["updates", "courses", "docs"]).default("courses"),
    guestGroupId: text(80).min(1).nullable().optional(),
    organizationTeamId: text(80).min(1).nullable().optional(),
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
    dueDatesEnabled: z.boolean().default(true),
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
    // Retain previously saved values without requiring the retired setting.
    tagline: text(180).optional(),
    welcomeDescription: text(180).trim().default(""),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    cardPalette: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("follow") }),
        z.object({
          mode: z.literal("preset"),
          preset: z.enum(
            Object.keys(cardPalettePresets) as [
              keyof typeof cardPalettePresets,
              ...(keyof typeof cardPalettePresets)[],
            ],
          ),
        }),
        z.object({
          mode: z.literal("custom"),
          colors: z.object({
            base: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            accent1: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            accent2: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          }),
        }),
      ])
      .optional(),
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
  selections: z
    .array(z.array(z.number().int().min(0).max(4)).min(1).max(4))
    .max(100)
    .optional(),
  complete: z.boolean().optional(),
});
