import { signedBrandingLogoUrl } from "@production/lib/branding-logo";
import { errorResponse } from "@production/lib/errors";
export const dynamic = "force-dynamic";
// No file/path argument: only the saved installation logo is public.
export async function GET() {
  try {
    return new Response(null, {
      status: 307,
      headers: {
        Location: await signedBrandingLogoUrl(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e, "api/branding/logo");
  }
}
