import { unavailableCopy } from "@/lib/unavailable";
import { BrandedAccount } from "@/components/patterns/branded-account";
import { Button } from "@/components/ui/button";
import { brandingFromSettings } from "@/lib/branding";
import Link from "next/link";
export default function NotFound() {
  return (
    <BrandedAccount branding={brandingFromSettings({})}>
      <h1>{unavailableCopy.title}</h1>
      <p>{unavailableCopy.description}</p>
      <Button asChild>
        <Link href="/">{unavailableCopy.back}</Link>
      </Button>
    </BrandedAccount>
  );
}
