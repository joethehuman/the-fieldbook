import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const backend = `http://127.0.0.1:${process.env.FIELDBOOK_BACKEND_TEST_PORT || "3130"}`;
const demo = `http://127.0.0.1:${process.env.FIELDBOOK_DEMO_TEST_PORT || "3132"}`;
const id = "00000000-0000-4000-8000-000000000021";

async function fixture(request: any, access = "public", extra = {}) {
  await request.post(`${backend}/fixture`, {
    data: {
      settings: { name: "The Fieldbook", accent: "#0069ff", access },
      documents: [
        {
          id,
          published: {
            id,
            kind: "doc",
            status: "published",
            title: "Protected item title",
            summary: "Protected item summary",
          body: "Protected body",
          category: "",
          folder: "",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-02",
          groups: [],
          assignments: [],
          lessons: [],
          questions: [],
          version: 1,
          },
          draft: { title: "SECRET DRAFT" },
          revision: 2,
          published_revision: 1,
        },
      ],
      ...extra,
    },
  });
}

test("OG: the PNG is universal across privacy and ignores query values without content reads", async ({
  request,
}, info) => {
  await fixture(request);
  const publicImage = await request.get("/api/og?v=1");
  expect(publicImage.status()).toBe(200);
  expect(publicImage.headers()["content-type"]).toContain("image/png");
  expect(publicImage.headers()["cache-control"]).toBe("no-store");
  const png = await publicImage.body();
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  await writeFile(info.outputPath("installation-og.png"), png);
  await fixture(request, "private");
  const privateImage = await request.get(
    `/api/og?title=SECRET&contentId=${id}&accent=red&url=https://attacker.test`,
  );
  expect(await privateImage.body()).toEqual(png);
  const reads = await (await request.get(`${backend}/reads`)).json();
  expect(reads.reads).toBe(0);
});

test("OG: reader and signed-out private responses keep the universal image and protect item metadata", async ({
  request,
  baseURL,
}) => {
  await fixture(request);
  const publicHtml = await (await request.get(`/docs/${id}`)).text();
  expect(publicHtml).toContain(
    `property="og:image" content="${baseURL}/api/og?v=1"`,
  );
  expect(publicHtml).toContain(
    'name="twitter:card" content="summary_large_image"',
  );
  expect(publicHtml).toContain(
    `name="twitter:image" content="${baseURL}/api/og?v=1"`,
  );
  expect(publicHtml).toContain(
    'property="og:title" content="Protected item title | The Fieldbook"',
  );
  expect((await request.get("/docs/missing")).status()).toBe(404);
  await fixture(request, "private");
  for (const destination of [`/docs/${id}`, "/docs/missing", "/"]) {
    const response = await request.get(destination, {
      headers: { "User-Agent": "Slackbot-LinkExpanding 1.0" },
    });
    const html = await response.text();
    expect(html).toContain(
      `property="og:image" content="${baseURL}/api/og?v=1"`,
    );
    expect(html).not.toContain("Protected item title");
    expect(html).not.toContain("Protected item summary");
    expect(html).not.toContain("SECRET DRAFT");
  }
});

test("OG: saved identity changes are reflected and provider failures use the generic fallback", async ({
  request,
}, info) => {
  await fixture(request, "private", {
    settings: {
      name: "A worldwide learning and knowledge workspace for every team",
      accent: "#128C64",
      access: "private",
    },
  });
  const longImage = await request.get("/api/og?v=1");
  expect(longImage.status()).toBe(200);
  await writeFile(info.outputPath("long-name-og.png"), await longImage.body());
  await fixture(request, "private", { fail: true });
  const fallback = await request.get("/api/og?v=1");
  expect(fallback.status()).toBe(200);
  await writeFile(info.outputPath("fallback-og.png"), await fallback.body());
  expect(fallback.headers()["cache-control"]).toBe("no-store");
});

test("OG: static demo exports the shared card and large-image metadata", async ({
  request,
}) => {
  const html = await (await request.get(demo)).text();
  expect(html).toContain('property="og:image"');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  const match = html.match(/property="og:image" content="([^"]+)"/);
  const pathname = new URL(match![1]).pathname;
  const response = await request.get(`${demo}${pathname}`);
  expect(response.headers()["content-type"]).toContain("image/png");
});
