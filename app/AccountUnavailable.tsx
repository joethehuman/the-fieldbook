import { AccountPage } from "@/components/patterns/layout";
import { InstallationIdentity } from "@/components/patterns/installation-identity";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export function AccountUnavailable({
  reference,
  retry,
}: {
  reference: string;
  retry: string;
}) {
  return (
    <AccountPage>
      <InstallationIdentity />
      <h1>Account services are unavailable</h1>
      <Alert role="alert" variant="destructive">
        Please try again shortly. If this continues, share this reference with
        your administrator: {reference}
      </Alert>
      <Button asChild>
        <a href={retry}>Try again</a>
      </Button>
    </AccountPage>
  );
}
