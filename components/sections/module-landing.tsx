import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

export interface ModuleLandingFeature {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface ModuleLandingProps {
  name: string;
  icon: LucideIcon;
  headline: string;
  description: string;
  chips: string[];
  image: { src: string; alt: string };
  features: ModuleLandingFeature[];
  status: { title: string; body: string };
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  partner?: { title: string; body: string; links: Array<{ label: string; href: string }> };
}

/**
 * Shared landing surface for ecosystem verticals.
 *
 * The structure follows the reference mobility super-app we re-engineered with
 * REA (hero → services/features → earn/partner band → honest setup state). The
 * hero is one full-bleed photograph blended into the dark surface, matching the
 * NaijaDrive header rather than a split two-image panel.
 */
export function ModuleLanding({
  name,
  icon: Icon,
  headline,
  description,
  chips,
  image,
  features,
  status,
  primaryCta,
  secondaryCta,
  partner
}: ModuleLandingProps) {
  return (
    <div className="space-y-5">
      <section className="relative isolate overflow-hidden rounded-3xl bg-[#04140f] text-white shadow-[0_30px_80px_-40px_rgba(4,20,15,0.9)]">
        <img
          src={image.src}
          alt={image.alt}
          width={1536}
          height={1024}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-[72%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(3,16,12,0.98)_0%,rgba(3,16,12,0.93)_34%,rgba(3,16,12,0.6)_60%,rgba(3,16,12,0.12)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,16,12,0.45)_0%,transparent_45%,rgba(3,16,12,0.92)_100%)]" />

        <div className="relative flex min-h-[520px] flex-col justify-end px-5 pb-7 pt-12 sm:px-8 sm:pb-9 lg:min-h-[560px] lg:px-12 lg:pb-11 lg:pt-14">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {name}
            </p>
            <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{headline}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">{description}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
              {chips.map((chip) => (
                <span key={chip} className="rounded-full bg-white/10 px-3 py-1.5">{chip}</span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={primaryCta.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-[#04140f]">
                {primaryCta.label}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-bold text-white">
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section aria-label={`${name} capabilities`} className="grid gap-3 sm:grid-cols-3">
        {features.map((feature) => {
          const FeatureIcon = feature.icon;
          return (
            <div key={feature.title} className="rounded-2xl border border-border-soft bg-canvas p-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                <FeatureIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-2 text-sm font-extrabold">{feature.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{feature.body}</p>
            </div>
          );
        })}
      </section>

      {partner ? (
        <section className="rounded-2xl border border-border-soft bg-primary-soft p-5">
          <h2 className="font-display text-lg font-extrabold text-primary">{partner.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{partner.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {partner.links.map((link) => (
              <Link key={link.href} href={link.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-white">
                {link.label}
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-lg font-extrabold">{status.title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{status.body}</p>
      </section>
    </div>
  );
}
