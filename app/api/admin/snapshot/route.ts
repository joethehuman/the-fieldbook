import {
  actor,
  errorResponse,
  HttpError,
  requireAdmin,
} from "@server/auth";
import { adminSnapshot, type AdminScope } from "@server/admin-snapshot";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const scope = new URL(req.url).searchParams.get("scope");
    if (scope !== "content" && scope !== "governance" && scope !== "feedback" && scope !== "deleted")
      throw new HttpError(400, "Choose an administration section.");
    const user = await actor();
    requireAdmin(user);
    return Response.json(
      { data: await adminSnapshot(user, scope as AdminScope), user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "api/admin/snapshot");
  }
}
