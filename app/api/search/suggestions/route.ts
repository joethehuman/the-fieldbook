import { readerActor, errorResponse } from "@server/auth";
import { readerSearchSuggestions } from "@server/reader";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await readerActor();
    return Response.json(await readerSearchSuggestions(user), {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    return errorResponse(error, "api/search/suggestions");
  }
}
