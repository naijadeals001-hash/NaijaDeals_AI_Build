import { NotConfigured } from "@/components/stream/not-configured";
export const dynamic = "force-dynamic";
export default function Page() {
  return <NotConfigured title="NaijaStream Premium" body="Premium plans need administrator-configured pricing and a live payment provider. No subscriber billing is enabled here, so no plan is sold or implied." dependency="Configured plan pricing + live Paystack/Flutterwave credentials" />;
}
