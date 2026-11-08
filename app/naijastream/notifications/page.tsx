import { NotConfigured } from "@/components/stream/not-configured";
export const dynamic = "force-dynamic";
export default function Page() {
  return <NotConfigured title="Notifications" body="NaijaStream notifications publish through the shared Notification engine once stream events (new releases, follows, royalties) are wired to it. No alerts are shown rather than fake ones." dependency="Stream → Notification engine event wiring" />;
}
