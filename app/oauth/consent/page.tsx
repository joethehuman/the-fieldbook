import Consent from "./Consent";
import { publicBranding } from "@server/branding";
import { errorResponse } from "@server/errors";
import { AccountUnavailable } from "@/app/AccountUnavailable";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    if (typeof value === "string") query.set(key, value);
  let branding;
  try {
    branding = await publicBranding();
  } catch (e) {
    const response = errorResponse(e, "oauth/consent/branding");
    return (
      <AccountUnavailable
        reference={response.headers.get("X-Request-Id")!}
        retry={"/oauth/consent?" + query.toString()}
      />
    );
  }
  return <Consent branding={branding} />;
}
