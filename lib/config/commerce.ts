/**
 * Commerce configuration for NaijaDeals marketplace.
 *
 * Money rule: every amount stored in the database is an integer in the currency's
 * minor unit. NGN therefore uses kobo (1 NGN = 100 kobo). Never store floats.
 */

export type CountryConfig = {
  code: string;
  name: string;
  currency: string;
  /** Number of decimal digits in the currency's minor unit. */
  exponent: number;
  dialCode: string;
  deliveryEnabled: boolean;
  enabled: boolean;
};

export const COUNTRIES: Record<string, CountryConfig> = {
  NG: { code: "NG", name: "Nigeria", currency: "NGN", exponent: 2, dialCode: "+234", deliveryEnabled: true, enabled: true },
  GH: { code: "GH", name: "Ghana", currency: "GHS", exponent: 2, dialCode: "+233", deliveryEnabled: false, enabled: true },
  KE: { code: "KE", name: "Kenya", currency: "KES", exponent: 2, dialCode: "+254", deliveryEnabled: false, enabled: true },
  ZA: { code: "ZA", name: "South Africa", currency: "ZAR", exponent: 2, dialCode: "+27", deliveryEnabled: false, enabled: true },
  GB: { code: "GB", name: "United Kingdom", currency: "GBP", exponent: 2, dialCode: "+44", deliveryEnabled: false, enabled: true },
  US: { code: "US", name: "United States", currency: "USD", exponent: 2, dialCode: "+1", deliveryEnabled: false, enabled: true }
};

export function getCountry(code: string | null | undefined): CountryConfig {
  const country = COUNTRIES[(code || "NG").toUpperCase()];
  if (!country) throw new Error(`Unsupported country code: ${code}`);
  return country;
}

/** Convert a major-unit amount (e.g. 1500.50 NGN) into integer minor units. */
export function toMinorUnits(amount: number, currency: string): bigint {
  const exponent = Object.values(COUNTRIES).find((country) => country.currency === currency)?.exponent ?? 2;
  if (!Number.isFinite(amount)) throw new Error("Amount must be a finite number.");
  return BigInt(Math.round(amount * 10 ** exponent));
}

export function fromMinorUnits(amount: bigint, currency: string): number {
  const exponent = Object.values(COUNTRIES).find((country) => country.currency === currency)?.exponent ?? 2;
  return Number(amount) / 10 ** exponent;
}

export function formatMoney(amountMinor: bigint | string | number, currency = "NGN"): string {
  const value = typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);
  const config = Object.values(COUNTRIES).find((country) => country.currency === currency);
  const exponent = config?.exponent ?? 2;
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const divisor = BigInt(10 ** exponent);
  const major = absolute / divisor;
  const minor = (absolute % divisor).toString().padStart(exponent, "0");
  const formatted = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Number(major));
  return `${negative ? "-" : ""}${config?.code === "NG" ? "₦" : `${currency} `}${formatted}${exponent > 0 ? `.${minor}` : ""}`;
}

export type DeliveryZone = {
  id: string;
  label: string;
  states: string[];
  feeKobo: bigint;
  etaDays: [number, number];
  provider: string;
};

/** Manual NaijaSend zones. Fees are real configuration, not marketing copy. */
export const DELIVERY_ZONES: DeliveryZone[] = [
  { id: "lagos-mainland", label: "Lagos mainland", states: ["Lagos"], feeKobo: BigInt(150000), etaDays: [1, 2], provider: "naijasend-manual" },
  { id: "lagos-island", label: "Lagos island / Lekki", states: ["Lagos"], feeKobo: BigInt(200000), etaDays: [1, 2], provider: "naijasend-manual" },
  { id: "abuja", label: "Abuja (FCT)", states: ["FCT", "Abuja", "Federal Capital Territory"], feeKobo: BigInt(250000), etaDays: [2, 3], provider: "naijasend-manual" },
  { id: "south-south", label: "South-South", states: ["Rivers", "Delta", "Edo", "Akwa Ibom", "Cross River", "Bayelsa"], feeKobo: BigInt(300000), etaDays: [3, 5], provider: "naijasend-manual" },
  { id: "nationwide", label: "Rest of Nigeria", states: [], feeKobo: BigInt(350000), etaDays: [3, 7], provider: "naijasend-manual" }
];

const ISLAND_CITIES = ["lekki", "ikoyi", "victoria island", "vi", "ajah", "epe"];

export function resolveDeliveryZone(input: { countryCode: string; state: string; city?: string | null }): DeliveryZone {
  const country = getCountry(input.countryCode);
  if (!country.deliveryEnabled) {
    throw new Error(`Delivery is not configured for ${country.name} yet.`);
  }
  const state = input.state.trim().toLowerCase();
  const city = (input.city || "").trim().toLowerCase();
  if (state === "lagos") {
    return ISLAND_CITIES.some((candidate) => city.includes(candidate))
      ? DELIVERY_ZONES[1]
      : DELIVERY_ZONES[0];
  }
  const match = DELIVERY_ZONES.find((zone) =>
    zone.states.some((candidate) => candidate.toLowerCase() === state)
  );
  return match ?? DELIVERY_ZONES[DELIVERY_ZONES.length - 1];
}

export function deliveryQuote(input: { countryCode: string; state: string; city?: string | null; subtotalKobo: bigint }) {
  const zone = resolveDeliveryZone(input);
  // Free delivery for orders at or above ₦150,000 within the same zone.
  const feeKobo = input.subtotalKobo >= BigInt(15000000) ? BigInt(0) : zone.feeKobo;
  return { zone, feeKobo, etaDays: zone.etaDays };
}

export function escrowFee(subtotalKobo: bigint) {
  return (subtotalKobo * BigInt(100)) / BigInt(10000); // 1%
}

export function commissionFor(subtotalKobo: bigint, commissionBps: number) {
  return (subtotalKobo * BigInt(commissionBps)) / BigInt(10000);
}
