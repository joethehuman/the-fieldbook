import type { Page } from "@playwright/test";
import type { Workspace } from "../../lib/store";
import type { User } from "../../lib/types";

export const authoringUser: User = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Synthetic Admin",
  email: "admin@example.test",
  role: "admin",
  active: true,
  groups: [],
};

export async function syncAuthoringProvider(page: Page, data: Workspace) {
  const published = new Map(
    (data.publishedContent || []).map((item) => [item.id, item]),
  );
  await page.request.post(
    `http://127.0.0.1:${process.env.FIELDBOOK_BACKEND_TEST_PORT || 3130}/fixture`,
    {
      data: {
        settings: data.settings,
        governanceRevision: data.governanceRevision,
        groups: data.groups,
        curricula: data.curricula,
        documents: data.content.map((item) => ({
          id: item.id,
          draft: item,
          published:
            published.get(item.id) ||
            (item.publishedRevision || item.status === "published"
              ? { ...item, status: "published" }
              : null),
          revision: item.revision || 1,
          published_revision: item.publishedRevision || null,
          updated_at: item.updatedAt,
        })),
      },
    },
  );
}

export async function setupAuthoringProvider(page: Page, data: Workspace) {
  const admin = data.users.find((entry) => entry.role === "admin");
  if (admin) Object.assign(admin, authoringUser);
  await syncAuthoringProvider(page, data);
  const token = await (
    await page.request.post(
      `http://127.0.0.1:${process.env.FIELDBOOK_BACKEND_TEST_PORT || 3130}/auth/v1/token`,
      {
        data: {},
      },
    )
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
      url: `http://127.0.0.1:${process.env.FIELDBOOK_SERVER_TEST_PORT || 3128}`,
    },
  ]);
}
