import { publicBranding } from "@server/branding";
import { errorResponse } from "@server/errors";

/** Public identity only, for client-side recovery screens. */
export async function GET() {
  try {
    return Response.json(await publicBranding(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "api/branding");
  }
}
