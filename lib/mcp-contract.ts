import { z } from "zod";
import { contentDraftSchema } from "../server/schemas";
import type { McpCapability } from "./mcp-access";
import {
  learningReportInputSchema,
  feedbackReportInputSchema,
} from "./mcp-report-schema";

export const MCP_CONTRACT_VERSION = "1.0.0";
const page = {
  cursor: z.string().max(2000).optional(),
  limit: z.number().int().min(1).max(100).default(50),
};
const revision = {
  id: z.uuid(),
  expected_revision: z.number().int().positive(),
};
const createDraft = z
  .object(contentDraftSchema.shape)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    revision: true,
    publishedRevision: true,
    status: true,
    version: true,
    feedAt: true,
  })
  .extend({
    title: z.string().max(160).default(""),
    summary: z.string().max(300).default(""),
    body: z.string().max(200000).default(""),
    category: z.string().max(80).default(""),
    folder: z.string().max(300).default(""),
    duration: z.number().int().min(0).max(10000).default(0),
    groups: z.array(z.string().max(80)).max(1000).default([]),
    lessons: contentDraftSchema.shape.lessons.default([]),
    questions: contentDraftSchema.shape.questions.default([]),
  });
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const write = { ...read, readOnlyHint: false };
const sideEffect = { ...write, destructiveHint: true };
function tool<S extends z.ZodRawShape>(
  capability: McpCapability | null,
  description: string,
  input: S,
  annotations = read,
  manual = "",
) {
  return {
    capability,
    description,
    inputSchema: z.object(input).strict(),
    annotations,
    manual,
  };
}

/** This versioned executable definition is shared by registration, discovery, docs and tests.
 * No host, database, OAuth or storage SDK belongs in the public contract. */
export const mcpContract = {
  get_capabilities: tool(
    null,
    "Discover this connection's allowed tools, missing consent, reporting scope, contract and editor formats, and unsupported operations with manual guidance. Use first, or when a request is outside the available tools.",
    { operation: z.string().max(200).optional() },
  ),
  search: tool(
    "content:read",
    "Search all non-deleted drafts and published items, including course lesson prose. Empty query lists content. Follow nextCursor until complete; drafts require publishing access.",
    {
      query: z.string().max(200).default(""),
      kind: z.enum(["all", "doc", "brief", "course"]).default("all"),
      ...page,
    },
  ),
  fetch: tool(
    "content:read",
    "Read the complete current draft, including Markdown, lessons, quiz answer keys, artwork and revision. Preserve unrelated fields before editing. Requires publishing access.",
    { id: z.uuid() },
  ),
  create_content: tool(
    "content:write",
    "Create a Docs, Update (brief), or Course draft. Only kind is required; unfinished editor fields are allowed. Does not publish. Supply a fresh request_id UUID and reuse it on retry to avoid a duplicate draft.",
    { content: createDraft, request_id: z.uuid().optional() },
    write,
  ),
  update_content: tool(
    "content:write",
    "Replace an existing draft using expected_revision. Fetch first and preserve untouched fields. Markdown supports editor formatting, images and links; lessons use videoUrl. Published content stays unchanged. Course audiences use manage_course_assignment; contributors cannot reorder Docs or create sections.",
    {
      content: contentDraftSchema,
      expected_revision: z.number().int().positive(),
    },
    write,
  ),
  publish_content: tool(
    "content:write",
    "Publish the current draft only on explicit user intent. Validates complete lessons, image alternative text and quizzes. Set new_course_version=true only for a substantive course change that starts a new completion requirement. Update corrections preserve feed position; set renew_update=true only to bring an Update forward in Updates and For you. First publication is current by default.",
    {
      ...revision,
      new_course_version: z.boolean().default(false),
      renew_update: z.boolean().default(false),
    },
    sideEffect,
  ),
  unpublish_content: tool(
    "content:write",
    "Remove a publication while preserving its draft and history. Requires explicit user intent and current expected_revision.",
    revision,
    sideEffect,
  ),
  content_report: tool(
    "reports:aggregate",
    "Legacy administrator report: organization-wide aggregate current-course activity and feedback counts. No named learner records. Use learning_report for filtered named reports after approving that capability.",
    {},
  ),
  get_authoring_options: tool(
    "content:read",
    "Discover existing Docs section IDs and paths, separate courseCategories and updateCategories, and supported Markdown/media/quiz formats. Select existing managed categories and sections; category creation and ordering use Categories in Fieldbook settings.",
    {},
  ),
  list_media: tool(
    "media:read",
    "Find ready uploaded images and videos with stable private Fieldbook references. Filter and follow nextCursor until complete. Never insert a pending upload or a temporary signed transfer URL.",
    {
      query: z.string().max(200).default(""),
      type: z.enum(["all", "image", "video"]).default("all"),
      ...page,
    },
  ),
  prepare_media_upload: tool(
    "media:write",
    "Prepare an image or video upload. Returns a short-lived PUT or resumable TUS transfer instruction, not a usable content URL. The client must transfer the file bytes outside MCP, then call complete_media_upload. If the client cannot transfer files, use the Fieldbook editor upload manually. No arbitrary remote URL imports.",
    {
      name: z.string().min(1).max(255),
      type: z.enum([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
      ]),
      size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    },
    write,
    "Upload the file in the content editor, then use list_media.",
  ),
  complete_media_upload: tool(
    "media:write",
    "Verify the current publisher's completed transfer against stored file type, size and owner. Returns a stable private content URL only after verification; repeat this call safely after a lost acknowledgement.",
    { id: z.uuid() },
    write,
  ),
  get_reporting_scopes: tool(
    "reports:read",
    "List the teams, intersecting learning groups and published courses available for this account's learning reports. Managers are restricted to explicitly managed teams and descendants; group filters never expand that scope.",
    {},
  ),
  learning_report: tool(
    "reports:read",
    "Read a paginated learning report by teams, learning groups and courses, with names, current-version completion, saved assignment dates/deadlines and overdue status. Group filters intersect team scope. Follow nextCursor for the complete export; optional learning is separate from assigned completion.",
    learningReportInputSchema.shape,
  ),
  feedback_report: tool(
    "feedback:read",
    "Read paginated content or general feedback, including respondent names but no emails or quiz answers. Contributor publishing access includes feedback; this does not grant learner progress reporting.",
    feedbackReportInputSchema.shape,
  ),
  manage_course_assignment: tool(
    "content:assign",
    "Administrator only: explicitly assign or unassign one published course to one existing team or learning group through Fieldbook's canonical assignment service. Saved ongoing deadlines and other assignment sources are preserved. Refresh the course revision after each write.",
    {
      ...revision,
      operation: z.enum(["assign", "unassign"]),
      audience: z
        .object({
          kind: z.enum(["team", "group"]),
          id: z.string().min(1).max(80),
        })
        .strict(),
    },
    sideEffect,
  ),
} as const;

export type McpToolName = keyof typeof mcpContract;
export type McpToolInput<N extends McpToolName> = z.output<
  (typeof mcpContract)[N]["inputSchema"]
>;
const listPage = { nextCursor: z.string().nullable(), complete: z.boolean() };
const mutationOutput = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    title: z.string(),
    kind: z.enum(["doc", "brief", "course"]),
    version: z.number().int().positive(),
    status: z.enum(["draft", "published"]),
  })
  .passthrough();
const scopeName = z.object({ id: z.string(), name: z.string() }).passthrough();
const courseName = z
  .object({ id: z.string(), title: z.string(), version: z.number() })
  .passthrough();
/** Stable output fields are advertised and checked; compatible extra fields may be added. */
export const mcpOutputSchemas = {
  get_capabilities: z
    .object({
      contractVersion: z.string(),
      role: z.string(),
      tools: z.array(
        z
          .object({
            name: z.string(),
            description: z.string(),
            capability: z.string().nullable(),
            available: z.boolean(),
            reason: z.string().nullable(),
          })
          .passthrough(),
      ),
      capabilities: z.array(z.string()),
      consentRequired: z.array(z.string()),
      reporting: z.object({
        allTeams: z.boolean(),
        teamIds: z.array(z.string()),
      }),
      unsupported: z.array(
        z
          .object({
            operation: z.string(),
            instruction: z.string(),
            location: z.string(),
            url: z.string(),
          })
          .passthrough(),
      ),
    })
    .passthrough(),
  search: z.object({
    results: z.array(
      z
        .object({
          id: z.uuid(),
          title: z.string(),
          kind: z.enum(["doc", "brief", "course"]),
          revision: z.number(),
          status: z.enum(["draft", "published"]),
          url: z.string(),
        })
        .passthrough(),
    ),
    ...listPage,
  }),
  fetch: z.object({
    id: z.uuid(),
    title: z.string(),
    text: z.string(),
    url: z.string(),
    metadata: z.object({ revision: z.number() }),
  }),
  create_content: mutationOutput,
  update_content: mutationOutput,
  publish_content: mutationOutput,
  unpublish_content: mutationOutput,
  content_report: z.object({
    courses: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        version: z.number(),
        started: z.number(),
        completed: z.number(),
      }),
    ),
    feedback: z.array(
      z.object({ id: z.string(), positive: z.number(), negative: z.number() }),
    ),
    complete: z.literal(true),
  }),
  get_authoring_options: z
    .object({
      sections: z.array(scopeName),
      categories: z.array(z.string()),
      courseCategories: z.array(z.string()),
      updateCategories: z.array(z.string()),
      complete: z.literal(true),
    })
    .passthrough(),
  list_media: z.object({
    media: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        type: z.string(),
        bytes: z.number(),
        url: z.string(),
      }),
    ),
    ...listPage,
  }),
  prepare_media_upload: z.object({
    id: z.uuid(),
    upload: z.union([
      z.object({
        url: z.string(),
        method: z.literal("PUT"),
        headers: z.record(z.string(), z.string()),
      }),
      z.object({
        protocol: z.literal("tus"),
        url: z.string(),
        headers: z.record(z.string(), z.string()),
        metadata: z.record(z.string(), z.string()),
        chunkSize: z.number(),
      }),
    ]),
    nextAction: z.string(),
  }),
  complete_media_upload: z.object({ url: z.string() }),
  get_reporting_scopes: z
    .object({
      organizationWide: z.boolean(),
      teams: z.array(scopeName),
      groups: z.array(scopeName),
      courses: z.array(courseName),
    })
    .passthrough(),
  learning_report: z
    .object({
      rows: z.array(
        z
          .object({
            person: scopeName,
            team: z.object({ id: z.string().nullable(), name: z.string() }),
            groups: z.array(scopeName),
            course: courseName,
            assignment: z.enum(["assigned", "optional"]),
            assignedAt: z.string().nullable(),
            savedDueDate: z.string().nullable(),
            dueDate: z.string().nullable(),
            status: z.enum([
              "not_started",
              "in_progress",
              "complete",
              "overdue",
            ]),
            complete: z.boolean(),
            overdue: z.boolean(),
            completionPercent: z.number(),
          })
          .passthrough(),
      ),
      total: z.number(),
      totals: z.object({
        assigned: z.object({
          total: z.number(),
          complete: z.number(),
          overdue: z.number(),
          not_started: z.number(),
          in_progress: z.number(),
        }),
        optional: z.object({
          total: z.number(),
          complete: z.number(),
          not_started: z.number(),
          in_progress: z.number(),
        }),
      }),
      ...listPage,
      asOf: z.string(),
      dueDatesEnabled: z.boolean(),
    })
    .passthrough(),
  feedback_report: z
    .object({
      rows: z.array(
        z.object({
          id: z.string(),
          contentId: z.string().nullable(),
          title: z.string(),
          kind: z.enum(["doc", "brief", "course", "general", "removed"]),
          version: z.number().nullable(),
          person: z.string(),
          rating: z.enum(["up", "down"]),
          comment: z.string(),
          updatedAt: z.string(),
        }),
      ),
      total: z.number(),
      ...listPage,
    })
    .passthrough(),
  manage_course_assignment: z.object({
    ok: z.literal(true),
    id: z.uuid(),
    revision: z.number(),
    publishedRevision: z.number().nullable(),
    nextAction: z.string(),
  }),
} satisfies Record<McpToolName, z.ZodType>;
export const mcpErrorCodes = [
  "permission_denied",
  "reconsent_required",
  "revision_conflict",
  "report_changed",
  "not_found",
  "validation_error",
  "unsupported",
  "rate_limited",
  "unavailable",
] as const;
export const mcpManualOperations = [
  {
    operation: "privacy_policy",
    terms: ["privacy", "policy"],
    path: "/admin",
    location: "Organization Settings → Privacy",
    instruction:
      "An administrator must edit and publish the privacy policy in Fieldbook. MCP cannot read or change privacy settings.",
  },
  {
    operation: "accounts_and_roles",
    terms: ["user", "account", "role", "people", "import"],
    path: "/admin",
    location: "People",
    instruction:
      "An administrator must manage accounts, roles and roster imports in Fieldbook. Reports never grant account-editing access.",
  },
  {
    operation: "teams_and_groups",
    terms: ["team", "group", "curricul"],
    path: "/admin",
    location: "Teams / Learning groups / Curricula",
    instruction:
      "An administrator must manage teams, learning-group membership and curricula in Fieldbook. MCP course assignments use existing audiences only.",
  },
  {
    operation: "docs_hierarchy",
    terms: ["section", "hierarchy", "reorder", "folder"],
    path: "/admin",
    location: "Organization Settings → Docs",
    instruction:
      "An administrator must create or reorder Docs sections in Fieldbook. Publishers can place content in existing sections.",
  },
  {
    operation: "installation_settings",
    terms: [
      "setting",
      "brand",
      "identity",
      "access",
      "delete",
      "restore",
      "progress reset",
      "complete user",
    ],
    path: "/admin",
    location: "Organization Settings",
    instruction:
      "An administrator must manage installation settings, content recovery or learner completion overrides manually. These operations are outside this MCP contract.",
  },
] as const;
