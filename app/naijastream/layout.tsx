import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { StreamPlayerProvider } from "@/components/stream/player-context";
import { StreamShell } from "@/components/stream/stream-shell";

export const metadata: Metadata = {
  title: "NaijaStream — Africa's sounds. Your world.",
  description: "African music, podcasts, live events and creator economy on NaijaDeals."
};

export const dynamic = "force-dynamic";

export default async function StreamLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <StreamPlayerProvider>
      <StreamShell user={user ? { name: user.name, email: user.email } : null}>{children}</StreamShell>
    </StreamPlayerProvider>
  );
}
