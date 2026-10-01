import { Suspense } from "react";
import ProductionApp from "@/app/ProductionApp";
import { adminEntry, adminUser } from "@server/admin-entry";
import type { User } from "@/lib/types";
import { AdminLoading } from "@/components/admin/AdminLoading";
import { adminSnapshot } from "@server/admin-snapshot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration | Fieldbook" };

export default async function Page() {
  const user = await adminUser();
  // Resolve admission before a fallback streams, preserving direct 404/redirects.
  return <Suspense fallback={<AdminLoading />}><Content user={user} /></Suspense>;
}

async function Content({ user }: { user: User }) {
  const [data, { shell }] = await Promise.all([adminSnapshot(user, "content"), adminEntry()]);
  return (
    <ProductionApp
      initialAdmin={{
        data,
        user,
        shell,
      }}
    />
  );
}
