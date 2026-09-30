import {
  actor,
  sameOrigin,
  requireAdmin,
  HttpError,
  errorResponse,
} from "@server/auth";
import { env } from "@server/env";
import { db } from "@server/db";
import {
  governanceSchema,
  pendingSchema,
} from "@server/governance-schema";
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
      const imageIds = [
        ...new Set(
          (parsed.data as typeof governanceSchema._output).curricula?.flatMap(
            (curriculum) =>
              curriculum.cardArt?.imageUrl
                ? [curriculum.cardArt.imageUrl.split("/").pop()!.split(".")[0]]
                : [],
          ) || [],
        ),
      ];
      if (imageIds.length) {
        const { data: media, error: mediaError } = await db()
          .from("fb_media")
          .select("id,mime")
          .in("id", imageIds)
          .eq("ready", true);
        if (mediaError) throw mediaError;
        if (
          media?.length !== imageIds.length ||
          media.some(
            (item) =>
              !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
                item.mime,
              ),
          )
        )
          throw new HttpError(
            400,
            "Choose a ready image upload for curriculum artwork.",
          );
      }
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
