import type { ServiceResult, VendorProfile } from "@/lib/services/types";

export async function listVerifiedVendors(vertical?: string): ServiceResult<VendorProfile[]> {
  // TODO(backend): Replace with vendor API query filtered by vertical, region, verification, and risk state.
  const vendors: VendorProfile[] = [
    { id: "v_bal_001", name: "Balogun Fabrics Direct", verticals: ["shop"], verificationStatus: "verified", payoutAccountId: "payout_bal_001" },
    { id: "v_mama_001", name: "Mama Cass Surulere", verticals: ["eats"], verificationStatus: "verified", payoutAccountId: "payout_mama_001" }
  ];
  return vendors.filter((vendor) => !vertical || vendor.verticals.includes(vertical));
}

export async function onboardVendor(input: Partial<VendorProfile>): ServiceResult<VendorProfile> {
  // TODO(backend): Create vendor draft, run KYC/business verification, and connect payout rails.
  return {
    id: input.id ?? "v_demo_new",
    name: input.name ?? "New NaijaDeals Vendor",
    verticals: input.verticals ?? ["shop"],
    verificationStatus: "pending",
    payoutAccountId: input.payoutAccountId
  };
}
