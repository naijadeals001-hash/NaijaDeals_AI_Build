import { AuraClient } from "@/components/stream/aura-client";
import { catalogueSnapshot } from "@/lib/services/stream/aura";

export const dynamic = "force-dynamic";

export default async function AuraPage() {
  const snapshot = await catalogueSnapshot();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Ask Aura</h1>
      <p className="mt-1 text-[12px] text-white/50">
        Discovery across the NaijaStream catalogue. Aura answers only from real records:
        {" "}{snapshot.tracks} tracks, {snapshot.artists} artists, {snapshot.playlists} playlists, {snapshot.shows} podcasts and {snapshot.events} upcoming or live events.
      </p>
      <div className="mt-5">
        <AuraClient />
      </div>
    </main>
  );
}
