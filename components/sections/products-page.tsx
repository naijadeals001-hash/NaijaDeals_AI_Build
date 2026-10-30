"use client";

import Link from "next/link";
import { ArrowLeft, BadgeCheck, Info, ShieldCheck, Wallet } from "lucide-react";
import { verticals, type Vertical } from "@/lib/data/ecosystem";
import { ModuleCard } from "@/components/sections/ecosystem-home";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

const groups: Array<{ titleKey: DictionaryKey; bodyKey: DictionaryKey; keys: Vertical["key"][] }> = [
  {
    titleKey: "products.group1",
    bodyKey: "products.group1Body",
    keys: ["shop", "eats", "fresh", "send"]
  },
  {
    titleKey: "products.group2",
    bodyKey: "products.group2Body",
    keys: ["drive", "stay", "gigs"]
  },
  {
    titleKey: "products.group3",
    bodyKey: "products.group3Body",
    keys: ["wallet", "stream", "aura"]
  }
];

export function ProductsPage() {
  const { t } = useLocale();
  const liveCount = verticals.filter((vertical) => vertical.status === "live").length;

  return (
    <div className="space-y-8 pb-4">
      <div>
        <Link
          href="/"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-muted transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          {t("common.backHome")}
        </Link>
        <header className="mt-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">{t("home.productsEyebrow")}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">{t("products.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
            {t("products.intro", { count: verticals.length, live: liveCount })}
          </p>
        </header>
      </div>

      <section className="grid gap-3 rounded-2xl border border-border-soft bg-canvas p-4 sm:grid-cols-3 sm:p-5">
        <StatusNote icon={BadgeCheck} title={t("status.live")} body={t("products.legendLive")} tone="live" />
        <StatusNote icon={Info} title={t("status.setup")} body={t("products.legendSetup")} tone="setup" />
        <StatusNote icon={ShieldCheck} title={t("products.honestTitle")} body={t("products.legendHonest")} tone="neutral" />
      </section>

      {groups.map((group) => {
        const items = group.keys
          .map((key) => verticals.find((vertical) => vertical.key === key))
          .filter((vertical): vertical is Vertical => Boolean(vertical));
        const headingId = `group-${group.titleKey.replace(/\./g, "-")}`;

        return (
          <section key={group.titleKey} aria-labelledby={headingId}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 id={headingId} className="font-display text-xl font-extrabold sm:text-2xl">
                  {t(group.titleKey)}
                </h2>
                <p className="mt-1 text-sm text-muted">{t(group.bodyKey)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((vertical) => (
                <ModuleCard key={vertical.key} vertical={vertical} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-extrabold">{t("products.walletTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("products.walletBody")}</p>
            <Link
              href="/wallet"
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("products.openWallet")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusNote({
  icon: Icon,
  title,
  body,
  tone
}: {
  icon: typeof BadgeCheck;
  title: string;
  body: string;
  tone: "live" | "setup" | "neutral";
}) {
  const toneClass =
    tone === "live" ? "bg-primary-soft text-primary" : tone === "setup" ? "bg-amber-soft text-amber-700" : "bg-surface-mid text-ink";

  return (
    <div className="flex gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneClass}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-extrabold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}
