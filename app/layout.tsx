import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fieldbook · Your field, in focus",
  description: "A lightweight home for field knowledge, briefs, and learning.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
