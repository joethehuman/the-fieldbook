import { notFound, redirect } from "next/navigation";
import ProductionApp from "../ProductionApp";
import { actor, requireAdmin } from "@production/lib/auth";
import { adminSnapshot } from "@production/lib/admin-snapshot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration | Fieldbook" };

export default async function Page() {
  const user = await actor(undefined, true);
  if (!user) redirect("/auth/sign-in?next=%2Fadmin");
  if (user.role !== "admin" || !user.active) notFound();
  requireAdmin(user);
  return (
    <ProductionApp
      initialAdmin={{ data: await adminSnapshot(user, "content"), user }}
    />
  );
}
