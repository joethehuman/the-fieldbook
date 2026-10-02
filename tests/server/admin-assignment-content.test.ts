import test from "node:test";
import assert from "node:assert/strict";
import { adminSnapshot } from "../../server/admin-snapshot";
import { defaultSettings } from "../../lib/settings";
import { seedContent } from "../../lib/seed";
import type { User } from "../../lib/types";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: User = {
  id: id(1),
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
  active: true,
  groups: [],
};
const person: User = { ...admin, id: id(2), role: "learner" };
const course = {
  ...seedContent.find((item) => item.kind === "course")!,
  id: id(101),
  title: "Published course",
  status: "published" as const,
  body: "Published course body",
  lessons: [
    {
      id: "lesson",
      title: "Published lesson",
      body: "Quartz harbor lesson text",
    },
  ],
  groups: ["audience"],
  updatedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
};
const update = {
  ...seedContent.find((item) => item.kind === "brief")!,
  id: id(102),
  title: "Published Update",
  status: "published" as const,
  summary: "Published summary",
  body: "Amber lighthouse published Update body",
  category: "Sales",
  groups: ["audience"],
  updatedAt: "2026-08-02T00:00:00.000Z",
  createdAt: "2026-07-02T00:00:00.000Z",
};
const documents = [
  course,
  update,
  { ...update, id: id(103), title: "Second Update" },
].map((published) => ({
  id: published.id,
  published,
  draft: { ...published, title: "Unsaved title", body: "UNPUBLISHED CHANGES" },
  revision: 8,
  published_revision: 6,
  updated_at: "2026-09-30T00:00:00.000Z",
  deleted_at: null,
}));
const draftOnly = {
  id: id(104),
  published: null,
  draft: { ...update, id: id(104), status: "draft", body: "DRAFT ONLY SECRET" },
  revision: 1,
  published_revision: null,
  updated_at: "2026-09-30T00:00:00.000Z",
  deleted_at: null,
};
const deleted = {
  ...documents[1],
  id: id(105),
  deleted_at: "2026-09-30T00:00:00.000Z",
};
const reference = {
  ...documents[1],
  id: id(106),
  published: { ...update, id: id(106), kind: "doc" },
};
const assignmentSelect = "id,published,revision,published_revision,updated_at";

async function fixture(run: (requests: URL[]) => Promise<void>) {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://assignment-read.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    FIELDBOOK_URL: "https://example.test",
    FIELDBOOK_OWNER_EMAIL: admin.email,
    FIELDBOOK_HOST: "node",
  });
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "assignment-read.supabase.co");
    requests.push(url);
    if (url.pathname.endsWith("/fb_config"))
      return Response.json({
        settings: defaultSettings,
        revision: 1,
        governance_revision: 9,
        groups: [],
        curricula: [],
      });
    if (
      url.pathname.endsWith("/fb_governance_snapshot") ||
      url.pathname.endsWith("/fb_admin_people_snapshot")
    )
      return Response.json({
        users: [admin, person],
        groups: [],
        teams: [],
        pending: [],
        progress: [],
        revision: 9,
      });
    if (url.pathname.endsWith("/fb_documents")) {
      const select = url.searchParams.get("select") || "";
      if (select === assignmentSelect) {
        assert.equal(url.searchParams.get("deleted_at"), "is.null");
        assert.equal(
          url.searchParams.get("published->>kind"),
          "in.(course,brief)",
        );
        assert.equal(url.searchParams.get("order"), "id.asc");
        assert.equal(url.searchParams.get("limit"), "500");
        const rows = [...documents, draftOnly, deleted, reference].filter(
          (row) =>
            !row.deleted_at &&
            row.published &&
            ["course", "brief"].includes(row.published.kind),
        );
        const offset = Number(url.searchParams.get("offset") || 0);
        // Simulate an installation with a cap below the requested page size.
        const page = rows
          .slice(offset, offset + 1)
          .map((row) => ({
            id: row.id,
            published: row.published,
            revision: row.revision,
            published_revision: row.published_revision,
            updated_at: row.updated_at,
          }));
        return Response.json(page, {
          headers: {
            "Content-Range": `${offset}-${offset + page.length - 1}/${rows.length}`,
          },
        });
      }
      if (url.searchParams.get("draft->>kind") === "eq.course")
        return Response.json([documents[0]], {
          headers: { "Content-Range": "0-0/1" },
        });
      assert.ok(
        select.includes("title:draft->>title"),
        `Unexpected document read: ${select}`,
      );
      const rows = [...documents, draftOnly].map((row) => ({
        ...row.draft,
        id: row.id,
        revision: row.revision,
        published_revision: row.published_revision,
        updated_at: row.updated_at,
      }));
      return Response.json(rows, {
        headers: { "Content-Range": `0-${rows.length - 1}/${rows.length}` },
      });
    }
    throw new Error(`Unexpected read: ${url.pathname}`);
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
}

test("governance reads all published assignable content and preserves published text and metadata", async () => {
  await fixture(async (requests) => {
    const result = await adminSnapshot(admin, "governance");
    assert.deepEqual(
      result.publishedContent?.map((item) => item.id),
      documents.map((row) => row.id),
    );
    const publishedCourse = result.publishedContent!.find(
      (item) => item.id === course.id,
    )!;
    assert.equal(publishedCourse.body, course.body);
    assert.deepEqual(publishedCourse.lessons, course.lessons);
    const publishedUpdate = result.publishedContent!.find(
      (item) => item.id === update.id,
    )!;
    assert.equal(publishedUpdate.body, update.body);
    assert.equal(publishedUpdate.summary, update.summary);
    assert.equal(publishedUpdate.category, "Sales");
    assert.deepEqual(publishedUpdate.groups, ["audience"]);
    assert.equal(publishedUpdate.updatedAt, update.updatedAt);
    assert.equal(publishedUpdate.createdAt, update.createdAt);
    assert.equal(publishedUpdate.revision, 8);
    assert.equal(publishedUpdate.publishedRevision, 6);
    assert.ok(
      !JSON.stringify(result.publishedContent).includes("UNPUBLISHED CHANGES"),
    );
    assert.ok(
      !JSON.stringify(result.publishedContent).includes("DRAFT ONLY SECRET"),
    );
    assert.ok(
      !result.publishedContent!.some((item) =>
        [draftOnly.id, deleted.id, reference.id].includes(item.id),
      ),
    );
    assert.equal(
      result.content.find((item) => item.id === course.id)!.body,
      "UNPUBLISHED CHANGES",
    );
    const assignmentReads = requests.filter(
      (url) => url.searchParams.get("select") === assignmentSelect,
    );
    assert.deepEqual(
      assignmentReads.map((url) => Number(url.searchParams.get("offset") || 0)),
      [0, 1, 2],
    );
    assert.ok(
      assignmentReads.every(
        (url) => !url.searchParams.get("select")!.includes("draft"),
      ),
    );
  });
});

test("people and person scopes never fetch the assignment-content payload, and unauthorized users trigger no reads", async () => {
  await fixture(async (requests) => {
    for (const scope of ["people", "person"] as const) {
      requests.length = 0;
      const result = await adminSnapshot(
        admin,
        scope,
        scope === "person" ? person.id : undefined,
      );
      assert.equal(
        requests.filter(
          (url) => url.searchParams.get("select") === assignmentSelect,
        ).length,
        0,
      );
      assert.equal(
        result.content.find((item) => item.id === update.id)!.body,
        "",
      );
      assert.ok(
        !result.publishedContent?.some(
          (item) => item.kind === "brief" && item.body,
        ),
      );
      assert.equal(
        requests.filter(
          (url) => url.searchParams.get("draft->>kind") === "eq.course",
        ).length,
        scope === "person" ? 1 : 0,
      );
    }
    requests.length = 0;
    for (const role of ["contributor", "manager", "learner"] as const) {
      await assert.rejects(
        adminSnapshot({ ...admin, role }, "governance"),
        (error: any) => error.status === 403,
      );
      assert.equal(requests.length, 0);
    }
  });
});
