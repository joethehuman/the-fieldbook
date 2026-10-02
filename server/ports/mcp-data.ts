import type { Content } from "@/lib/types";

export type McpPage<T> = {
  items: T[];
  nextCursor: string | null;
  complete: boolean;
};
export type McpCatalogInput = {
  query: string;
  kind: "all" | Content["kind"];
  cursor?: string;
  limit: number;
};
export type McpCatalogItem = {
  id: string;
  title: string;
  summary: string;
  kind: Content["kind"];
  revision: number;
  status: Content["status"];
  published: boolean;
};
export type McpMediaInput = {
  query: string;
  type: "all" | "image" | "video";
  cursor?: string;
  limit: number;
};
export type McpMediaItem = {
  id: string;
  name: string;
  type: string;
  bytes: number;
  url: string;
};

/** Paged, authorized operations return plain records; provider query syntax stays in adapters. */
export interface McpDataStore {
  searchMcpCatalog(
    actorId: string,
    input: McpCatalogInput,
  ): Promise<McpPage<McpCatalogItem>>;
  listMcpMedia(
    actorId: string,
    input: McpMediaInput,
  ): Promise<McpPage<McpMediaItem>>;
}
