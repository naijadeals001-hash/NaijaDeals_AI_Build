import { StreamLibrary } from "@/components/stream/library-client";

export const dynamic = "force-dynamic";

export default function LibraryPage({ searchParams }: { searchParams?: { tab?: string } }) {
  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Your library</h1>
      <p className="mt-1 text-[12px] text-white/50">Liked songs, followed artists and your playlists.</p>
      <div className="mt-4">
        <StreamLibrary initialTab={searchParams?.tab} />
      </div>
    </main>
  );
}
