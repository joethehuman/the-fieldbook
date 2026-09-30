import { actor, sameOrigin, errorResponse } from "@server/auth";
import { saveSettings } from "@server/save-settings";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    return Response.json(await saveSettings(user, await req.json()));
  } catch (e) {
    return errorResponse(e, "api/settings");
  }
}
