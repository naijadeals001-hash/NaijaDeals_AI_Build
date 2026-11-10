import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { capabilitiesForUi } from "@/lib/aura/chat";
import { AuraWorkspace } from "@/components/aura/aura-workspace";

export const metadata: Metadata = {
  title: "Aura AI — your NaijaDeals assistant",
  description: "One conversation across NaijaDeals: find stays, meals, rides, products, professionals and your own payments."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  const { provider, capabilities } = await capabilitiesForUi();
  return (
    // Visitors can explore Aura's scope; conversations require sign-in.
    <AuraWorkspace
      user={user ? { name: user.name, email: user.email } : null}
      capabilities={capabilities}
      providerReady={provider.configured}
    />
  );
}
