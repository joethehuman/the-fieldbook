import {
  actor,
  sameOrigin,
  requireAdmin,
  HttpError,
  errorResponse,
} from "@production/lib/auth";
import { env } from "@production/lib/env";
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
    const { error: learningSetupError } = await db()
      .from("fb_config")
      .select("curricula")
      .limit(0);
    if (learningSetupError)
      throw new HttpError(
        503,
        "Learning groups setup is incomplete. Apply the learning-groups migration before saving.",
      );
    if (
      body.onboardingStart ||
      body.users?.some((u: any) => u.onboardingStart)
    ) {
      const { error: setupError } = await db()
        .from("fb_profiles")
        .select("onboarding_start")
        .limit(0);
      if (setupError)
        throw new HttpError(
          503,
          "Preview setup is incomplete. Onboarding changes are not available yet.",
        );
    }
    if (body.operation !== "pending") {
      const { data: owner, error: ownerError } = await db()
        .from("fb_profiles")
        .select("id")
        .eq("email", env().owner)
        .maybeSingle();
      if (ownerError) throw ownerError;
      const incomingOwner = body.users?.find(
        (u: { id: string }) => u.id === owner?.id,
      );
      if (
        owner &&
        (!incomingOwner ||
          !incomingOwner.active ||
          incomingOwner.role !== "admin")
      )
        throw new HttpError(
          400,
          "The installation owner must remain an active administrator.",
        );
    }
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
    return errorResponse(e, "api/governance");
  }
}
