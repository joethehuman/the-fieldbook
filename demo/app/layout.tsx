import { IdentityPresentation } from "../../components/IdentityPresentation";
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
import { demoSessionScript } from "../../lib/demo-session";
import "../startup.css";

// Keep Arial unscaled while Geist loads so the picker note keeps its line count.
const GeistSans = localFont({
  src: "../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "optional",
  fallback: ["Arial"],
  adjustFontFallback: false,
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
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: demoSessionScript }} />
      </head>
      <body>
        <IdentityPresentation
          value={{
            options: [],
            signInLabel: "Sign in with Google",
            progressDescription:
              "Sign in with Google to save course progress across devices and browsers.",
            accessDeniedDescription: "Choose a demo profile to continue.",
            registration: {
              emailLabel: "Email label",
              description: "Add a fictional person to the demo.",
              pendingDescription: "This is a fictional demo account.",
            },
          }}
        >
          <DesktopSidebarProvider>
            <TooltipProvider>
              <ToastProvider>
                <InteractionDialogProvider>
                  {children}
                </InteractionDialogProvider>
              </ToastProvider>
            </TooltipProvider>
          </DesktopSidebarProvider>
        </IdentityPresentation>
        <Telemetry />
      </body>
    </html>
  );
}
