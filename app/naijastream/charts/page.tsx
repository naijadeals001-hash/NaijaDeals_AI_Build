import { listTracks } from "@/lib/services/stream/service";
import { TrackList, type ListTrack } from "@/components/stream/track-list";

export const dynamic = "force-dynamic";

export default async function ChartsPage() {
  const result = await listTracks({ take: 50 });
  const tracks = result.items as unknown as ListTrack[];
  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Charts</h1>
      <p className="mt-1 text-[12px] text-white/50">Ranked by eligible plays recorded on NaijaStream (deduplicated, ≥30s listens).</p>
      <div className="mt-4">
        <TrackList tracks={tracks} emptyMessage="Charts fill as tracks are published and played." />
      </div>
    </main>
  );
}
