"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { CreditCard, Images, LayoutDashboard, Megaphone, Sparkles } from "lucide-react";
import { plusApi, type PlusCapabilities } from "./plus-api";
import { PLUS_TABS, type PlusTab } from "./plus-tabs";
import { useResource } from "./plus-ui";
import { PlusOverviewPanel } from "./plus-overview-panel";
import { PlusContentPanel } from "./plus-content-panel";
import { PlusPlansPanel } from "./plus-plans-panel";
import { PlusBenefitsPanel } from "./plus-benefits-panel";
import { PlusPromotionsPanel } from "./plus-promotions-panel";

const TAB_ICONS: Record<PlusTab, React.ReactNode> = {
  overview: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,
  content: <Images className="h-4 w-4" aria-hidden="true" />,
  plans: <CreditCard className="h-4 w-4" aria-hidden="true" />,
  benefits: <Sparkles className="h-4 w-4" aria-hidden="true" />,
  promotions: <Megaphone className="h-4 w-4" aria-hidden="true" />
};

export function PlusWorkspace({
  capabilities,
  initialTab
}: {
  capabilities: PlusCapabilities;
  initialTab: PlusTab;
}) {
  const [tab, setTab] = useState<PlusTab>(initialTab);

  const loadOverview = useCallback(() => plusApi.getOverview(), []);
  const overview = useResource(loadOverview);

  function selectTab(next: PlusTab) {
    setTab(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.replaceState(null, "", url.toString());
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % PLUS_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + PLUS_TABS.length) % PLUS_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = PLUS_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = PLUS_TABS[nextIndex];
    selectTab(next.id);
    document.getElementById(`plus-tab-${next.id}`)?.focus();
  }

  const planOptions = overview.data?.plans ?? [];
  const plansPhase = overview.phase;

  return (
    <div className="space-y-5">
      <div className="border-b border-[#21262D]">
        <div role="tablist" aria-label="Plus+ Control Center sections" className="flex flex-wrap gap-1">
          {PLUS_TABS.map((entry, index) => {
            const active = entry.id === tab;
            return (
              <button
                key={entry.id}
                id={`plus-tab-${entry.id}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={`plus-panel-${entry.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(entry.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14] ${
                  active
                    ? "border-[#00E676] bg-[#161B22] text-[#F0F6FC]"
                    : "border-transparent text-[#8B949E] hover:bg-[#161B22] hover:text-[#F0F6FC]"
                }`}
              >
                {TAB_ICONS[entry.id]}
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`plus-panel-${tab}`}
        aria-labelledby={`plus-tab-${tab}`}
        tabIndex={0}
        className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
      >
        {tab === "overview" ? (
          <PlusOverviewPanel
            overview={overview.data}
            phase={overview.phase}
            error={overview.error}
            onRetry={() => void overview.reload()}
            onOpenPlans={() => selectTab("plans")}
          />
        ) : null}

        {tab === "content" ? (
          <PlusContentPanel canWrite={capabilities.writeContent} canPublish={capabilities.publishContent} />
        ) : null}

        {tab === "plans" ? (
          <PlusPlansPanel
            overview={overview.data}
            overviewPhase={overview.phase}
            overviewError={overview.error}
            onRetryOverview={() => void overview.reload()}
            canConfigure={capabilities.configureMembership}
          />
        ) : null}

        {tab === "benefits" ? (
          <PlusBenefitsPanel
            canWrite={capabilities.writeContent}
            canPublish={capabilities.publishContent}
            plans={planOptions}
            plansPhase={plansPhase}
          />
        ) : null}

        {tab === "promotions" ? (
          <PlusPromotionsPanel
            canWrite={capabilities.writeContent}
            canPublish={capabilities.publishContent}
            canApprove={capabilities.approveAdvertiser}
          />
        ) : null}
      </div>
    </div>
  );
}
