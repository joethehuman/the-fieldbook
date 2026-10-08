import { test, expect } from "@playwright/test";

test("unrelated Docs do not enlarge Update detail payloads, while Docs retain their navigation", async ({ request }) => {
  const id = "00000000-0000-4000-8000-000000000081";
  const update = {
    id, kind: "brief", status: "published", title: "Payload fixture update",
    summary: "Published summary", body: "Published fixture body",
    category: "Reference", folder: "", version: 1, duration: 5,
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
    groups: [], assignments: [], lessons: [], questions: [],
  };
  const record = (content: typeof update) => ({
    id: content.id, draft: content, published: content, revision: 2,
    published_revision: 1, updated_at: content.updatedAt,
  });
  const docs = Array.from({ length: 500 }, (_, index) => ({
    ...update, id: `00000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}`,
    kind: "doc", title: `Unrelated reference ${String(index).padStart(3, "0")}`,
  }));
  const install = async (includeDocs: boolean) => {
    const response = await request.post("http://127.0.0.1:3130/fixture", {
      data: { settings: { access: "public", logoUrl: "" },
        documents: [record(update), ...(includeDocs ? docs.map(record) : [])] },
    });
    expect(response.ok()).toBe(true);
  };
  await install(false);
  const small = await request.get(`/updates/${id}`);
  expect(small.status()).toBe(200);
  const smallBody = await small.body();
  await install(true);
  const large = await request.get(`/updates/${id}`);
  expect(large.status()).toBe(200);
  const largeBody = await large.body();
  expect(largeBody.toString()).toContain(update.body);
  expect(largeBody.toString()).not.toContain(docs[0].title);
  expect(Math.abs(largeBody.length - smallBody.length)).toBeLessThan(1024);
  const doc = await request.get(`/docs/${docs[0].id}`);
  expect(doc.status()).toBe(200);
  const docBody = await doc.text();
  expect(docBody).toContain(docs[0].title);
  expect(docBody).toContain(docs.at(-1)!.title);
});
