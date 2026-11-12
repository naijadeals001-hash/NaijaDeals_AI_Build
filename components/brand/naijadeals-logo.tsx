/**
 * The approved NaijaDeals wordmark.
 *
 * Direction (AGENTS.md, 2026-11-12): the official logo is the simple, bold,
 * text-only wordmark — green "Naija" and white "Deals" on dark surfaces, with
 * the agreed green "Naija" / dark "Deals" adaptation on light surfaces. No
 * emblem, monogram, map, vehicle, bag or slogan may be added.
 *
 * No approved vector or raster wordmark file exists in the repository, so this
 * is a faithful type implementation of the documented direction rather than a
 * traced copy of an asset. Keep the two words tight, bold and unseparated.
 */

type LogoSize = "sm" | "md" | "lg" | "xl";

type NaijaDealsLogoProps = {
  /** "onLight" = green Naija / dark Deals. "onDark" = green Naija / white Deals. */
  tone?: "onLight" | "onDark";
  size?: LogoSize;
  className?: string;
};

const SIZE_CLASS: Record<LogoSize, string> = {
  sm: "text-[1.15rem]",
  // The header mark tightens below 360px so the utility actions never overflow.
  md: "text-[1.18rem] min-[360px]:text-[1.45rem] sm:text-[1.6rem]",
  lg: "text-[1.9rem] sm:text-[2.15rem]",
  xl: "text-[2.4rem] sm:text-[3rem]"
};

export function NaijaDealsLogo({ tone = "onLight", size = "md", className = "" }: NaijaDealsLogoProps) {
  const naija = tone === "onDark" ? "text-primary-live" : "text-primary";
  const deals = tone === "onDark" ? "text-white" : "text-ink";

  return (
    <span className={`inline-flex items-baseline font-display font-extrabold leading-none tracking-[-0.055em] ${SIZE_CLASS[size]} ${className}`.trim()}>
      <span className="sr-only">NaijaDeals</span>
      <span aria-hidden="true" className={naija}>
        Naija
      </span>
      <span aria-hidden="true" className={deals}>
        Deals
      </span>
    </span>
  );
}
