"use client";
import { BrandedAccount } from "@/components/patterns/branded-account";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePublicBranding } from "@/components/patterns/use-public-branding";
export default function ReadingError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const branding = usePublicBranding();
  return (
    <BrandedAccount branding={branding} illustrated>
      <h1>Unable to load this page</h1>
      <Alert variant="destructive">
        Reading services are unavailable. Please try again shortly.
        {error.digest && <span>Reference: {error.digest}</span>}
      </Alert>
      <Button onClick={() => window.location.reload()}>Try again</Button>
    </BrandedAccount>
  );
}
