/**
 * Remove published items whose backing media asset no longer exists.
 *
 * Upload verification deletes its own media after asserting the delete path,
 * which used to leave a published video pointing at a 404 stream URL. The API
 * now refuses that delete, and this script repairs anything orphaned earlier.
 *
 * Idempotent. Usage: node prisma/stream-orphan-cleanup.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const assets = new Set((await prisma.streamMediaAsset.findMany({ select: { id: true } })).map((a) => a.id));
  const orphanId = (url) => {
    const match = /^\/api\/stream\/media\/([^/]+)\/stream$/.exec(url ?? "");
    return match && !assets.has(match[1]) ? match[1] : null;
  };

  const [videos, tracks, episodes] = await Promise.all([
    prisma.streamVideo.findMany({ select: { id: true, slug: true, videoUrl: true } }),
    prisma.streamTrack.findMany({ select: { id: true, slug: true, audioUrl: true } }),
    prisma.streamEpisode.findMany({ select: { id: true, slug: true, audioUrl: true } })
  ]);

  const orphanVideos = videos.filter((v) => orphanId(v.videoUrl));
  const orphanTracks = tracks.filter((t) => orphanId(t.audioUrl));
  const orphanEpisodes = episodes.filter((e) => orphanId(e.audioUrl));

  if (orphanVideos.length) await prisma.streamVideo.deleteMany({ where: { id: { in: orphanVideos.map((v) => v.id) } } });
  if (orphanTracks.length) await prisma.streamTrack.deleteMany({ where: { id: { in: orphanTracks.map((t) => t.id) } } });
  if (orphanEpisodes.length) await prisma.streamEpisode.deleteMany({ where: { id: { in: orphanEpisodes.map((e) => e.id) } } });

  console.log(
    JSON.stringify({
      removed: {
        videos: orphanVideos.map((v) => v.slug),
        tracks: orphanTracks.map((t) => t.slug),
        episodes: orphanEpisodes.map((e) => e.slug)
      }
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
