import { NotConfigured } from "@/components/stream/not-configured";
export const dynamic = "force-dynamic";
export default function Page() {
  return <NotConfigured title="Ask Aura" body="Aura answers only from connected data. No model provider is configured for NaijaStream, so the assistant is disabled instead of guessing recommendations or earnings." dependency="Aura model provider configuration" />;
}
