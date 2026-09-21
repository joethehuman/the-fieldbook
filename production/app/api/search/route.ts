import { actor, errorResponse } from "@production/lib/auth";
import { searchPublished } from "@production/lib/search";
import type { SearchFilter } from "@/lib/search";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await actor();
    const params = new URL(request.url).searchParams;
    return Response.json(
      await searchPublished(
        params.get("q") || "",
        (params.get("type") || "all") as SearchFilter,
        user,
      ),
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
    );
  } catch (error) {
    return errorResponse(error, "api/search");
  }
}
