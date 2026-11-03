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
  secondaryImage?: { src: string; alt: string };
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
 * REA (hero → services/features → earn/partner band → honest setup state), while
 * every claim stays backed by this build's real configuration state.
 */
export function ModuleLanding({
  name,
  icon: Icon,
  headline,
  description,
  chips,
  image,
  secondaryImage,
  features,
  status,
  primaryCta,
  secondaryCta,
  partner
}: ModuleLandingProps) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-border-soft bg-[#04140f] text-white">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 sm:p-9">
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
          <div className="relative min-h-[260px] lg:min-h-full">
            <img
              src={image.src}
              alt={image.alt}
              width={1280}
              height={960}
              className="absolute inset-0 h-full w-full object-cover"
              fetchPriority="high"
            />
            {secondaryImage ? (
              <img
                src={secondaryImage.src}
                alt={secondaryImage.alt}
                width={640}
                height={480}
                className="absolute bottom-3 right-3 hidden h-28 w-40 rounded-xl border border-white/20 object-cover shadow-lift sm:block"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-r from-[#04140f] via-[#04140f]/20 to-transparent lg:from-[#04140f]/80" />
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
