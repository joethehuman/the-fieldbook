import { InteractionDialogProvider } from "../components/ui/interaction-dialog";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";
import "./design-system.css";
export const metadata: Metadata = {
  title: "Fieldbook · Your field, in focus",
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
        <InteractionDialogProvider>{children}</InteractionDialogProvider>
      </body>
    </html>
  );
}
