import { TooltipProvider } from "../components/ui/tooltip";
import { ToastProvider } from "../components/ui/toast";
import { InteractionDialogProvider } from "../components/ui/interaction-dialog";
import { DesktopSidebarProvider } from "../components/patterns/desktop-sidebar-state";
import { GeistSans } from "geist/font/sans";
import { Telemetry } from "../server/telemetry";
import "../styles/globals.css";
import type { Metadata } from "next";
import { installationOgIdentity } from "@server/og-card";
import { deployment } from "@server/deployment";
import { ogCardImages } from "@/lib/og-card";
export async function generateMetadata(): Promise<Metadata> {
  const identity = await installationOgIdentity();
  const origin = deployment().origin;
  const images = origin ? ogCardImages(origin, identity.name) : undefined;
  return {
    title: "Fieldbook",
    description: "Docs, updates, and courses.",
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    openGraph: {
      title: identity.name,
      description: "Docs, updates, and courses.",
      siteName: identity.name,
      type: "website",
      ...images?.openGraph,
    },
    twitter: {
      title: identity.name,
      description: "Docs, updates, and courses.",
      ...images?.twitter,
    },
  };
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>
        <DesktopSidebarProvider>
          <TooltipProvider>
            <ToastProvider>
              <InteractionDialogProvider>{children}</InteractionDialogProvider>
            </ToastProvider>
          </TooltipProvider>
        </DesktopSidebarProvider>
        <Telemetry />
      </body>
    </html>
  );
}
