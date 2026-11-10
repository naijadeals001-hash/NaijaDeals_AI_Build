/**
 * The gold African continent outline from Aura's right panel, traced from the
 * approved desktop mockup: the bulge of West Africa, the Horn on the east, the
 * Gulf of Guinea notch, and Madagascar offshore.
 */
export function AuraAfricaMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      <svg viewBox="0 0 140 152" className="h-[92px] w-[86px] shrink-0" fill="none" role="img" aria-label="Outline of the African continent">
        <path
          d="M56.5 6.2 L62 4.8 L66.8 6.6 L70.6 5.2 L75.4 7.4 L79.2 11.2 L84.6 10.6 L88.4 13.4 L92.2 12.2 L96.4 15.6 L100.2 20.4 L103.6 26.2 L106.4 33.4 L107.8 41.2 L106.2 47.8 L102.4 53.2 L97.6 57.4 L93.4 61.8 L90.2 67.4 L88.4 73.8 L86.6 80.6 L84.2 87.2 L81.4 94.4 L78.2 101.4 L74.4 108.6 L70.6 116.2 L66.4 123.6 L62.2 130.8 L57.4 137.4 L52.6 142.6 L47.8 145.4 L43.6 143.2 L40.8 138.4 L38.6 132.2 L36.4 125.4 L33.6 118.8 L30.4 112.4 L27.2 106.2 L24.2 99.6 L21.4 92.6 L19.2 85.4 L17.6 78.2 L16.4 71.2 L16.2 64.4 L17.4 57.8 L17.2 51.2 L18.8 44.6 L21.6 38.4 L25.2 32.6 L29.4 27.4 L33.8 23.2 L38.2 19.6 L42.6 16.4 L46.8 13.8 L50.8 11.4 L53.6 8.6 Z"
          stroke="#D9BC63"
          strokeWidth="2.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d="M92.4 86.6 C95.6 84.8 97.6 87.4 97.2 92.2 C96.6 98.6 94.2 105.4 91.4 110.2 C89.2 106.4 89.6 100.2 90.2 95.4 C90.6 91.6 91.2 88.6 92.4 86.6 Z" stroke="#D9BC63" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      <span className="h-[58px] w-px bg-white/30" aria-hidden="true" />
      <p className="text-[16px] font-semibold leading-[1.35] text-white">
        Made for life
        <br />
        across Africa
      </p>
    </div>
  );
}
