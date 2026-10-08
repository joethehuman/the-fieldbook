import { test, expect } from "@playwright/test";
import { updatesForUser } from "../../lib/learning-groups";
import { guest } from "../../lib/guest-recommendations";
import type { Content } from "../../lib/types";

test("installed Updates match the shared feed with invalid dates and deterministic ties", async ({
  page,
  request,
}) => {
  const group = { id: "updates-policy-readers", name: "Readers" };
  const make = (
    number: number,
    title: string,
    patch: Partial<Content> = {},
  ): Content => ({
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    kind: "brief",
    status: "published",
    title,
    summary: "Update selection fixture.",
    body: "Published update.",
    category: "News",
    folder: "",
    version: 1,
    duration: 5,
    groups: [group.id],
    assignments: [],
    lessons: [],
    questions: [],
    updatedAt: "invalid",
    ...patch,
  });
  const content = [
    make(4, "Undated B"),
    make(2, "Created fallback B", { createdAt: "2026-10-07T00:00:00Z" }),
    make(5, "Invalid feed date fallback", {
      feedAt: "invalid",
      updatedAt: "2026-10-08T00:00:00Z",
    }),
    make(3, "Undated A"),
    make(1, "Created fallback A", { createdAt: "2026-10-07T00:00:00Z" }),
  ];
  const shared = updatesForUser(content, { ...guest, groups: [group.id] }, [
    group,
  ]);
  expect(shared.forYou.map((item) => item.title)).toEqual([
    "Invalid feed date fallback",
    "Created fallback A",
  ]);
  expect(shared.other.map((item) => item.title)).toEqual([
    "Created fallback B",
    "Undated A",
    "Undated B",
  ]);
  await request.post("http://127.0.0.1:3130/fixture", {
    data: {
      settings: { access: "public", logoUrl: "", guestGroupId: group.id },
      groups: [group],
      documents: content.map((item) => ({
        id: item.id,
        draft: item,
        published: item,
        revision: 1,
        published_revision: 1,
      })),
    },
  });
  await page.goto("/updates");
  for (const [heading, items] of [
    ["For you", shared.forYou],
    ["More updates", shared.other],
  ] as const) {
    const section = page.locator("section.updates-section").filter({
      has: page.getByRole("heading", { name: heading, exact: true }),
    });
    await expect(section.getByRole("heading", { level: 3 })).toHaveText(
      items.map((item) => item.title),
    );
  }
});
