import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";
import { isRtl } from "@/lib/i18n/dictionary";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { readLocale } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NaijaDeals — one app for African life",
    template: "%s | NaijaDeals"
  },
  description:
    "Shop, eat, send, ride, stay, stream and pay across Africa from one NaijaDeals account. Verified sellers, escrow payments and tracked delivery.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://naijadeals.com"),
  openGraph: {
    title: "NaijaDeals — one app for African life",
    description: "Shopping, delivery, rides, stays, services, streaming and payments in one account.",
    url: "https://naijadeals.com",
    siteName: "NaijaDeals",
    type: "website"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  const user = sessionUser ? await toPublicSessionUser(sessionUser) : null;
  const locale = readLocale();

  return (
    <html lang={locale.language} dir={isRtl(locale.language) ? "rtl" : "ltr"}>
      <body>
        <LocaleProvider initial={locale}>
          <AppShell user={user}>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
