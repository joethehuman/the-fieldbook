import { canOpenAdminTab } from "@/lib/permissions";
import {
  adminHref,
  adminScope,
  parseAdminDestination,
} from "@/lib/admin-destination";
import { notFound, redirect } from "next/navigation";
import ProductionApp from "@/app/ProductionApp";
import { actor, requirePublisher, HttpError } from "@server/auth";
import { readerWorkspaceContext } from "@server/reader";
import { adminSnapshot } from "@server/admin-snapshot";
import { getContent } from "@server/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration | Fieldbook" };
export default async function Page({
  params,
}: {
  params: Promise<{ destination?: string[] }>;
}) {
  const segments = (await params).destination || [];
  const destination = parseAdminDestination(
    "/admin" +
      (segments.length ? "/" + segments.map(encodeURIComponent).join("/") : ""),
  );
  if (!destination) notFound();
  const path = adminHref(destination);
  const user = await actor(undefined, true);
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  if (!canOpenAdminTab(user, destination.tab)) notFound();
  requirePublisher(user);
  if (!segments.length) redirect(path);
  const scope = adminScope(destination);
  let data;
  try {
    data = await adminSnapshot(
      user,
      scope,
      scope === "person" ? destination.id : undefined,
    );
    if (destination.tab === "content" && destination.id) {
      const item = await getContent(destination.id, user, true);
      data.content = data.content.map((entry) =>
        entry.id === item.id ? item : entry,
      );
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  if (destination.id && destination.tab !== "content") {
    const collection =
      destination.tab === "people"
        ? data.users
        : destination.tab === "teams"
          ? data.teams
          : destination.tab === "groups"
            ? data.groups
            : destination.tab === "progress"
              ? data.progressReport?.people.map((person) => person.u) ||
                data.users
              : data.curricula;
    if (!collection?.some((item) => item.id === destination.id)) notFound();
  }
  return (
    <ProductionApp
      initialAdmin={{
        data,
        user,
        shell: await readerWorkspaceContext(path),
        destination,
      }}
    />
  );
}
