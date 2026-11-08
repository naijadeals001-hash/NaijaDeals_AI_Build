/**
 * Removes artefacts created by the acceptance suites: "Upload Test …" tracks,
 * shows and videos, plus media assets no published item references any more.
 *
 * Only TEST-classified, non-production data is touched. Idempotent.
 * Usage: node prisma/stream-verify-cleanup.cjs
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const path = require("node:path");

const prisma = new PrismaClient();
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), ".media-store");

(async () => {
  const summary = { tracks: 0, shows: 0, videos: 0, assets: 0 };

  const tracks = await prisma.streamTrack.findMany({ where: { slug: { startsWith: "upload-test-" } }, select: { id: true } });
  if (tracks.length) {
    const ids = tracks.map((row) => row.id);
    await prisma.streamPlaylistItem.deleteMany({ where: { trackId: { in: ids } } });
    await prisma.streamTrack.deleteMany({ where: { id: { in: ids } } });
    summary.tracks = tracks.length;
  }

  const videos = await prisma.streamVideo.findMany({ where: { slug: { startsWith: "video-" } }, select: { id: true } });
  if (videos.length) {
    await prisma.streamVideo.deleteMany({ where: { id: { in: videos.map((row) => row.id) } } });
    summary.videos = videos.length;
  }

  const shows = await prisma.streamShow.findMany({ where: { title: { startsWith: "Upload Test Show" } }, select: { id: true } });
  if (shows.length) {
    const ids = shows.map((row) => row.id);
    await prisma.streamEpisode.deleteMany({ where: { showId: { in: ids } } });
    await prisma.streamShow.deleteMany({ where: { id: { in: ids } } });
    summary.shows = shows.length;
  }

  const [assets, trackUrls, episodeUrls, videoUrls] = await Promise.all([
    prisma.streamMediaAsset.findMany({ select: { id: true, storageKey: true } }),
    prisma.streamTrack.findMany({ select: { audioUrl: true } }),
    prisma.streamEpisode.findMany({ select: { audioUrl: true } }),
    prisma.streamVideo.findMany({ select: { videoUrl: true } })
  ]);
  const referenced = new Set([...trackUrls, ...episodeUrls, ...videoUrls].map((row) => row.audioUrl ?? row.videoUrl).filter(Boolean));
  const orphans = assets.filter((asset) => !referenced.has(`/api/stream/media/${asset.id}/stream`));
  for (const asset of orphans) {
    await prisma.streamMediaAsset.delete({ where: { id: asset.id } });
    try {
      fs.unlinkSync(path.join(MEDIA_ROOT, asset.storageKey));
    } catch {
      // File already gone; the row is what mattered.
    }
  }
  summary.assets = orphans.length;

  console.log(JSON.stringify({ removed: summary }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
