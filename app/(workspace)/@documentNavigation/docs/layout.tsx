import { connection } from "next/server";
import { WorkspaceDocumentNavigation } from "@/components/reader/WorkspaceDocumentNavigation";
import { readerShellContext } from "@server/reader";

// Direct Docs HTML includes its real navigation without a streaming reveal script.
// Other workspace routes use the empty slot, keeping Admin and Team prerenderable.
export default async function Documents({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return (
    <>
      <WorkspaceDocumentNavigation
        initial={await readerShellContext("/docs")}
      />
      {children}
    </>
  );
}
export const instant = false;
export const prefetch = "force-disabled";
