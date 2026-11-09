import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";
import { isRtl } from "@/lib/i18n/dictionary";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { PlatformProvider } from "@/components/platform/platform-provider";
import { PlatformBanner } from "@/components/platform/platform-banner";
import { HomeVariantProvider } from "@/lib/home/variant-context";
import { resolveVariant } from "@/lib/home/assignment";
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
  },
  manifest: "/manifest.webmanifest",
  applicationName: "NaijaDeals",
  appleWebApp: { capable: true, title: "NaijaDeals", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#006d38",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled: blocking it breaks accessibility.
  maximumScale: 5,
  viewportFit: "cover"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  const user = sessionUser ? await toPublicSessionUser(sessionUser) : null;
  const locale = readLocale();
  // Only the homepage renders a design variant; other routes pass null.
  const homeVariant = await resolveVariant().then((row) => row.variant).catch(() => null);

  return (
    <html lang={locale.language} dir={isRtl(locale.language) ? "rtl" : "ltr"}>
      <body>
        <PlatformProvider>
          <LocaleProvider initial={locale}>
            <PlatformBanner />
            <HomeVariantProvider variant={homeVariant}>
              <AppShell user={user}>{children}</AppShell>
            </HomeVariantProvider>
          </LocaleProvider>
        </PlatformProvider>
      </body>
    </html>
  );
}
