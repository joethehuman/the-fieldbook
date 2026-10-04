import { TooltipProvider } from "../../components/ui/tooltip";
import { ToastProvider } from "../../components/ui/toast";
import { InteractionDialogProvider } from "../../components/ui/interaction-dialog";
import { DesktopSidebarProvider } from "../../components/patterns/desktop-sidebar-state";
import localFont from "next/font/local";
import type { Metadata } from "next";
import { Telemetry } from "../../server/telemetry";
import "../../styles/globals.css";
import { demoOgOrigin } from "../og-card";
import { ogCardSize } from "../../lib/og-card";

// Keep the first paint's font when the preloaded Geist asset arrives late.
const GeistSans = localFont({
  src: "../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "optional",
});

const ogOrigin = demoOgOrigin();
const ogImage = {
  url: "/og.png",
  ...ogCardSize,
  alt: "The Fieldbook — Updates, Courses and Docs",
};
export const metadata: Metadata = {
  title: "The Fieldbook · Interactive demo",
  description: "A lightweight home for docs, updates, and courses.",
  ...(ogOrigin ? { metadataBase: new URL(ogOrigin) } : {}),
  openGraph: { title: "The Fieldbook", type: "website", images: [ogImage] },
  twitter: { card: "summary_large_image", images: [ogImage] },
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
        <Telemetry />
      </body>
    </html>
  );
}
