"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, RefreshCw } from "lucide-react";
import type { PlusOverview } from "./plus-api";
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Panel,
  PanelHeader,
  StatusBadge,
  humanizeKey
} from "./plus-ui";

type FlagKey = "membershipOpen" | "checkoutConfigured" | "paidActivationApproved";

const FLAG_COPY: Record<
  FlagKey,
  { label: string; trueLabel: string; falseLabel: string; description: string }
> = {
  membershipOpen: {
    label: "Membership open",
    trueLabel: "Open",
    falseLabel: "Not open",
    description: "Whether customers can be offered a Plus+ membership at all."
  },
  checkoutConfigured: {
    label: "Checkout configured",
    trueLabel: "Configured",
    falseLabel: "Not configured",
    description: "Whether a subscription checkout exists for Plus+."
  },
  paidActivationApproved: {
    label: "Paid activation approved",
    trueLabel: "Approved",
    falseLabel: "Not approved",
    description: "Paid activation stays disabled until pricing, billing rules and customer terms are approved."
  }
};

const COUNT_LABELS: Record<string, string> = {
  content: "Service-awareness cards",
  contentDraft: "Service cards in draft",
  contentPublished: "Published service cards",
  contentArchived: "Archived service cards",
  plans: "Plans",
  activePlans: "Active plans",
  draftPlans: "Draft plans",
  benefits: "Benefits",
  publishedBenefits: "Published benefits",
  promotions: "Promotions",
  pendingPromotions: "Promotions awaiting review",
  countries: "Countries",
  memberships: "Memberships",
  entitlements: "Entitlements",
  members: "Members"
};

function FlagCard({ flagKey, value }: { flagKey: FlagKey; value: boolean | null }) {
  const copy = FLAG_COPY[flagKey];
  const title = value === true ? copy.trueLabel : value === false ? copy.falseLabel : "Not reported";

  const tone =
    value === true
      ? "border-[#1F6F4A] bg-[#123024]"
      : value === false
        ? "border-[#7A5B12] bg-[#2F2611]"
        : "border-[#30363D] bg-[#0B0E14]";

  const icon =
    value === true ? (
      <CheckCircle2 className="h-4 w-4 text-[#7EE2A8]" aria-hidden="true" />
    ) : value === false ? (
      <AlertTriangle className="h-4 w-4 text-[#F2CE72]" aria-hidden="true" />
    ) : (
      <CircleHelp className="h-4 w-4 text-[#C9D1D9]" aria-hidden="true" />
    );

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#8B949E]">{copy.label}</p>
        {icon}
      </div>
      <p className="mt-2 font-display text-xl font-extrabold leading-tight text-[#F0F6FC]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#C9D1D9]">{copy.description}</p>
      {value === null ? (
        <p className="mt-2 text-xs leading-5 text-[#8B949E]">
          The overview endpoint did not report this flag. It is not treated as approved or configured.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, rawKey }: { label: string; value: number; rawKey: string }) {
  return (
    <div className="rounded-xl border border-[#21262D] bg-[#0B0E14]/60 p-3">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#8B949E]">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">{value.toLocaleString("en-NG")}</dd>
      {label !== rawKey ? <dd className="mt-0.5 font-mono text-[10px] text-[#6E7681]">{rawKey}</dd> : null}
    </div>
  );
}

function AvailabilityText({ planEnabled }: { planEnabled: boolean | null }) {
  if (planEnabled === true) {
    return <span className="font-bold text-[#7EE2A8]">Plan enabled</span>;
  }
  return (
    <span className="font-bold text-[#F2CE72]">
      Not yet available
      {planEnabled === null ? <span className="block font-normal text-[#8B949E]">No plan flag reported</span> : null}
    </span>
  );
}

export function PlusOverviewPanel({
  overview,
  phase,
  error,
  onRetry,
  onOpenPlans
}: {
  overview: PlusOverview | null;
  phase: "loading" | "ready" | "error";
  error: unknown;
  onRetry: () => void;
  onOpenPlans: () => void;
}) {
  if (phase === "loading" && !overview) {
    return <LoadingBlock label="Loading the Plus+ overview…" rows={4} />;
  }

  if (phase === "error" && !overview) {
    return (
      <ErrorBlock
        title="Could not load the Plus+ overview"
        error={error}
        onRetry={onRetry}
        permissionHint="Reading the Plus+ overview requires the plus:content:read permission."
      />
    );
  }

  if (!overview) {
    return (
      <EmptyBlock title="No overview was returned">
        The Plus+ overview endpoint returned no data. Nothing is assumed about membership, checkout or country
        availability.
      </EmptyBlock>
    );
  }

  const flagRows: Array<{ key: FlagKey; node: ReactNode }> = [
    { key: "membershipOpen", node: <FlagCard flagKey="membershipOpen" value={overview.flags.membershipOpen} /> },
    { key: "checkoutConfigured", node: <FlagCard flagKey="checkoutConfigured" value={overview.flags.checkoutConfigured} /> },
    {
      key: "paidActivationApproved",
      node: <FlagCard flagKey="paidActivationApproved" value={overview.flags.paidActivationApproved} />
    }
  ];

  const plansByStatus = overview.plans.reduce<Record<string, number>>((totals, plan) => {
    totals[plan.status] = (totals[plan.status] ?? 0) + 1;
    return totals;
  }, {});

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Membership flags"
          description="The server reports these states. The Control Center does not switch them from this view."
          actions={
            <Button variant="secondary" onClick={onRetry} disabled={phase === "loading"}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          }
        />
        <div className="mt-4 grid gap-3 md:grid-cols-3">{flagRows.map((row) => <div key={row.key}>{row.node}</div>)}</div>
        {phase === "error" ? (
          <div className="mt-3">
            <ErrorBlock title="Could not refresh the overview" error={error} onRetry={onRetry} />
          </div>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-[#8B949E]">
          A flag reported as false is the current state, not a suggestion. Paid activation is never reported as successful
          here unless the server approves it.
        </p>
      </Panel>

      <Panel>
        <PanelHeader
          title="Reported counts"
          description="Only the count fields the overview endpoint actually returned are shown."
          headingId="plus-counts-heading"
        />
        <div aria-labelledby="plus-counts-heading" className="mt-4">
          {overview.counts.length === 0 ? (
            <EmptyBlock title="No counts reported">
              The overview endpoint returned no count fields. No totals are invented to fill this space.
            </EmptyBlock>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {overview.counts.map((count) => (
                <Stat key={count.key} label={COUNT_LABELS[count.key] ?? humanizeKey(count.key)} value={count.count} rawKey={count.key} />
              ))}
            </dl>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Plans reported"
          description="Plans are configured in the Plans & membership section. A plan is not a live membership until it is activated and approved."
          actions={<Button variant="secondary" onClick={onOpenPlans}>Open plans &amp; membership</Button>}
        />
        <div className="mt-4">
          {overview.plans.length === 0 ? (
            <EmptyBlock title="No plans reported">
              The server returned no plans. There is nothing to price, activate or sell.
            </EmptyBlock>
          ) : (
            <ul className="space-y-2">
              {overview.plans.map((plan) => (
                <li
                  key={plan.id}
                  className="flex flex-col gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14]/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-[#F0F6FC]">{plan.name}</p>
                    <p className="text-xs text-[#8B949E]">
                      {plan.currency ?? "Currency not recorded"} · {plan.billingPeriod ?? "Billing period not recorded"}
                    </p>
                  </div>
                  <StatusBadge status={plan.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {Object.keys(plansByStatus).length > 0 ? (
          <p className="mt-3 text-xs text-[#8B949E]">
            {Object.entries(plansByStatus)
              .map(([status, count]) => `${count} ${status.toLowerCase()}`)
              .join(" · ")}
          </p>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader
          title="Country availability"
          description="A country is available only when a plan explicitly enables it. Market configuration and currency alone are not Plus+ eligibility."
          headingId="plus-countries-heading"
        />
        <div className="mt-4">
          {overview.countries.length === 0 ? (
            <EmptyBlock title="No countries reported">
              The overview endpoint returned no country configuration. No market is presented as eligible.
            </EmptyBlock>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm" aria-labelledby="plus-countries-heading">
                <caption className="sr-only">
                  Countries reported by the Plus+ overview, with the explicit plan availability flag
                </caption>
                <thead>
                  <tr className="border-b border-[#21262D] text-[10px] uppercase tracking-[0.1em] text-[#8B949E]">
                    <th scope="col" className="py-2 pr-4 font-extrabold">Country</th>
                    <th scope="col" className="py-2 pr-4 font-extrabold">Code</th>
                    <th scope="col" className="py-2 pr-4 font-extrabold">Currency</th>
                    <th scope="col" className="py-2 font-extrabold">Plus+ availability</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.countries.map((country) => (
                    <tr key={country.code} className="border-b border-[#21262D]/60 align-top">
                      <td className="py-2.5 pr-4 font-semibold text-[#F0F6FC]">{country.name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-[#C9D1D9]">{country.code}</td>
                      <td className="py-2.5 pr-4 text-[#C9D1D9]">{country.currency ?? "Not recorded"}</td>
                      <td className="py-2.5">
                        <AvailabilityText planEnabled={country.planEnabled} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-[#8B949E]">
          Country configuration is not eligibility. A country remains “Not yet available” until a plan is enabled for it
          on the server.
        </p>
      </Panel>
    </div>
  );
}
