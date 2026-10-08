"use client";
import { BrandedAccount } from "@/components/patterns/branded-account";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { brandingFromSettings } from "@/lib/branding";

export default function PageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <BrandedAccount branding={brandingFromSettings({})} illustrated>
      <h1>Unable to load this page</h1>
      <Alert role="alert" variant="destructive">
        Try again. If the problem continues, contact your administrator.
        {error.digest && <> Reference: {error.digest}.</>}
      </Alert>
      <Button onClick={retry}>Try again</Button>
    </BrandedAccount>
  );
}
