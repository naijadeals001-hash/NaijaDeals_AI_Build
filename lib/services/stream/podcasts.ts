import { prisma } from "@/lib/prisma";

/**
 * Podcast shows and episodes. Only PUBLISHED episodes of PUBLISHED shows are
 * public; demonstration content is hidden unless explicitly enabled.
 */
const showSamples = process.env.NAIJA_STREAM_SHOW_SAMPLES === "true";

export async function listShows() {
  return prisma.streamShow.findMany({
    where: { published: true, ...(showSamples ? {} : { isSample: false }) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      coverUrl: true,
      category: true,
      language: true,
      isSample: true,
      artist: { select: { name: true, slug: true } },
      _count: { select: { episodes: true } }
    }
  });
}

export async function getShowBySlug(slug: string) {
  const show = await prisma.streamShow.findFirst({
    where: { slug, published: true, ...(showSamples ? {} : { isSample: false }) },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      coverUrl: true,
      category: true,
      language: true,
      isSample: true,
      artist: { select: { name: true, slug: true } },
      episodes: {
        where: { status: "PUBLISHED" },
        orderBy: [{ season: "asc" }, { episodeNo: "asc" }],
        select: { id: true, title: true, slug: true, description: true, audioUrl: true, durationSec: true, season: true, episodeNo: true }
      }
    }
  });
  return show;
}

export async function listVideos() {
  return prisma.streamVideo.findMany({
    where: { status: "PUBLISHED", ...(showSamples ? {} : { isSample: false }) },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      videoUrl: true,
      posterUrl: true,
      durationSec: true,
      kind: true,
      views: true,
      isSample: true,
      artist: { select: { name: true, slug: true } }
    }
  });
}

export async function getVideoBySlug(slug: string) {
  return prisma.streamVideo.findFirst({
    where: { slug, status: "PUBLISHED", ...(showSamples ? {} : { isSample: false }) },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      videoUrl: true,
      posterUrl: true,
      durationSec: true,
      kind: true,
      views: true,
      isSample: true,
      artist: { select: { name: true, slug: true } }
    }
  });
}
