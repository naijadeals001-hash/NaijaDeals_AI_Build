/**
 * The gold African continent outline from Aura's right panel.
 *
 * This is the artwork cropped from the owner's approved desktop reference
 * (`sections/desktop-right-rail.png`), not a hand-drawn path — the earlier SVG
 * did not resemble the continent. The divider and the wording remain real
 * elements so they stay crisp and translatable.
 */
export function AuraAfricaMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/generated/aura/aura-africa-outline.webp"
        alt="Outline of the African continent"
        width={92}
        height={100}
        className="h-[92px] w-[84px] shrink-0 object-contain"
      />
      <span className="h-[54px] w-px bg-white/30" aria-hidden="true" />
      <p className="text-[15px] font-semibold leading-[1.35] text-white">
        Made for life
        <br />
        across Africa
      </p>
    </div>
  );
}
