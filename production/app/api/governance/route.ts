import {
  actor,
  sameOrigin,
  requireAdmin,
  HttpError,
  errorResponse,
} from "@production/lib/auth";
import { db } from "@production/lib/db";
import {
  governanceSchema,
  pendingSchema,
} from "@production/lib/governance-schema";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireAdmin(user);
    const body = await req.json();
    const parsed = (
      body.operation === "pending" ? pendingSchema : governanceSchema
    ).safeParse(body);
    if (!parsed.success)
      throw new HttpError(
        400,
        parsed.error.issues.map((i) => i.message).join(" "),
      );
    const { data, error } = await db().rpc("fb_save_governance", {
      p_actor: user.id,
      p_expected: parsed.data.expected,
      p_operation: body.operation === "pending" ? "pending" : "save",
      p_data: parsed.data,
    });
    if (error) {
      if (error.message.includes("Revision conflict"))
        throw new HttpError(409, "Governance changed. Reload before saving.");
      if (error.code === "P0001") throw new HttpError(400, error.message);
      throw error;
    }
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
