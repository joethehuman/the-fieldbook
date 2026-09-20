import { z } from "zod";
import {
  actor,
  sameOrigin,
  requireAdmin,
  HttpError,
  errorResponse,
} from "@production/lib/auth";
import { db } from "@production/lib/db";
const schema = z
  .object({
    operation: z.enum([
      "assign",
      "unassign",
      "complete",
      "reset",
      "target",
      "untarget",
    ]),
    contentId: z.uuid(),
    expected: z.number().int().positive(),
    groupId: z.string().min(1).max(80).optional(),
    userId: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    progressExpected: z.number().int().nonnegative().optional(),
    due: z.object({ type: z.literal("none") }).optional(),
  })
  .superRefine((a, ctx) => {
    if (!!a.groupId === !!a.userId)
      ctx.addIssue({ code: "custom", message: "Choose one group or person." });
    if (
      ["complete", "reset"].includes(a.operation) &&
      (!a.userId || !a.version || a.progressExpected === undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a person and current course progress.",
      });
    if (
      ["assign", "unassign", "target", "untarget"].includes(a.operation) &&
      (!a.groupId || a.userId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a learning group.",
      });
  });
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireAdmin(user);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success)
      throw new HttpError(
        400,
        parsed.error.issues.map((i) => i.message).join(" "),
      );
    const { data, error } = await db().rpc("fb_manage_learning", {
      p_actor: user.id,
      p_data: { ...parsed.data, due: { type: "none" } },
    });
    if (error)
      throw new HttpError(
        error.message.includes("changed") ? 409 : 400,
        error.message,
      );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
