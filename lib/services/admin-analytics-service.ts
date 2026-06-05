import type { AdminAnalytics, ServiceResult } from "@/lib/services/types";

export async function getAdminAnalytics(): ServiceResult<AdminAnalytics> {
  // TODO(backend): Aggregate from warehouse/events API, not from client mock data.
  return {
    gmvKobo: 24800000000,
    activeMissions: 12804,
    escrowHeldKobo: 180000000000,
    fraudAlerts: 38
  };
}

export async function getRiskDashboard() {
  // TODO(backend): Pull AI fraud scores, rule hits, sanctions checks, and operations queue state.
  return [
    { signal: "Wallet velocity spike", severity: "high", count: 18 },
    { signal: "Vendor refund ratio", severity: "medium", count: 42 }
  ];
}
