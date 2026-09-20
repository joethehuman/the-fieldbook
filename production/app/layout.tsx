import { InteractionDialogProvider } from "../../components/ui/interaction-dialog";
import { GeistSans } from "geist/font/sans";
import "../../app/globals.css";
import "../../app/design-system.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Fieldbook",
  description: "Knowledge, field notes, and learning.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>
        <InteractionDialogProvider>{children}</InteractionDialogProvider>
      </body>
    </html>
  );
}
