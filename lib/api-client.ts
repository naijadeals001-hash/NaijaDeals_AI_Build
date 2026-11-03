"use client";

export type ApiMoney = string | number;

export type ApiCategory = { id: string; name: string; slug: string };

export type ApiVendor = {
  id: string;
  name: string;
  slug: string;
  market: string;
  trustScore: number;
  status: string;
};

export type ApiVariant = {
  id: string;
  name: string;
  sku: string;
  priceKobo: ApiMoney;
  stock: number;
  reserved: number;
  isActive: boolean;
};

export type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand?: string | null;
  condition?: string;
  priceKobo: ApiMoney;
  compareAtKobo?: ApiMoney | null;
  status: string;
  isSample?: boolean;
  category: ApiCategory;
  vendor: ApiVendor;
  images: Array<{ id: string; url: string; alt: string | null; sortOrder: number }>;
  stock?: { quantity: number; reserved: number; lowStockLevel: number } | null;
  variants?: ApiVariant[];
  reviews?: Array<{ id: string; rating: number; title: string; body: string; createdAt: string; user: { name: string } }>;
  rating?: { average: number | null; count: number };
  available?: number;
};

export type ApiCartItem = {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  savedForLater: boolean;
  product: ApiProduct;
  variant?: ApiVariant | null;
};

export type ApiCart = {
  id: string;
  userId: string;
  items: ApiCartItem[];
  totals: { itemCount: number; subtotalKobo: ApiMoney };
};

export type ApiOrderItem = {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitKobo: ApiMoney;
  totalKobo: ApiMoney;
  productName: string;
  variantName?: string | null;
  imageUrl?: string | null;
};

export type ApiPayment = {
  id: string;
  provider: string;
  status: string;
  amountKobo: ApiMoney;
  verifiedAt?: string | null;
  failureReason?: string | null;
};

export type ApiTrackingEvent = {
  id: string;
  status: string;
  label: string;
  description: string;
  proofCode?: string | null;
  createdAt: string;
};

export type ApiDelivery = {
  id: string;
  status: string;
  provider: string;
  trackingNumber?: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  feeKobo: ApiMoney;
  courier?: { id: string; name: string; phone: string } | null;
  trackingEvents?: ApiTrackingEvent[];
};

export type ApiReturnRequest = {
  id: string;
  status: string;
  reason: string;
  refundKobo: ApiMoney;
  restocked: boolean;
};

export type ApiOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotalKobo: ApiMoney;
  deliveryFeeKobo: ApiMoney;
  escrowFeeKobo: ApiMoney;
  commissionKobo: ApiMoney;
  totalKobo: ApiMoney;
  currency: string;
  deliveryAddress: string;
  contactName: string;
  contactPhone: string;
  createdAt: string;
  customer?: { id: string; name: string; email: string; phone?: string | null };
  vendor?: ApiVendor;
  items: ApiOrderItem[];
  payments?: ApiPayment[];
  deliveries?: ApiDelivery[];
  statusEvents?: Array<{ id: string; from?: string | null; to: string; note?: string | null; createdAt: string }>;
  returnRequests?: ApiReturnRequest[];
  reviews?: Array<{ id: string; productId: string }>;
};

export type ApiPaymentMethod = {
  id: "wallet" | "paystack" | "flutterwave" | "test";
  label: string;
  description: string;
  configured: boolean;
  supportsCountry: boolean;
  reason?: string;
};

export type CheckoutResult = {
  orders: Array<{
    orderId: string;
    orderNumber: string;
    vendorId: string;
    vendorName: string;
    subtotalKobo: ApiMoney;
    deliveryFeeKobo: ApiMoney;
    escrowFeeKobo: ApiMoney;
    totalKobo: ApiMoney;
    currency: string;
  }>;
  paymentMethods: ApiPaymentMethod[];
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  actorType: string;
  roles: string[];
  vendorIds: string[];
  walletBalanceKobo: string | null;
};

export type SellerOverview = {
  wallet: { availableKobo: ApiMoney; heldKobo: ApiMoney };
  vendor: { id: string; name: string; slug: string; status: string; market: string; pickupAddress: string; pickupPhone: string; trustScore: number; commissionBps: number; suspendedReason?: string | null };
  stats: {
    productCount: number;
    lowStockCount: number;
    pendingOrderCount: number;
    grossKobo: ApiMoney;
    commissionKobo: ApiMoney;
    netKobo: ApiMoney;
    openReturnCount: number;
  };
  orders: ApiOrder[];
  products: ApiProduct[];
  returns: Array<ApiReturnRequest & { order: { orderNumber: string }; user: { name: string } }>;
  payouts: Array<{ id: string; amountKobo: ApiMoney; status: string; reference: string }>;
};

export type AdminOverview = {
  users: number;
  vendors: number;
  products: number;
  orders: number;
  paidOrders: number;
  pendingApplications: number;
  lowStock: number;
  openReturns: number;
  disputes: number;
  auditLogs: number;
  grossVerifiedKobo: ApiMoney;
  completedPaymentCount: number;
  refundedKobo: ApiMoney;
  refundCount: number;
  escrowHeldKobo: ApiMoney;
  ordersByStatus: Array<{ status: string; count: number }>;
  paymentMethods: ApiPaymentMethod[];
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | undefined;
    try {
      const body = await response.json();
      message = body?.error ?? body?.message ?? message;
      code = body?.code;
    } catch {
      // keep the HTTP status message
    }
    throw new ApiRequestError(message, response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function withParams(path: string, params?: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export type ApiRideEvent = {
  id: string;
  status: string;
  label: string;
  description: string;
  createdAt: string;
};

export type ApiRide = {
  id: string;
  rideNumber: string;
  status: string;
  pickupLabel: string;
  pickupAddress: string;
  dropoffLabel: string;
  dropoffAddress: string;
  vehicleClass: string;
  distanceMeters: number;
  durationMinutes: number;
  fareKobo: ApiMoney;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  requestedAt: string;
  acceptedAt?: string | null;
  arrivedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  /** Deadline for the assigned driver's next action; null when nothing is pending. */
  assignmentExpiresAt?: string | null;
  /** Retained from the fare hold on a late cancellation, in integer kobo. */
  cancellationFeeKobo?: ApiMoney;
  driver?: {
    id: string;
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlate: string;
    phone?: string;
    user?: { id: string; name: string; phone: string | null };
  } | null;
  rider?: { id: string; name: string; phone: string | null } | null;
  events?: ApiRideEvent[];
};

export type ApiDriveQuote = {
  pickup: { id: string; label: string; address: string };
  dropoff: { id: string; label: string; address: string };
  vehicleClass: { id: string; label: string; description: string; seats: number };
  distanceMeters: number;
  durationMinutes: number;
  fareKobo: ApiMoney;
  currency: string;
  breakdown?: {
    baseKobo: number;
    distanceKobo: number;
    timeKobo: number;
    adjustmentKobo: number;
  };
};

export type ApiSavedPlace = {
  id: string;
  nickname: string;
  placeId: string;
  createdAt: string;
};

export type ApiDriverBoard = {
  driver: {
    id: string;
    status: string;
    vehicleClass: string;
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlate: string;
  };
  open: ApiRide[];
  active: ApiRide[];
  recent: ApiRide[];
};

export const apiClient = {
  me: () => requestJson<{ user: SessionUser | null }>("/api/auth/me"),
  login: (email: string, password: string) =>
    requestJson<{ user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (input: { name: string; email: string; password: string; phone?: string }) =>
    requestJson<{ user: SessionUser }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),
  logout: () => requestJson<{ signedOut: boolean }>("/api/auth/logout", { method: "POST" }),

  getProducts: (params?: Record<string, string | undefined>) => requestJson<ApiProduct[]>(withParams("/api/products", params)),
  getProduct: (id: string) => requestJson<ApiProduct>(`/api/products/${id}`),
  getCategories: () => requestJson<ApiCategory[]>("/api/categories"),

  getCart: () => requestJson<ApiCart>("/api/cart"),
  addCartItem: (productId: string, quantity = 1, variantId?: string | null) =>
    requestJson<ApiCart>("/api/cart/items", { method: "POST", body: JSON.stringify({ productId, quantity, variantId }) }),
  updateCartItem: (itemId: string, quantity: number, savedForLater?: boolean) =>
    requestJson<ApiCart>(`/api/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity, savedForLater }) }),
  deleteCartItem: (itemId: string) => requestJson<ApiCart>(`/api/cart/items/${itemId}`, { method: "DELETE" }),

  checkout: (input: {
    address: {
      label?: string;
      contactName: string;
      contactPhone: string;
      countryCode: string;
      state: string;
      city: string;
      line1: string;
      line2?: string;
      postalCode?: string;
    };
    saveAddress?: boolean;
  }) => requestJson<CheckoutResult>("/api/checkout", { method: "POST", body: JSON.stringify(input) }),

  getOrders: () => requestJson<ApiOrder[]>("/api/orders"),
  getOrder: (id: string) => requestJson<ApiOrder>(`/api/orders/${id}`),
  cancelOrder: (id: string, reason?: string) =>
    requestJson<{ cancelled: boolean; refunded: boolean }>(`/api/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  confirmOrder: (id: string) => requestJson<{ status: string }>(`/api/orders/${id}/confirm`, { method: "POST", body: JSON.stringify({ action: "complete" }) }),
  requestReturn: (id: string, reason: string, detail?: string) =>
    requestJson<ApiReturnRequest>(`/api/orders/${id}/confirm`, { method: "POST", body: JSON.stringify({ action: "return", reason, detail }) }),
  createReview: (input: { orderId: string; productId: string; rating: number; title: string; body: string }) =>
    requestJson<{ id: string }>("/api/reviews", { method: "POST", body: JSON.stringify(input) }),

  getPaymentMethods: (country = "NG", all = false) =>
    requestJson<{ countryCode: string; methods: ApiPaymentMethod[] }>(withParams("/api/payments/methods", { country, all: all ? "true" : undefined })),
  initializePayment: (orderId: string, provider: string) =>
    requestJson<{ paymentId: string; reference: string; provider: string; redirectUrl: string | null; instructions: string | null }>(
      "/api/payments/initialize",
      { method: "POST", body: JSON.stringify({ orderId, provider }) }
    ),
  confirmPayment: (reference: string, provider: string) =>
    requestJson<{ status: string; orderId: string; duplicate: boolean }>("/api/payments/confirm", {
      method: "POST",
      body: JSON.stringify({ reference, provider })
    }),

  getAccount: () => requestJson<Record<string, unknown>>("/api/account"),
  getAddresses: () => requestJson<Array<Record<string, unknown>>>("/api/account/addresses"),
  createAddress: (input: Record<string, unknown>) =>
    requestJson<Record<string, unknown>>("/api/account/addresses", { method: "POST", body: JSON.stringify(input) }),
  deleteAddress: (id: string) => requestJson<{ deleted: boolean }>(`/api/account/addresses/${id}`, { method: "DELETE" }),
  getSaved: () => requestJson<Array<{ id: string; product: ApiProduct }>>("/api/account/saved"),
  toggleSaved: (productId: string) => requestJson<{ saved: boolean }>("/api/account/saved", { method: "POST", body: JSON.stringify({ productId }) }),
  getSellerApplication: () => requestJson<Record<string, unknown> | null>("/api/account/seller-application"),
  submitSellerApplication: (input: Record<string, unknown>) =>
    requestJson<Record<string, unknown>>("/api/account/seller-application", { method: "POST", body: JSON.stringify(input) }),

  getWallet: () => requestJson<Record<string, unknown>>("/api/wallet"),
  getWalletLedger: () => requestJson<Array<Record<string, unknown>>>("/api/wallet/ledger"),
  getTracking: (id: string) => requestJson<Record<string, unknown>>(`/api/tracking/${id}`),

  sellerOverview: () => requestJson<SellerOverview>("/api/seller/overview"),
  sellerCreateProduct: (input: Record<string, unknown>) =>
    requestJson<ApiProduct>("/api/seller/products", { method: "POST", body: JSON.stringify(input) }),
  sellerUpdateProduct: (id: string, input: Record<string, unknown>) =>
    requestJson<ApiProduct>(`/api/seller/products/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  sellerOrders: () => requestJson<ApiOrder[]>("/api/seller/orders"),
  sellerOrderStatus: (id: string, status: string, note?: string) =>
    requestJson<ApiOrder>(`/api/seller/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status, note }) }),
  sellerReturnAction: (id: string, action: "approve" | "reject" | "receive") =>
    requestJson<Record<string, unknown>>(`/api/seller/returns/${id}`, { method: "POST", body: JSON.stringify({ action }) }),

  adminOverview: () => requestJson<AdminOverview>("/api/admin/overview"),
  adminOrders: () => requestJson<ApiOrder[]>("/api/admin/orders"),
  adminOrderStatus: (id: string, status: string, note?: string) =>
    requestJson<ApiOrder>(`/api/admin/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status, note }) }),
  adminApplications: () => requestJson<Array<Record<string, unknown>>>("/api/admin/applications"),
  adminReviewApplication: (id: string, decision: "approve" | "reject", note?: string) =>
    requestJson<Record<string, unknown>>(`/api/admin/applications/${id}`, { method: "POST", body: JSON.stringify({ decision, note }) }),
  adminSetCourierStatus: (id: string, active: boolean, reason?: string) =>
    requestJson<Record<string, unknown>>(`/api/admin/couriers/${id}/status`, { method: "POST", body: JSON.stringify({ active, reason }) }),
  adminSetDriverStatus: (userId: string, status: "approved" | "suspended", reason?: string) =>
    requestJson<Record<string, unknown>>(`/api/admin/drivers/${userId}/status`, { method: "POST", body: JSON.stringify({ status, reason }) }),
  adminSetVendorStatus: (id: string, status: "VERIFIED" | "SUSPENDED", reason?: string) =>
    requestJson<Record<string, unknown>>(`/api/admin/vendors/${id}/status`, { method: "POST", body: JSON.stringify({ status, reason }) }),
  adminModerateProduct: (id: string, status: string, note?: string) =>
    requestJson<Record<string, unknown>>(`/api/admin/products/${id}/moderate`, { method: "POST", body: JSON.stringify({ status, note }) }),
  adminPayments: () => requestJson<Array<Record<string, unknown>>>("/api/admin/payments"),
  adminCountries: () => requestJson<Array<Record<string, unknown>>>("/api/admin/countries"),
  adminCities: () => requestJson<Array<Record<string, unknown>>>("/api/admin/cities"),
  adminUpdateCity: (countryCode: string, city: string, enabled: boolean) =>
    requestJson<Record<string, unknown>>("/api/admin/cities", { method: "PATCH", body: JSON.stringify({ countryCode, city, enabled }) }),
  adminUpdateCountry: (code: string, enabled: boolean, deliveryEnabled: boolean) =>
    requestJson<Record<string, unknown>>("/api/admin/countries", { method: "PATCH", body: JSON.stringify({ code, enabled, deliveryEnabled }) }),
  adminProducts: () => requestJson<Array<Record<string, unknown>>>("/api/admin/products"),
  adminVendors: () => requestJson<Array<Record<string, unknown>>>("/api/admin/vendors"),
  adminUsers: () => requestJson<Array<Record<string, unknown>>>("/api/admin/users"),
  adminAuditLogs: () => requestJson<Array<Record<string, unknown>>>("/api/admin/audit-logs"),
  adminCouriers: () => requestJson<Array<Record<string, unknown>>>("/api/admin/couriers"),
  adminAssignCourier: (deliveryId: string, courierId: string) =>
    requestJson<Record<string, unknown>>(`/api/admin/deliveries/${deliveryId}/assign`, { method: "POST", body: JSON.stringify({ courierId }) }),
  adminDeliveryStatus: (deliveryId: string, status: string, note?: string, proofCode?: string) =>
    requestJson<Record<string, unknown>>(`/api/admin/deliveries/${deliveryId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note, proofCode })
    }),
  adminPayouts: () => requestJson<Array<Record<string, unknown>>>("/api/admin/payouts"),
  adminCreatePayout: (vendorId: string, periodStart: string, periodEnd: string) =>
    requestJson<Record<string, unknown>>("/api/admin/payouts", { method: "POST", body: JSON.stringify({ vendorId, periodStart, periodEnd }) }),
  adminPayPayout: (id: string) => requestJson<Record<string, unknown>>(`/api/admin/payouts/${id}/pay`, { method: "POST" }),

  courierDeliveries: () => requestJson<Array<Record<string, unknown>>>("/api/courier/deliveries"),
  courierDeliveryStatus: (id: string, status: string, note?: string, proofCode?: string) =>
    requestJson<Record<string, unknown>>(`/api/courier/deliveries/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note, proofCode })
    }),

  driveQuote: (pickup: string, dropoff: string, vehicleClass: string) =>
    requestJson<ApiDriveQuote>(
      withParams("/api/drive/quote", { pickup, dropoff, vehicleClass })
    ),
  driveRides: () => requestJson<ApiRide[]>("/api/drive/rides"),
  driveRequestRide: (input: {
    pickupId: string;
    dropoffId: string;
    vehicleClass: string;
    paymentMethod: "cash" | "wallet";
  }) => requestJson<ApiRide>("/api/drive/rides", { method: "POST", body: JSON.stringify(input) }),
  driveCancelRide: (id: string, reason?: string) =>
    requestJson<ApiRide>(`/api/drive/rides/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  driveSavedPlaces: () => requestJson<ApiSavedPlace[]>("/api/drive/places"),
  driveSavePlace: (input: { nickname: string; placeId: string }) =>
    requestJson<ApiSavedPlace>("/api/drive/places", { method: "POST", body: JSON.stringify(input) }),
  driveUpdateSavedPlace: (id: string, input: { nickname?: string; placeId?: string }) =>
    requestJson<ApiSavedPlace>(`/api/drive/places/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  driveDeleteSavedPlace: (id: string) =>
    requestJson<{ deleted: boolean }>(`/api/drive/places/${id}`, { method: "DELETE" }),
  driverRides: () => requestJson<ApiDriverBoard>("/api/drive/driver/rides"),
  driverAcceptRide: (id: string) =>
    requestJson<ApiRide>(`/api/drive/driver/rides/${id}/accept`, { method: "POST" }),
  driverRideStatus: (id: string, status: "driver_arriving" | "in_progress" | "completed") =>
    requestJson<ApiRide>(`/api/drive/driver/rides/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  driverReleaseRide: (id: string, reason?: string) =>
    requestJson<ApiRide>(`/api/drive/driver/rides/${id}/release`, { method: "POST", body: JSON.stringify({ reason }) }),
  driverCashCollected: (id: string) =>
    requestJson<ApiRide>(`/api/drive/driver/rides/${id}/cash`, { method: "POST" }),

  adminRides: () => requestJson<{ rides: ApiRide[] }>("/api/admin/rides"),
  adminCancelRide: (id: string, reason?: string) =>
    requestJson<ApiRide>(`/api/admin/rides/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) })
};

export function koboToNaira(value: ApiMoney, currency = "NGN") {
  const amount = typeof value === "bigint" ? Number(value) : typeof value === "string" ? Number(value) : Number(value);
  const symbol = currency === "NGN" ? "₦" : `${currency} `;
  return `${symbol}${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(amount / 100)}`;
}

export function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
