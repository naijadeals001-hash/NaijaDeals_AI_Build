import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listArtists, listGenres, listPlaylists, listTracks } from "@/lib/services/stream/service";
import { StreamHome, type StreamCardArtist, type StreamCardPlaylist, type StreamCardTrack } from "@/components/stream/home";

export const dynamic = "force-dynamic";

type RawTrack = {
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  artworkUrl: string | null;
  audioUrl: string | null;
  isSample?: boolean;
  artist: { id: string; name: string; slug: string; verified: boolean; isSample?: boolean; avatarUrl?: string | null };
};

function toCard(track: RawTrack): StreamCardTrack {
  return {
    id: track.id,
    slug: track.slug,
    title: track.title,
    durationSec: track.durationSec,
    artworkUrl: track.artworkUrl,
    audioUrl: track.audioUrl,
    isSample: track.isSample,
    artist: {
      id: track.artist.id,
      name: track.artist.name,
      slug: track.artist.slug,
      verified: track.artist.verified,
      isSample: track.artist.isSample,
      avatarUrl: track.artist.avatarUrl ?? null
    }
  };
}

export default async function Page() {
  const [user, trendingResult, genres, playlists, artists] = await Promise.all([
    getSessionUser(),
    listTracks({ take: 10 }),
    listGenres(),
    listPlaylists({ take: 10 }),
    listArtists({ take: 12 })
  ]);

  const trending = (trendingResult.items as unknown as RawTrack[]).map(toCard);
  const artistCards: StreamCardArtist[] = artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    slug: artist.slug,
    avatarUrl: artist.avatarUrl,
    isSample: artist.isSample,
    totalPlays: artist.totalPlays
  }));
  const playlistCards: StreamCardPlaylist[] = playlists.map((playlist) => ({
    id: playlist.id,
    title: playlist.title,
    slug: playlist.slug,
    coverUrl: playlist.coverUrl,
    description: playlist.description,
    isEditorial: playlist.isEditorial
  }));

  const heroTrack = trending[0] ?? null;

  return (
    <>
      {trending.length === 0 && artists.length === 0 ? (
        <div className="mx-4 mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-[12px] text-emerald-100 sm:mx-6">
          The NaijaStream catalogue is empty in this environment.{" "}
          <Link href="/naijastream/studio" className="font-bold underline">
            Creator studio
          </Link>{" "}
          and verified artist onboarding are ready; music appears once published.
        </div>
      ) : null}
      <StreamHome
        signedIn={Boolean(user)}
        data={{
          hero: heroTrack ? { artist: heroTrack.artist, track: heroTrack, playlist: playlistCards[0] ?? null } : artistCards[0] ? { artist: artistCards[0], track: null, playlist: null } : null,
          trending,
          playlists: playlistCards,
          artists: artistCards,
          genres,
          live: []
        }}
      />
    </>
  );
}
