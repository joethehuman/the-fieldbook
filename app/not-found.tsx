"use client";

import { BrandedAccount } from "@/components/patterns/branded-account";
import { usePublicBranding } from "@/components/patterns/use-public-branding";
import { Button } from "@/components/ui/button";
import { homePath } from "@/lib/navigation";
import Link from "next/link";
export default function NotFound() {
  const branding = usePublicBranding();
  return (
    <BrandedAccount branding={branding} illustrated>
      <h1>This page isn’t available</h1>
      <p>It may have been removed or is not published.</p>
      <Button asChild>
        <Link href={homePath(branding)}>Back to Fieldbook</Link>
      </Button>
    </BrandedAccount>
  );
}
