import { BrandedAccount } from "@/components/patterns/branded-account";
import { Button } from "@/components/ui/button";
import { brandingFromSettings } from "@/lib/branding";
export default function NotFound() {
  return (
    <BrandedAccount branding={brandingFromSettings({})}>
      <h1>This page isn’t available</h1>
      <p>It may have been removed or is not published.</p>
      <Button asChild>
        <a href="/">Back to Fieldbook</a>
      </Button>
    </BrandedAccount>
  );
}
