import "../../app/globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Fieldbook",
  description: "Knowledge, field notes, and learning.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
