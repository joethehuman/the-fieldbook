import { actor, sameOrigin, errorResponse } from "@production/lib/auth";
import { saveSettings } from "@production/lib/save-settings";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    return Response.json(await saveSettings(user, await req.json()));
  } catch (e) {
    return errorResponse(e, "api/settings");
  }
}
