import { actor, HttpError, errorResponse } from "@server/auth";
import { progressDetail, progressReport } from "@server/progress-report";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const user = await actor();
    if (!user) throw new HttpError(401, "Sign in to view progress.");
    const params = new URL(req.url).searchParams;
    if ([...params.keys()].some((key) => key !== "personId"))
      throw new HttpError(400, "Invalid report request.");
    const id = params.get("personId");
    if (
      id !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new HttpError(400, "Choose a person.");
    return Response.json(
      id ? await progressDetail(user, id) : await progressReport(user),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "api/reports/progress");
  }
}
