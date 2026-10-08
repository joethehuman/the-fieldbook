import test from "node:test";
import assert from "node:assert/strict";
import { learningData } from "../../server/providers/supabase/data/learning";

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

test("reader progress keeps every course version across page boundaries and provider caps", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const userId = id(9000);
  const rows = Array.from({ length: 500 }, (_, course) =>
    Array.from({ length: course === 0 ? 3 : 2 }, (_, version) => ({
      content_id: id(course + 1),
      version: version + 1,
      lessons: [`lesson-${version + 1}`],
      passed: version === 0,
      attempts: [],
    })),
  ).flat();
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "http://localhost:3000",
    FIELDBOOK_OWNER_EMAIL: "admin@example.test",
    VERCEL_ENV: "",
    FIELDBOOK_ENVIRONMENT: "",
  });
  try {
    for (const cap of [500, 137, 37]) {
      let calls = 0;
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.hostname, "test.supabase.co");
        assert.equal(url.pathname, "/rest/v1/fb_progress");
        assert.equal(url.searchParams.get("user_id"), `eq.${userId}`);
        calls++;
        const order = url.searchParams.get("order")!.split(",");
        const sorted = [...rows].sort((a, b) => {
          for (const term of order) {
            const [key, direction] = term.split(".");
            assert.ok(key === "content_id" || key === "version");
            const difference =
              key === "content_id"
                ? a.content_id.localeCompare(b.content_id)
                : a.version - b.version;
            if (difference)
              return direction === "desc" ? -difference : difference;
          }
          // SQL does not promise an order for ties. Vary it between pages to
          // expose omitted or repeated versions under an incomplete ORDER BY.
          return (calls % 2 ? 1 : -1) * (a.version - b.version);
        });
        const from = Number(url.searchParams.get("offset") || 0);
        const size = Math.min(cap, Number(url.searchParams.get("limit")));
        const page = sorted.slice(from, from + size);
        return Response.json(page, {
          headers: {
            "Content-Range": `${from}-${from + page.length - 1}/${rows.length}`,
          },
        });
      };
      const progress = await learningData.listUserProgress(userId);
      assert.ok(calls > 1);
      assert.equal(progress.length, 1001);
      assert.equal(
        new Set(progress.map((row) => `${row.content_id}:${row.version}`)).size,
        1001,
        `Each course version must appear once with provider cap ${cap}`,
      );
      assert.deepEqual(progress, rows);
    }
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
