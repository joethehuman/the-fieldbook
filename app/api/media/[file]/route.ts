import { actor, errorResponse } from "@server/auth";
import { signedMediaUrl } from "@server/media";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  try {
    const { file } = await params;
    const url = await signedMediaUrl(file, await actor());
    return new Response(null, {
      status: 307,
      headers: {
        Location: url,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e, "api/media/[file]");
  }
}
