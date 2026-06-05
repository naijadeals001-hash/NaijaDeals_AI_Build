export type ServiceResult<T> = Promise<T>;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  trustScore: number;
};

export type UserProfile = SessionUser & {
  phone?: string;
  kycStatus: "pending" | "verified" | "rejected";
  preferredLanguage: "en" | "pidgin" | "yo" | "ig" | "ha";
};

export type VendorProfile = {
  id: string;
  name: string;
  verticals: string[];
  verificationStatus: "pending" | "verified" | "suspended";
  payoutAccountId?: string;
};

export type OrderRecord = {
  id: string;
  userId: string;
  vendorId?: string;
  status: "draft" | "paid" | "in_transit" | "delivered" | "disputed" | "refunded";
  totalKobo: number;
  escrowHoldId?: string;
};

export type LedgerEntry = {
  id: string;
  walletId: string;
  type: "credit" | "debit" | "hold" | "release" | "refund" | "payout";
  amountKobo: number;
  reference: string;
};

export type EscrowHold = {
  id: string;
  orderId: string;
  amountKobo: number;
  status: "held" | "released" | "refunded" | "disputed";
};

export type PaymentIntent = {
  id: string;
  orderId: string;
  provider: "paystack" | "flutterwave" | "wallet";
  amountKobo: number;
  status: "pending" | "authorized" | "failed" | "captured";
};

export type DisputeCase = {
  id: string;
  orderId: string;
  reason: string;
  status: "open" | "merchant_response" | "review" | "resolved";
};

export type TrackingMission = {
  id: string;
  kind: "delivery" | "ride" | "food" | "gig" | "stay";
  status: string;
  events: Array<{ label: string; at: string; proofType?: "qr" | "barcode" | "photo" | "gps" }>;
};

export type AdminAnalytics = {
  gmvKobo: number;
  activeMissions: number;
  escrowHeldKobo: number;
  fraudAlerts: number;
};
