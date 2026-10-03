import "server-only";
import type {
  McpDataStore,
  McpPage,
  McpCatalogItem,
  McpMediaItem,
} from "../../../ports/mcp-data";
import { db, check } from "../client";
import { HttpError } from "../../../errors";

function failure(error: { code?: string; message: string } | null) {
  if (error?.code === "P0001") {
    if (/access is required/i.test(error.message))
      throw new HttpError(403, "Publishing access is required.");
    if (/cursor/i.test(error.message))
      throw new HttpError(
        400,
        "This page token is invalid or its filters changed. Start the listing again.",
      );
  }
  check(error);
}

export const mcpData: McpDataStore = {
  async searchMcpCatalog(actorId, input) {
    const { data, error } = await db().rpc("fb_mcp_catalog", {
      p_actor: actorId,
      p_input: input,
    });
    failure(error);
    return data as McpPage<McpCatalogItem>;
  },
  async listMcpMedia(actorId, input) {
    const { data, error } = await db().rpc("fb_mcp_media", {
      p_actor: actorId,
      p_input: input,
    });
    failure(error);
    return data as McpPage<McpMediaItem>;
  },
};
