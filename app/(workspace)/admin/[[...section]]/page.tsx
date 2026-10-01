import { AdminSectionPending } from "@/components/admin/AdminSectionPending";
import { Suspense } from "react";
import { cacheLife } from "next/cache";
import ProductionApp from "@/app/ProductionApp";
import { adminEntry, adminUser } from "@server/admin-entry";
import { adminSections } from "@/lib/admin-navigation";
import { notFound } from "next/navigation";
import { adminSnapshot } from "@server/admin-snapshot";

export const instant = true;
export const metadata = {
  title: "Administration | Fieldbook",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return [
    { section: [] },
    ...adminSections
      .flatMap((group) => group.items)
      .filter((item) => item.id !== "content")
      .map((item) => ({ section: [item.id] })),
  ];
}
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = await params;
  const tab = section[0] || "content";
  const item = adminSections
    .flatMap((group) => group.items)
    .find((item) => item.id === tab);
  if (section.length > 1 || !item) notFound();
  return (
    <Suspense fallback={<AdminSectionPending tab={tab} />}>
      <Content tab={tab} />
    </Suspense>
  );
}

async function Content({ tab }: { tab: string }) {
  "use cache: private";
  // Browser-only prefetch reuse; every server request rechecks access and reads
  // current private data. No role, draft or report enters a shared server cache.
  cacheLife({ stale: 30 });
  const user = await adminUser();
  const [data, { shell }] = await Promise.all([
    adminSnapshot(
      user,
      tab === "deleted"
        ? "deleted"
        : tab === "feedback"
          ? "feedback"
          : tab === "content" || tab.startsWith("settings-")
            ? "content"
            : "governance",
    ),
    adminEntry(),
  ]);
  return <ProductionApp tab={tab} initialAdmin={{ data, user, shell }} />;
}
