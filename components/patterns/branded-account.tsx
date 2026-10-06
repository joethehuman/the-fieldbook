import type { ReactNode } from "react";
import type { Branding } from "@/lib/branding";
import { AccountPage } from "./layout";
import { InstallationIdentity } from "./installation-identity";
import { brandThemeStyle } from "@/lib/brand-theme";
import { AccessArtwork } from "./access-artwork";
export function BrandedAccount({
  branding,
  children,
  illustrated = false,
  footer,
}: {
  branding: Branding;
  children: ReactNode;
  illustrated?: boolean;
  footer?: ReactNode;
}) {
  return (
    <AccountPage
      viewportClassName={illustrated ? "access-card-viewport" : undefined}
      className={
        illustrated
          ? "access-card access-card-illustrated max-w-[51rem] gap-0 overflow-hidden border-l-[5px] [border-left-color:var(--brand)] p-0 sm:p-0 [overflow-wrap:anywhere] [&_h1]:text-[clamp(1.65rem,3vw,2.35rem)]"
          : "access-card border-l-[5px] [border-left-color:var(--brand)] [overflow-wrap:anywhere]"
      }
      style={brandThemeStyle(branding.accent)}
    >
      <div className="access-card-content">
        <InstallationIdentity name={branding.name} />
        <div className="access-card-body">{children}</div>
        {(footer || branding.privacyUrl) && (
          <div className="access-card-links">
            {footer}
            {branding.privacyUrl && (
              <nav aria-label="Privacy">
                <a href={branding.privacyUrl}>Privacy policy</a>
              </nav>
            )}
          </div>
        )}
      </div>
      {illustrated && <AccessArtwork />}
    </AccountPage>
  );
}
