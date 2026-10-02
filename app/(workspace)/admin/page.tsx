import { canPublish } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import ProductionApp from "@/app/ProductionApp";
import { actor, requirePublisher } from "@server/auth";
import { readerWorkspaceContext } from "@server/reader";
import { adminSnapshot } from "@server/admin-snapshot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration | Fieldbook" };

export default async function Page() {
  const user = await actor(undefined, true);
  if (!user) redirect("/auth/sign-in?next=%2Fadmin");
  if (!canPublish(user)) notFound();
  requirePublisher(user);
  return (
    <ProductionApp
      initialAdmin={{
        data: await adminSnapshot(user, "content"),
        user,
        shell: await readerWorkspaceContext("/admin"),
      }}
    />
  );
}
