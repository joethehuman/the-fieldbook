import { BrandedAccount } from "@/components/patterns/branded-account";
import { Button } from "@/components/ui/button";
import { brandingFromSettings } from "@/lib/branding";
import { homePath } from "@/lib/navigation";
import { publicBranding } from "@server/branding";
import Link from "next/link";
import { connection } from "next/server";

export default async function NotFound() {
  await connection();
  const branding = await publicBranding().catch(() => brandingFromSettings({}));
  return (
    <BrandedAccount branding={branding} illustrated>
      <h1>This page isn’t available</h1>
      <p>The link may be incorrect, or the page may no longer be available.</p>
      <Button asChild>
        <Link href={homePath(branding)}>Back to Fieldbook</Link>
      </Button>
    </BrandedAccount>
  );
}
