import { NotConfigured } from "@/components/stream/not-configured";
export const dynamic = "force-dynamic";
export default function Page() {
  return <NotConfigured title="Live events and audio" body="Live concerts, audio livestreams and ticketed sessions need verified ingest, transcoding, playback delivery and ticketing. None are configured in this environment, so nothing here is presented as live." dependency="Live streaming ingest + transcoding + ticketing provider" />;
}
