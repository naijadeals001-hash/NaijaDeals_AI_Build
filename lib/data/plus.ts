import { publicServices, type PublicService } from "@/lib/data/public-services";

/**
 * Public Plus+ membership state.
 *
 * Plus+ has no approved plan, price, billing integration or exclusive
 * entitlement. This module is the single public source for that state so the
 * landing page cannot drift into a functioning-looking subscription flow.
 *
 * Do not add a plan, price or benefit merely to make a section look complete.
 * A plan may only be published after its commercial terms, countries and
 * cancellation policy are approved; a benefit may only appear after it is
 * attached to that plan. Standard ecosystem services are never Plus+ benefits.
 */
/**
 * Approved Plus+ entitlements. Intentionally empty: there is no approved
 * benefit register yet. The landing page renders an honest empty state rather
 * than promoting standard services as exclusive.
 */
export type PlusBenefit = {
  id: string;
  title: string;
  description: string;
  /** The approved plan this entitlement belongs to. */
  planName: string;
  /**
   * ISO country codes where the entitlement is approved. Populated only when a
   * plan and its market scope exist; the card states when it is not published.
   */
  eligibleCountries: string[];
};

export const plusBenefits: PlusBenefit[] = [];

export const plusAvailability = {
  membershipOpen: false,
  checkoutConfigured: false,
  plansConfigured: 0,
  benefitsConfigured: plusBenefits.length
} as const;

/**
 * Short status labels derived from `plusAvailability`. Every membership or
 * checkout status label on the landing page reads from this object, so the
 * flags and the copy cannot drift apart.
 */
export const plusStatus = {
  membership: plusAvailability.membershipOpen ? "Membership open" : "Membership not open",
  checkout: plusAvailability.checkoutConfigured ? "Checkout configured" : "No checkout",
  billing: plusAvailability.checkoutConfigured ? "Configured" : "Unavailable",
  subscriptionCheckout: plusAvailability.checkoutConfigured ? "Configured" : "None",
  checkoutStep: plusAvailability.checkoutConfigured ? "Configured" : "Not available",
  plan:
    plusAvailability.plansConfigured === 0
      ? "Not configured"
      : `${plusAvailability.plansConfigured} ${plusAvailability.plansConfigured === 1 ? "plan" : "plans"} configured`
} as const;

/** Sentence form of the membership/checkout flags used in the hero and closing copy. */
export const plusMembershipSummary = plusAvailability.membershipOpen
  ? plusAvailability.checkoutConfigured
    ? "Membership is marked open and subscription checkout is configured in this build."
    : "Membership is marked open in this build, but subscription checkout is not configured."
  : plusAvailability.checkoutConfigured
    ? "Membership is not open in this build. Subscription checkout is marked configured, but no plan is published on this page."
    : "It is not open: no plan, price, exclusive benefit or billing setup has been approved.";

export type PlusMarketCountry = {
  code: string;
  name: string;
  currency: string;
};

export type PlusMarketFacts = {
  /**
   * `unavailable` means the effective configuration read failed. No market or
   * currency value may be presented as current in that state.
   */
  state: "configured" | "unavailable";
  deliveryMarkets: PlusMarketCountry[];
  browseOnlyMarkets: PlusMarketCountry[];
  /** Currency of the first delivery-enabled market, or null when none is configured. */
  storeCurrency: string | null;
};

/** The effective country activation rows the page reads from the server. */
export type PlusCountryActivation = {
  code: string;
  name: string;
  currency: string;
  enabled: boolean;
  deliveryEnabled: boolean;
};

export const plusMarketFactsUnavailable: PlusMarketFacts = {
  state: "unavailable",
  deliveryMarkets: [],
  browseOnlyMarkets: [],
  storeCurrency: null
};

/**
 * Collapse the effective country activations (static configuration overlaid by
 * admin-editable database rows) into the marketplace facts Plus+ may state.
 * Fully disabled markets are omitted: they are neither delivery nor browse-only
 * markets, so listing them would overstate availability.
 */
export function resolvePlusMarketFacts(activations: readonly PlusCountryActivation[]): PlusMarketFacts {
  const enabled = activations.filter((country) => country.enabled);
  const deliveryMarkets = enabled
    .filter((country) => country.deliveryEnabled)
    .map(({ code, name, currency }) => ({ code, name, currency }));
  const browseOnlyMarkets = enabled
    .filter((country) => !country.deliveryEnabled)
    .map(({ code, name, currency }) => ({ code, name, currency }));
  return {
    state: "configured",
    deliveryMarkets,
    browseOnlyMarkets,
    storeCurrency: deliveryMarkets[0]?.currency ?? null
  };
}

type AwarenessKey = "drive" | "shop" | "eats" | "send" | "gigs" | "stay" | "fresh" | "stream" | "pay" | "earn";

type AwarenessDetail = {
  /** A distinct classification, separate from the service's public label. */
  classification: string;
  headline: string;
  benefit: string;
};

/**
 * Order and copy for the ecosystem awareness rail. Each entry maps to a real
 * public service; images, descriptions and destination routes come from
 * `publicServices` rather than being duplicated here.
 */
const AWARENESS_ORDER: AwarenessKey[] = ["drive", "shop", "eats", "send", "gigs", "stay", "fresh", "stream", "pay", "earn"];

const AWARENESS_DETAILS: Record<AwarenessKey, AwarenessDetail> = {
  drive: {
    classification: "Mobility",
    headline: "Fares before you ride",
    benefit: "Book a verified ride with the fare shown up front."
  },
  shop: {
    classification: "Marketplace",
    headline: "Everyday retail and bulk buying",
    benefit: "Verified sellers with escrow-protected checkout."
  },
  eats: {
    classification: "Food delivery",
    headline: "Meals from local kitchens",
    benefit: "Order from restaurants and bukas around you."
  },
  send: {
    classification: "Logistics",
    headline: "Parcels and freight, tracked",
    benefit: "Send across town with delivery events you can follow."
  },
  gigs: {
    classification: "Home and business",
    headline: "Verified pros for the job",
    benefit: "Find electricians, designers and other vetted professionals."
  },
  stay: {
    classification: "Accommodation",
    headline: "Hotels and serviced stays",
    benefit: "Find hotels, shortlets and serviced apartments."
  },
  fresh: {
    classification: "Groceries",
    headline: "Market-fresh groceries",
    benefit: "Fresh produce and staples from supported markets."
  },
  stream: {
    classification: "Music and creators",
    headline: "African music and shows",
    // Live rooms are watch-only in this build: no chat or join control exists.
    benefit: "Listen to African music and watch creator live events."
  },
  pay: {
    classification: "Money",
    headline: "One wallet for the ecosystem",
    benefit: "Pay, receive and manage money in one wallet."
  },
  earn: {
    classification: "Affiliate earnings",
    headline: "Earn by referring",
    benefit: "Refer customers or sell and earn with NaijaDeals."
  }
};

const STATUS_LABELS: Record<PublicService["status"], string> = {
  live: "Live",
  preview: "Preview",
  setup: "Setup needed",
  coming: "Not yet available"
};

export type PlusServiceCardData = PublicService & AwarenessDetail & { statusLabel: string };

/** The ten real services shown in the awareness rail, in a fixed public order. */
export const plusServiceCards: PlusServiceCardData[] = AWARENESS_ORDER.map((key) => {
  const service = publicServices.find((candidate) => candidate.key === key);
  if (!service) throw new Error(`Plus+ awareness service is missing from publicServices: ${key}`);
  return {
    ...service,
    ...AWARENESS_DETAILS[key],
    statusLabel: STATUS_LABELS[service.status]
  };
});

export type PlusFaqItem = {
  question: string;
  answer: string;
};

export const plusFaqs: PlusFaqItem[] = [
  {
    question: "Is Plus+ available now?",
    answer: plusAvailability.membershipOpen
      ? "This build reports membership as open. Even so, this page publishes no plan, price or join flow, so nothing here can enrol you."
      : "No. There is no open membership, plan or subscription. Nothing on this page can enrol you, and there is no join button because there is no plan to join."
  },
  {
    question: "Can I pay, start a trial or pre-register?",
    answer: plusAvailability.checkoutConfigured
      ? "This build reports subscription checkout as configured, but this page contains no billing form, trial or payment step and collects no waitlist details."
      : "No. No price or billing setup is configured, so this page contains no checkout, trial or payment form. It also does not collect waitlist or email signup details."
  },
  {
    question: "Which exclusive benefits are included?",
    answer:
      "None are configured. Standard NaijaDeals services are not Plus+ benefits. An entitlement will be listed in the benefits register only after it is approved and attached to a plan."
  },
  {
    question: "Which countries can join?",
    answer:
      "No country has a configured Plus+ plan yet. The marketplace currently enables checkout and delivery in the markets shown as commerce-enabled; the other listed markets are browse-only in this build. That is not Plus+ eligibility."
  },
  {
    question: "Does Plus+ change my existing orders, wallet or service access?",
    answer:
      "No. No membership is attached to any account by this page. Existing orders and services keep their current terms, pricing and support paths."
  },
  {
    question: "How will I know when membership opens?",
    answer:
      "This page is the public source of truth in this build. There is no Plus+ waitlist or notification signup collecting contact details, so there is nothing to opt in to yet."
  },
  {
    question: "Why does the page show other NaijaDeals services?",
    answer:
      "They are real services you can use today, shown for awareness. They are not membership entitlements, and opening one does not create a Plus+ membership."
  }
];
