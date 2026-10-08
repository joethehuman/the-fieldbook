import { test, expect } from "@playwright/test";
import type { Content } from "../../lib/types";

for (const signedIn of [false, true]) {
  test(`${signedIn ? "learner" : "guest"} course and curriculum responses preserve recommendations without private workspace data`, async ({
    request,
    page,
  }) => {
    const id = (value: number) =>
      `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
    const groupId = "PRIVATE-GUEST-AUDIENCE";
    const teamId = "PRIVATE-ORGANIZATION";
    const publicGroup = "reader-audience";
    const courses: Content[] = [
      "Recommended one",
      "Recommended two",
      "Optional course",
    ].map((title, index) => ({
      id: id(index + 1),
      kind: "course",
      status: "published",
      title,
      summary: "Public course summary",
      body: "Public introduction",
      category: "Learning",
      folder: "",
      version: 1,
      duration: 5,
      updatedAt: "2026-10-08T00:00:00Z",
      groups: index < 2 ? [groupId, publicGroup] : [],
      assignments:
        index < 2
          ? [groupId, publicGroup].map((groupId) => ({
              groupId,
              assignedAt: "2026-10-01T00:00:00Z",
              due: { type: "none" as const },
            }))
          : [],
      lessons: [
        { id: "lesson", title: "Public lesson", body: "Public lesson body" },
      ],
      questions: [
        {
          id: "quiz",
          prompt: "Choose one",
          options: ["First", "Second"],
          answer: 1,
        },
      ],
    }));
    const fixture = {
      settings: {
        access: "public",
        guestGroupId: groupId,
        organizationTeamId: teamId,
        logoUrl: "",
      },
      groups: [
        { id: publicGroup, name: "Readers", requiredCourseIds: [id(1), id(2)] },
        {
          id: groupId,
          name: "PRIVATE-GROUP-NAME",
          requiredCourseIds: [id(1), id(2)],
        },
      ],
      teams: [
        { id: teamId, name: "PRIVATE-TEAM-NAME", system: "organization" },
      ],
      curricula: [
        {
          id: "intro",
          name: "Public curriculum",
          description: "Start here",
          status: "published",
          courseIds: [id(1), id(2), id(99)],
        },
        {
          id: "PRIVATE-CURRICULUM",
          name: "PRIVATE-CURRICULUM-NAME",
          status: "draft",
          courseIds: [id(99)],
        },
      ],
      users: [
        {
          id: id(10),
          auth_user_id: id(10),
          email: "reader@example.test",
          name: "Reader",
          role: "learner",
          active: true,
          groups: [publicGroup],
        },
        {
          id: id(80),
          email: "PRIVATE-PERSON@example.test",
          name: "PRIVATE-PERSON",
          role: "learner",
          active: true,
          groups: [groupId],
        },
      ],
      progress: [
        {
          user_id: id(80),
          content_id: id(1),
          version: 1,
          lessons: ["PRIVATE-PROGRESS"],
          passed: true,
          attempts: [],
        },
      ],
      feedback: [
        {
          id: id(81),
          user_id: id(80),
          content_id: id(1),
          comment: "PRIVATE-FEEDBACK",
          rating: "up",
        },
      ],
      documents: [
        ...courses.map((course) => ({
          id: course.id,
          published: course,
          draft: { ...course, title: "PRIVATE-DRAFT" },
          revision: 2,
          published_revision: 1,
        })),
        {
          id: id(99),
          published: null,
          draft: {
            ...courses[0],
            id: id(99),
            title: "PRIVATE-DRAFT-ONLY",
            status: "draft",
          },
          revision: 1,
          published_revision: null,
        },
      ],
    };
    await request.post("http://127.0.0.1:3130/fixture", { data: fixture });
    if (signedIn) {
      const token = await (
        await request.post("http://127.0.0.1:3130/auth/v1/token", { data: {} })
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
    }
    const client = signedIn ? page.request : request;
    for (const path of ["/courses", "/curricula/intro", `/courses/${id(1)}`]) {
      for (const headers of [{}, { RSC: "1", "sec-fetch-dest": "empty" }] as Record<string, string>[]) {
        const response = await client.get(path, { headers });
        expect(response.status()).toBe(200);
        const body = await response.text();
        expect(body, `${path} (${headers.RSC ? "RSC" : "HTML"})`).toContain("Recommended one");
        expect(body).not.toContain("PRIVATE-");
        expect(body).not.toMatch(/\\?"(?:answer|correctOptionIds)\\?":/);
        expect(body).not.toContain(id(99));
        if (!signedIn) {
          expect(body).not.toContain("organizationTeamId");
          if (path === "/courses")
            expect(body).toContain("guest-recommendations");
        }
      }
    }
    await page.goto("/courses/for-you");
    await expect(
      page.getByRole("heading", { name: "Recommended one", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recommended two", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Optional course", exact: true }),
    ).toHaveCount(0);

    await request.post("http://127.0.0.1:3130/fixture", {
      data: {
        ...fixture,
        settings: { ...fixture.settings, access: "private" },
      },
    });
    for (const path of ["/courses", "/curricula/intro"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toContain("/auth/sign-in");
      const body = await response.text();
      expect(body).not.toContain("Recommended one");
      expect(body).not.toContain("PRIVATE-");
    }
  });
}
