import { Suspense } from "react";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { WorkspaceContextSync } from "@/components/reader/WorkspaceContext";
import { readerShellContext } from "@server/reader";
import { headers } from "next/headers";

// Keep workspace prefetch bounded to its real prerendered shell.
export const prefetch = "partial";

// Only presentation sync streams here. Page content stays outside this boundary,
// preserving blocking, JavaScript-free reading and independently guarded pages.
export default function Layout({
  children,
  documentNavigation,
}: {
  children: React.ReactNode;
  documentNavigation: React.ReactNode;
}) {
  return (
    <ReaderShell documentNavigation={documentNavigation}>
      <Suspense fallback={null}>
        <Identity />
      </Suspense>
      {children}
    </ReaderShell>
  );
}
async function Identity() {
  const path = (await headers()).get("x-fieldbook-reader-path") || "/docs";
  const section = path.split("/")[1];
  return (
    <WorkspaceContextSync context={await readerShellContext(`/${section}`)} />
  );
}
