import { connection } from "next/server";
import Connections from "./Connections";
import { publicBranding } from "@server/branding";
import { errorResponse } from "@server/errors";
import { AccountUnavailable } from "@/app/AccountUnavailable";
export const instant = false;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    if (typeof value === "string") query.set(key, value);
  let branding;
  try {
    branding = await publicBranding();
  } catch (e) {
    const response = errorResponse(e, "connections/branding");
    return (
      <AccountUnavailable
        reference={response.headers.get("X-Request-Id")!}
        retry={"/connections?" + query.toString()}
      />
    );
  }
  return <Connections branding={branding} />;
}
