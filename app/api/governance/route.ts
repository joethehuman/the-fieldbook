import {
  actor,
  sameOrigin,
  requireAdmin,
  HttpError,
  errorResponse,
} from "@server/auth";
import { installation } from "@server/installation";
import { data as dataStore } from "@server/data";
import { governanceSchema, pendingSchema } from "@server/governance-schema";
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
        const media = await dataStore().findCurriculumArtwork(imageIds);
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
      const owner = await dataStore().findOwnerProfile(installation().owner);
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
    const data = await dataStore().saveGovernance(
      user.id,
      parsed.data.expected,
      body.operation === "pending" ? "pending" : "save",
      parsed.data,
    );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "api/governance");
  }
}
