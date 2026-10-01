import { actor, errorResponse, HttpError, requireAdmin } from "@server/auth";
import { adminSnapshot, type AdminScope } from "@server/admin-snapshot";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const scope = new URL(req.url).searchParams.get("scope");
    if (
      ![
        "content",
        "people",
        "person",
        "governance",
        "feedback",
        "maintenance",
      ].includes(scope || "")
    )
      throw new HttpError(400, "Choose an administration section.");
    const userId = new URL(req.url).searchParams.get("userId");
    if (
      scope === "person" &&
      (!userId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId,
        ))
    )
      throw new HttpError(400, "Choose a person.");
    if (scope !== "person" && userId)
      throw new HttpError(400, "Choose a person section for course history.");
    const user = await actor();
    requireAdmin(user);
    return Response.json(
      {
        data: await adminSnapshot(
          user,
          scope as AdminScope,
          userId || undefined,
        ),
        user,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "api/admin/snapshot");
  }
}
