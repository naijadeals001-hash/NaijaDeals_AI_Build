/**
 * Playlist cover with code-typeset title, matching the approved mockup where
 * covers are graphic art with large display lettering. The artwork supplies the
 * colour/composition; the title is real text (accessible, crisp, translatable)
 * rather than AI-generated glyphs. Falls back to a clean colour panel when no
 * artwork is attached.
 */
const TITLE_TONES: Record<string, { from: string; to: string; ink: string; accent: string }> = {
  afrobeats: { from: "#0b3d2a", to: "#0f7a4a", ink: "#ffffff", accent: "#ffc24b" },
  amapiano: { from: "#241046", to: "#4c1d95", ink: "#ffffff", accent: "#a78bfa" },
  gospel: { from: "#0b1e3a", to: "#1e3a8a", ink: "#ffffff", accent: "#fbbf24" },
  hiphop: { from: "#1c0a0a", to: "#7f1d1d", ink: "#ffffff", accent: "#f87171" },
  chill: { from: "#0d2b2b", to: "#155e5e", ink: "#ffffff", accent: "#5eead4" },
  podcast: { from: "#141414", to: "#2d2d2d", ink: "#ffffff", accent: "#22c55e" }
};

function toneFor(title: string) {
  const key = Object.keys(TITLE_TONES).find((k) => title.toLowerCase().includes(k));
  return TITLE_TONES[key ?? "podcast"];
}

export function CoverArt({
  src,
  title,
  subtitle,
  className = "",
  sizes = "(min-width: 1024px) 20vw, 45vw",
  priority = false
}: {
  src: string | null;
  title: string;
  subtitle?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const tone = toneFor(title);
  // Keep titles short enough to read at card size, like the reference covers.
  const display = title.replace(/\s+/g, " ").trim();

  return (
    <div className={`relative overflow-hidden rounded-lg bg-[#101613] ${className}`}>
      {src ? (
        <img
          src={src}
          alt=""
          aria-hidden
          loading={priority ? "eager" : "lazy"}
          sizes={sizes}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(140deg, ${tone.from}, ${tone.to})` }} aria-hidden />
      )}
      {/* Legibility scrim under the lettering */}
      <div
        className="absolute inset-x-0 bottom-0 h-3/4"
        style={{ background: `linear-gradient(to top, ${tone.from}f2 0%, ${tone.from}99 45%, transparent 100%)` }}
        aria-hidden
      />
      <div className="relative flex h-full flex-col justify-end p-2.5">
        <p
          className="font-display text-[13px] font-black uppercase leading-[0.95] tracking-[-0.01em] sm:text-[15px]"
          style={{ color: tone.ink, textShadow: "0 1px 6px rgba(0,0,0,0.55)" }}
        >
          {display}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.accent }}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
