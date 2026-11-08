import { NotConfigured } from "@/components/stream/not-configured";
export const dynamic = "force-dynamic";
export default function Page() {
  return <NotConfigured title="Podcasts & talk shows" body="Podcast episodes use the same audio pipeline as music. Creator podcast publishing activates with verified audio upload storage; there are no episodes to list yet." dependency="Verified audio upload storage (object storage + signed delivery)" />;
}
