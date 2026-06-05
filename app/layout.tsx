import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NaijaDeals.com | African Super App Marketplace",
    template: "%s | NaijaDeals.com"
  },
  description:
    "NaijaDeals.com is a production-ready African super ecosystem for ecommerce, food, gigs, stays, rides, logistics, streaming, wallet, escrow, Aura AI, and admin operations.",
  metadataBase: new URL("https://naijadeals.com"),
  openGraph: {
    title: "NaijaDeals.com Super Ecosystem",
    description: "African Amazon-style marketplace, Uber-style mobility, wallet, escrow, Aura AI, and admin control center.",
    url: "https://naijadeals.com",
    siteName: "NaijaDeals.com",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
