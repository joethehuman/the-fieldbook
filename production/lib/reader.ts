import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { readerActor as verifiedReaderActor } from "./auth";
import {
  assertCanRead,
  canRead,
  document,
  readConfig,
  redact,
} from "./content";
import { db, check } from "./db";
import { readAll } from "./read-all";
import { HttpError } from "./errors";
import { brandingFromSettings } from "@/lib/branding";
import {
  effectiveGroups,
  type Content,
  type Curriculum,
  type Progress,
  type User,
} from "@/lib/types";
import { guest, guestRecommendations } from "@/lib/guest-recommendations";
import { orderedDocCategories, type DocLink } from "@/lib/docs-navigation";
import { publicSettings } from "@/lib/settings";
import type { Metadata } from "next";
import { env } from "./env";
import { contentPath } from "@/lib/navigation";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { publishedReaderTag } from "./reader-cache";

export type ReaderItem = Pick<
  Content,
  | "id"
  | "kind"
  | "title"
  | "summary"
  | "category"
  | "folder"
  | "sectionId"
  | "status"
  | "createdAt"
  | "updatedAt"
>;
type IndexRow = ReaderItem & {
  groups: string[];
};
type CourseRow = IndexRow & {
  assignments?: Content["assignments"];
  coverImageUrl?: string;
  duration?: number;
  version?: number;
  lessons?: Content["lessons"];
  questions?: Content["questions"];
};
const validId =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Request-local access and metadata reuse; only published snapshots persist.
async function returnPath(fallback: string) {
  return (await headers()).get("x-fieldbook-reader-return") || fallback;
}
const readerActor = cache(verifiedReaderActor);
const publishedIndex = unstable_cache(
  async (_installation: string, _governanceRevision: number) =>
    readAll((from, to) =>
      db()
        .from("fb_documents")
        .select(
          "id,title:published->>title,summary:published->>summary,category:published->>category,folder:published->>folder,sectionId:published->>sectionId,kind:published->>kind,status:published->>status,createdAt:published->>createdAt,updatedAt:published->>updatedAt,groups:published->groups",
          { count: "exact" },
        )
        .not("published", "is", null)
        .order("id")
        .range(from, to),
    ),
  ["fieldbook-reader-index-v1"],
  { tags: [publishedReaderTag], revalidate: 300 },
);
const publishedCourseIndex = unstable_cache(
  async (_installation: string, _governanceRevision: number) =>
    readAll((from, to) =>
      db()
        .from("fb_documents")
        .select(
          "id,title:published->>title,summary:published->>summary,category:published->>category,folder:published->>folder,kind:published->>kind,status:published->>status,createdAt:published->>createdAt,updatedAt:published->>updatedAt,groups:published->groups,assignments:published->assignments,coverImageUrl:published->>coverImageUrl,duration:published->>duration,version:published->>version,lessons:published->lessons,questions:published->questions",
          { count: "exact" },
        )
        .not("published", "is", null)
        .eq("published->>kind", "course")
        .order("id")
        .range(from, to),
    ),
  ["fieldbook-course-index-v1"],
  { tags: [publishedReaderTag], revalidate: 300 },
);
const readerAccess = cache(async (destination: string) => {
  let user: User | null;
  let config: Awaited<ReturnType<typeof canRead>>;
  try {
    [user, config] = await Promise.all([readerActor(), readConfig()]);
    assertCanRead(user, config);
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status))
      redirect(
        `/auth/sign-in?next=${encodeURIComponent(await returnPath(destination))}`,
      );
    throw error;
  }
  return { user, config };
});
function readerBranding(config: Awaited<ReturnType<typeof canRead>>) {
  const branding = brandingFromSettings(config.settings);
  return {
    ...branding,
    accent: config.settings.accent || "#0069ff",
    tagline: config.settings.tagline || "",
  };
}
export const readerContext = cache(async (destination: string) => {
  const { user, config } = await readerAccess(destination);
  const rows = await publishedIndex(env().url, config.governance_revision);
  const published = rows.filter(
    (row) => row.status === "published" && ["doc", "brief"].includes(row.kind),
  ) as unknown as IndexRow[];
  const docs: DocLink[] = published
    .filter((item) => item.kind === "doc")
    .sort(
      (a, b) =>
        (b.updatedAt || "").localeCompare(a.updatedAt || "") ||
        a.id.localeCompare(b.id),
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      folder: item.folder || "",
      sectionId: item.sectionId || undefined,
      kind: "doc",
      status: "published",
    }));
  const settings = publicSettings(config.settings, docs);
  const branding = readerBranding(config);
  const groups = config.groups || [];
  const guestGroup =
    !user && config.settings.access === "public"
      ? groups.find(
          (group: { id: string }) => group.id === config.settings.guestGroupId,
        )
      : undefined;
  const memberships = effectiveGroups(
    user || { ...guest, groups: guestGroup ? [guestGroup.id] : [] },
    groups,
  );
  const updates = published
    .filter((item) => item.kind === "brief")
    .sort((a, b) => {
      const left = Date.parse(a.updatedAt || a.createdAt || "");
      const right = Date.parse(b.updatedAt || b.createdAt || "");
      if (Number.isFinite(left) && Number.isFinite(right))
        return right - left || a.id.localeCompare(b.id);
      if (Number.isFinite(right)) return 1;
      if (Number.isFinite(left)) return -1;
      return a.id.localeCompare(b.id);
    });
  const forYou = updates
    .filter((item) => item.groups?.some((id) => memberships.has(id)))
    .slice(0, 2);
  const featuredIds = new Set(forYou.map((item) => item.id));
  const expose = (item: IndexRow): ReaderItem => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    category: item.category,
    folder: item.folder,
    sectionId: item.sectionId,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
  return {
    user: user ? { id: user.id, name: user.name, role: user.role } : null,
    branding,
    docs,
    docCategoryOrder: orderedDocCategories(
      docs,
      settings.docCategoryOrder || [],
      settings.docSections || [],
    ),
    docSections: settings.docSections || [],
    forYou: forYou.map(expose),
    otherUpdates: updates
      .filter((item) => !featuredIds.has(item.id))
      .map(expose),
    courseTitles: rows
      .filter((item) => item.kind === "course" && item.status === "published")
      .map(({ id, title }) => ({ id, title })),
    curriculumTitles: (config.curricula || [])
      .filter((item: { status: string }) => item.status === "published")
      .map((item: { id: string; name: string }) => ({
        id: item.id,
        title: item.name,
      })),
  };
});

function courseSummary(row: CourseRow): Content {
  return {
    id: row.id,
    kind: "course",
    title: row.title,
    summary: row.summary,
    body: "",
    category: row.category,
    folder: row.folder || "",
    status: "published",
    version: Number(row.version || 1),
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    assignments: row.assignments ?? undefined,
    coverImageUrl: row.coverImageUrl,
    duration: Number(row.duration || 0),
    groups: row.groups || [],
    lessons: (row.lessons || []).map(({ id }) => ({
      id,
      title: "",
      body: "",
    })),
    questions: (row.questions || []).map(({ id }) => ({
      id,
      prompt: "",
      options: [],
    })),
  };
}
export const readerCourses = cache(async () => {
  const { user, config } = await readerAccess("/courses");
  const [rows, progressRows] = await Promise.all([
    publishedCourseIndex(env().url, config.governance_revision),
    user
      ? readAll((from, to) =>
          db()
            .from("fb_progress")
            .select("content_id,version,lessons,passed,attempts", {
              count: "exact",
            })
            .eq("user_id", user.id)
            .order("content_id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);
  const courses = rows
    .filter((row) => row.kind === "course" && row.status === "published")
    .map((row) => courseSummary(row as unknown as CourseRow));
  const curricula = (config.curricula || []).filter(
    (item: { status: string }) => item.status === "published",
  );
  if (!user) {
    const projected = guestRecommendations({
      settings: config.settings,
      groups: config.groups || [],
      curricula,
      content: courses,
    });
    return {
      user: projected.user,
      courses: projected.content,
      groups: projected.groups,
      curricula: projected.curricula,
      settings: projected.settings,
      progress: [] as Progress[],
    };
  }
  const memberships = effectiveGroups(user, config.groups || []);
  const groups = (config.groups || [])
    .filter((group: { id: string }) => memberships.has(group.id))
    .map(
      ({ teamIds: _teamIds, ...group }: { teamIds?: string[]; id: string }) =>
        group,
    );
  const groupIds = new Set(groups.map((group: { id: string }) => group.id));
  const visibleCourses = courses.map((course) => ({
    ...course,
    groups: course.groups.filter((id) => groupIds.has(id)),
    assignments: course.assignments?.filter(
      (assignment) =>
        (assignment.groupId && groupIds.has(assignment.groupId)) ||
        assignment.userId === user.id,
    ),
  }));
  const ids = new Set(courses.map(({ id }) => id));
  return {
    user,
    courses: visibleCourses,
    groups,
    curricula: curricula.map((item: { courseIds: string[] }) => ({
      ...item,
      courseIds: item.courseIds.filter((id) => ids.has(id)),
    })),
    settings: publicSettings(config.settings, visibleCourses),
    progress: progressRows.map((row) => ({
      content_id: row.content_id,
      version: row.version,
      lessons: row.lessons,
      passed: row.passed,
      attempts: row.attempts,
    })) as Progress[],
  };
});

export const readerCurriculum = cache(async (id: string) => {
  const data = await readerCourses();
  const curriculum = data.curricula.find(
    (item: Curriculum) => item.id === id && item.status === "published",
  );
  if (!curriculum) notFound();
  return { data, curriculum };
});

const cachedBody = unstable_cache(
  async (_installation: string, _governanceRevision: number, id: string) => {
    const { data, error } = await db()
      .from("fb_documents")
      .select("id,published,published_revision")
      .eq("id", id)
      .maybeSingle();
    check(error);
    if (!data?.published) return null;
    const item = redact(document(data));
    return item.status === "published" ? item : null;
  },
  ["fieldbook-reader-body-v1"],
  { tags: [publishedReaderTag], revalidate: 300 },
);
const publishedBody = cache(
  async (kind: "doc" | "brief" | "course", id: string) => {
    if (!validId.test(id)) notFound();
    const config = await readConfig();
    const item = await cachedBody(env().url, config.governance_revision, id);
    if (!item) notFound();
    if (item.kind !== kind || item.status !== "published") notFound();
    return item;
  },
);
export const readerItem = cache(async (kind: "doc", id: string) => {
  const destination = "/docs";
  // Start the body early, but access must determine the response before a 404.
  const body = publishedBody(kind, id).then(
    (item) => ({ item }),
    (error: unknown) => ({ error }),
  );
  const context = await readerContext(destination);
  const result = await body;
  if ("error" in result) throw result.error;
  const item = result.item;
  return { context, item };
});
export const readerUpdateItem = cache(async (id: string) => {
  const body = publishedBody("brief", id).then(
    (item) => ({ item }),
    (error: unknown) => ({ error }),
  );
  const { user, config } = await readerAccess("/updates");
  const result = await body;
  if ("error" in result) throw result.error;
  const item = result.item;
  return {
    item,
    context: {
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
      branding: readerBranding(config),
    },
  };
});
export const readerCourseItem = cache(async (id: string) => {
  const { user, config } = await readerAccess("/courses");
  const item = await publishedBody("course", id);
  return {
    item,
    context: {
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
      branding: readerBranding(config),
    },
  };
});

export const readerCourseProgress = cache(async (id: string) => {
  const { user } = await readerAccess("/courses");
  if (!user) return [] as Progress[];
  const { data, error } = await db()
    .from("fb_progress")
    .select("content_id,version,lessons,passed,attempts")
    .eq("user_id", user.id)
    .eq("content_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  check(error);
  return data ? [data as Progress] : [];
});

export function readerMetadata(
  item: Content,
  context: Pick<Awaited<ReturnType<typeof readerContext>>, "branding">,
): Metadata {
  const title = `${item.title} | ${context.branding.name}`;
  const description =
    item.summary.trim() || `${item.title} — ${context.branding.name}`;
  return {
    metadataBase: new URL(env().origin),
    title,
    description,
    alternates: { canonical: contentPath(item.kind, item.id) },
    openGraph: {
      title,
      description,
      siteName: context.branding.name,
      type: item.kind === "course" ? "website" : "article",
      url: contentPath(item.kind, item.id),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    ...(context.branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
