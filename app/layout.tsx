import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NaijaDeals.com | Nigerian Marketplace",
    template: "%s | NaijaDeals.com"
  },
  description:
    "NaijaDeals is a Nigerian marketplace with verified sellers, server-verified payments, escrow and tracked delivery.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://naijadeals.com"),
  openGraph: {
    title: "NaijaDeals.com",
    description: "Verified sellers, escrow-protected payments and tracked delivery across Nigeria.",
    url: "https://naijadeals.com",
    siteName: "NaijaDeals.com",
    type: "website"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  const user = sessionUser ? await toPublicSessionUser(sessionUser) : null;

  return (
    <html lang="en">
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
