import test from "node:test";
import assert from "node:assert/strict";
import {
  rosterDatabase,
  contributorMigration,
  migrate,
  value,
} from "../helpers/roster-database";
import type {
  McpPage,
  McpCatalogItem,
  McpMediaItem,
} from "../../server/ports/mcp-data";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("publisher catalog searches lesson drafts and paginates past old caps without leaking deleted or pending media", async () => {
  const pg = await rosterDatabase();
  try {
    await migrate(pg, contributorMigration);
    await pg.exec(`insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}');
      insert into fb_profiles(id,auth_user_id,email,name,role) values('${id(1)}','${id(1)}','admin@example.test','Admin','admin'),('${id(2)}','${id(2)}','publisher@example.test','Contributor','contributor'),('${id(3)}','${id(3)}','manager@example.test','Manager','manager');
      insert into fb_documents(id,draft,updated_at) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,jsonb_build_object('id',n,'kind','course','title','Course '||n,'summary','','body','','status','draft','lessons',jsonb_build_array(jsonb_build_object('id','lesson','title','Lesson','body','special lesson phrase'))), '2026-01-01'::timestamptz from generate_series(100,1305)n;
      update fb_documents set deleted_at=now() where id='${id(1305)}';
      insert into fb_media(id,path,filename,mime,bytes,owner,ready,created_at) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(2)}/00000000-0000-4000-8000-'||lpad(n::text,12,'0')||'.png','Image '||n,'image/png',1,'${id(2)}',true,'2026-01-01'::timestamptz from generate_series(1400,2505)n;
      update fb_media set ready=false where id='${id(2505)}';`);
    const before = await value(
      pg,
      "select md5(string_agg(id::text||draft::text,',' order by id)) value from fb_documents",
    );
    await migrate(pg, "20261002222314_mcp_catalog.sql");
    assert.equal(
      await value(
        pg,
        "select md5(string_agg(id::text||draft::text,',' order by id)) value from fb_documents",
      ),
      before,
    );
    const documents: string[] = [];
    let cursor: string | undefined;
    do {
      const page = (await value(pg, "select fb_mcp_catalog($1,$2) value", [
        id(2),
        JSON.stringify({
          query: "special lesson phrase",
          kind: "course",
          limit: 100,
          cursor,
        }),
      ])) as McpPage<McpCatalogItem>;
      documents.push(...page.items.map((item) => item.id));
      assert.equal(page.complete, page.nextCursor === null);
      cursor = page.nextCursor || undefined;
    } while (cursor);
    assert.equal(documents.length, 1205);
    assert.equal(new Set(documents).size, 1205);
    const media: string[] = [];
    cursor = undefined;
    do {
      const page = (await value(pg, "select fb_mcp_media($1,$2) value", [
        id(1),
        JSON.stringify({ query: "", type: "image", limit: 100, cursor }),
      ])) as McpPage<McpMediaItem>;
      media.push(...page.items.map((item) => item.id));
      assert(
        page.items.every(
          (item) => item.url.startsWith("/api/media/") && !("owner" in item),
        ),
      );
      cursor = page.nextCursor || undefined;
    } while (cursor);
    assert.equal(media.length, 1105);
    assert.equal(new Set(media).size, 1105);
    assert.equal(
      (
        (await value(pg, 'select fb_mcp_catalog($1,\'{"query":"%"}\') value', [
          id(2),
        ])) as McpPage<McpCatalogItem>
      ).items.length,
      0,
    );
    const first = (await value(
      pg,
      'select fb_mcp_catalog($1,\'{"query":"","limit":1}\') value',
      [id(2)],
    )) as McpPage<McpCatalogItem>;
    await assert.rejects(
      value(pg, "select fb_mcp_catalog($1,$2) value", [
        id(2),
        JSON.stringify({ query: "changed", cursor: first.nextCursor }),
      ]),
      /Invalid cursor/,
    );
    await assert.rejects(
      value(pg, "select fb_mcp_catalog($1,'{}') value", [id(3)]),
      /access is required/,
    );
    await pg.exec(`update fb_profiles set active=false where id='${id(2)}'`);
    await assert.rejects(
      value(pg, "select fb_mcp_media($1,'{}') value", [id(2)]),
      /access is required/,
    );
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        await value(
          pg,
          "select has_function_privilege($1,'fb_mcp_catalog(uuid,jsonb)','EXECUTE') value",
          [role],
        ),
        false,
      );
      assert.equal(
        await value(
          pg,
          "select has_function_privilege($1,'fb_mcp_media(uuid,jsonb)','EXECUTE') value",
          [role],
        ),
        false,
      );
    }
  } finally {
    await pg.close();
  }
});
