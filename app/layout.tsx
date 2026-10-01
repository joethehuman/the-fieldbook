import { TooltipProvider } from "../components/ui/tooltip";
import { ToastProvider } from "../components/ui/toast";
import { InteractionDialogProvider } from "../components/ui/interaction-dialog";
import { DesktopSidebarProvider } from "../components/patterns/desktop-sidebar-state";
import { GeistSans } from "geist/font/sans";
import { Telemetry } from "../server/telemetry";
import "../styles/globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Fieldbook",
  description: "Docs, updates, and courses.",
};
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
