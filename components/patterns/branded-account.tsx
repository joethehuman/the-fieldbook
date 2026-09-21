import type { ReactNode } from "react";
import type { Branding } from "@/lib/branding";
import { AccountPage } from "./layout";
import { InstallationIdentity } from "./installation-identity";
export function BrandedAccount({
  branding,
  children,
}: {
  branding: Branding;
  children: ReactNode;
}) {
  return (
    <AccountPage className="[overflow-wrap:anywhere]">
      <InstallationIdentity name={branding.name} logoUrl={branding.logoUrl} />
      {children}
      {branding.privacyUrl && (
        <nav aria-label="Privacy">
          <a href={branding.privacyUrl}>Privacy policy</a>
        </nav>
      )}
    </AccountPage>
  );
}
