import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movoice CRM starter",
  description: "Call your leads with a Movoice AI voice agent and see the result here.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
