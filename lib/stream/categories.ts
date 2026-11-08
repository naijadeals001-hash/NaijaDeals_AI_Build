/**
 * NaijaStream category identity. One accent per vertical, all checked against
 * the charcoal #0b0f0d surface: each colour is used for iconography, borders
 * and text-on-dark, while interactive controls keep the emerald brand colour
 * plus a visible gold focus ring so accent variety never costs contrast.
 */
export type StreamCategoryKey = "music" | "podcasts" | "videos" | "live" | "premium";

export type StreamCategory = {
  key: StreamCategoryKey;
  label: string;
  href: string;
  accent: string;
  accentSoft: string;
  /** Text colour that clears 4.5:1 on the accent for filled badges. */
  onAccent: string;
  blurb: string;
};

export const STREAM_CATEGORIES: StreamCategory[] = [
  { key: "music", label: "Music", href: "/naijastream/music", accent: "#00C896", accentSoft: "rgba(0,200,150,0.14)", onAccent: "#04140f", blurb: "Songs, albums and playlists from across the continent." },
  { key: "podcasts", label: "Podcasts", href: "/naijastream/podcasts", accent: "#8B5CF6", accentSoft: "rgba(139,92,246,0.16)", onAccent: "#0b0617", blurb: "Talk, business and culture shows from African creators." },
  { key: "videos", label: "Videos", href: "/naijastream/videos", accent: "#3B82F6", accentSoft: "rgba(59,130,246,0.16)", onAccent: "#050d1c", blurb: "Music videos, live clips and creator video." },
  { key: "live", label: "Live Events", href: "/naijastream/live", accent: "#F97316", accentSoft: "rgba(249,115,22,0.16)", onAccent: "#170702", blurb: "Scheduled and active live sessions." },
  { key: "premium", label: "Premium", href: "/naijastream/premium", accent: "#F5B942", accentSoft: "rgba(245,185,66,0.16)", onAccent: "#160f02", blurb: "Ad-free listening, higher quality and offline plans." }
];

export const CATEGORY_BY_KEY = Object.fromEntries(STREAM_CATEGORIES.map((category) => [category.key, category])) as Record<StreamCategoryKey, StreamCategory>;
