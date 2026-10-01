import { test, expect } from "@playwright/test";

const backend = "http://127.0.0.1:3130";
const id = "00000000-0000-4000-8000-000000000081";
const doc = {
  id,
  kind: "doc",
  status: "published",
  title: "Cached reference",
  summary: "A published reference.",
  body: "Visible published body.",
  category: "Getting started",
  folder: "",
  version: 1,
  duration: 5,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  groups: [],
  assignments: [],
  lessons: [],
  questions: [],
};

test("published reader data is reused, then expired after publish and unpublish", async ({
  page,
  request,
  baseURL,
}) => {
  await request.post(`${backend}/fixture`, {
    data: {
      settings: { access: "public", logoUrl: "" },
      documents: [
        {
          id,
          draft: doc,
          published: doc,
          revision: 2,
          published_revision: 1,
        },
      ],
    },
  });
  const path = `/docs/${id}`;
  const first = await request.get(path);
  expect(first.status()).toBe(200);
  expect(await first.text()).toContain(doc.title);
  const firstReads = (await (await request.get(`${backend}/reads`)).json()).readQueries as string[];
  const projection = "id,kind:published->>kind,status:published->>status";
  const publishedReads = (queries: string[]) => queries.filter(query => new URLSearchParams(query).get("select") !== projection);
  expect(firstReads.filter(query => new URLSearchParams(query).get("select") === projection)).toHaveLength(1);
  expect(publishedReads(firstReads)).toHaveLength(2);
  const second = await request.get(path);
  expect(second.status()).toBe(200);
  const secondReads = (await (await request.get(`${backend}/reads`)).json()).readQueries as string[];
  // Admission rechecks the current publication state; only published index/body data is reused.
  expect(secondReads.filter(query => new URLSearchParams(query).get("select") === projection)).toHaveLength(2);
  expect(publishedReads(secondReads)).toEqual(publishedReads(firstReads));

  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  await page.context().addCookies([
    {
      name: "sb-test-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            ...token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString("base64url"),
      domain: "localhost",
      path: "/",
    },
  ]);
  const publish = await page.request.post("/api/content", {
    headers: { origin: baseURL! },
    data: {
      content: { ...doc, title: "Revised reference" },
      expected: 2,
      publish: true,
    },
  });
  expect(publish.status()).toBe(200);
  const saved = await publish.json();
  expect(await (await request.get(path)).text()).toContain("Revised reference");

  const unpublish = await page.request.post("/api/content", {
    headers: { origin: baseURL! },
    data: { content: saved, expected: saved.revision, unpublish: true },
  });
  expect(unpublish.status()).toBe(200);
  expect((await request.get(path)).status()).toBe(404);
});
