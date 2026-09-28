import { TooltipProvider } from "../components/ui/tooltip";
import { ToastProvider } from "../components/ui/toast";
import { InteractionDialogProvider } from "../components/ui/interaction-dialog";
import { DesktopSidebarProvider } from "../components/patterns/desktop-sidebar-state";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "The Fieldbook · Interactive demo",
  description: "A lightweight home for docs, updates, and courses.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      </body>
    </html>
  );
}
