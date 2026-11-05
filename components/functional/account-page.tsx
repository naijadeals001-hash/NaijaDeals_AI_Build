"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Headphones, Loader2, LogOut, MapPin, PackageCheck, RotateCcw, Store, UserCircle, Wallet } from "lucide-react";
import { ApiRequestError, apiClient, koboToNaira, type ApiProduct } from "@/lib/api-client";

type Address = {
  id: string;
  label: string;
  countryCode: string;
  state: string;
  city: string;
  line1: string;
  line2?: string | null;
  phone: string;
  isDefault: boolean;
};

type Account = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  actorType: string;
  roles: string[];
  vendors: Array<{ id: string; name: string; status: string }>;
  addressCount: number;
  savedCount: number;
  orderCount: number;
  sellerApplication?: { status: string; businessName: string; note?: string | null } | null;
};

const emptyAddress = { label: "Home", countryCode: "NG", state: "Lagos", city: "Ikeja", line1: "", line2: "", phone: "", postalCode: "" };

export function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [saved, setSaved] = useState<Array<{ id: string; product: ApiProduct }>>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [showAddress, setShowAddress] = useState(false);
  const [application, setApplication] = useState({
    businessName: "",
    market: "",
    countryCode: "NG",
    pickupAddress: "",
    phone: "",
    category: "Phones & Tablets"
  });
  const [appBusy, setAppBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [summary, addressList, savedList] = await Promise.all([
        apiClient.getAccount() as Promise<Account>,
        apiClient.getAddresses() as Promise<Address[]>,
        apiClient.getSaved()
      ]);
      setAccount(summary);
      setAddresses(addressList);
      setSaved(savedList);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) setStatus("signed-out");
      else {
        setError(err instanceof Error ? err.message : "Unable to load account.");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addAddress(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await apiClient.createAddress(addressForm);
      setAddressForm(emptyAddress);
      setShowAddress(false);
      setNotice("Address saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save address.");
    }
  }

  async function removeAddress(id: string) {
    setError("");
    try {
      await apiClient.deleteAddress(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete address.");
    }
  }

  async function submitApplication(event: React.FormEvent) {
    event.preventDefault();
    setAppBusy(true);
    setError("");
    try {
      await apiClient.submitSellerApplication(application);
      setNotice("Seller application submitted for review.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit application.");
    } finally {
      setAppBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-border-soft bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (status === "signed-out") {
    router.push("/login?next=/account");
    return null;
  }
  if (status === "error" || !account) {
    return (
      <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-4 font-bold text-crimson">
        <AlertCircle className="mb-1 h-4 w-4" /> {error || "Account unavailable."}
      </div>
    );
  }

  const canSell = account.roles.includes("vendor") || account.vendors.length > 0;

  return (
    <div className="space-y-6">
      <section aria-label="Account menu" className="overflow-hidden rounded-2xl border border-[#D5D9D9] bg-white">
        <div className="bg-[#232F3E] px-5 py-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">Hello, {account.name.split(" ")[0]}</p>
              <h1 className="font-display text-2xl font-extrabold">Your Account</h1>
            </div>
            <UserCircle className="h-10 w-10 text-white/80" aria-hidden="true" />
          </div>
        </div>
        <div className="divide-y divide-[#D5D9D9] px-5 py-2 text-sm">
          <Link href="/orders" className="flex items-center gap-2 py-3 font-semibold"><PackageCheck className="h-4 w-4" /> Your Orders</Link>
          <Link href="/orders" className="flex items-center gap-2 py-3 font-semibold"><RotateCcw className="h-4 w-4" /> Your Returns</Link>
          <Link href="/naijashop" className="flex items-center gap-2 py-3 font-semibold"><PackageCheck className="h-4 w-4" /> Buy Again</Link>
          <Link href="/support" className="flex items-center gap-2 py-3 font-semibold"><Headphones className="h-4 w-4" /> Customer Service</Link>
          <button
            type="button"
            className="flex w-full items-center gap-2 py-3 text-left font-semibold"
            onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined); router.push("/login"); }}
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </section>
      <header>
        <h1 className="font-display text-3xl font-extrabold">Your account</h1>
        <p className="text-sm text-muted">
          {account.name} · {account.email} · {account.roles.join(", ")}
        </p>
      </header>
      {notice ? <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">{notice}</div> : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/orders" className="rounded-2xl border border-border-soft bg-canvas p-4 hover:shadow-soft">
          <PackageCheck className="h-6 w-6 text-primary" />
          <p className="mt-2 font-display text-2xl font-extrabold">{account.orderCount}</p>
          <p className="text-sm text-muted">Orders</p>
        </Link>
        <Link href="/wallet" className="rounded-2xl border border-border-soft bg-canvas p-4 hover:shadow-soft">
          <Wallet className="h-6 w-6 text-primary" />
          <p className="mt-2 font-display text-2xl font-extrabold">Wallet</p>
          <p className="text-sm text-muted">Balances and escrow</p>
        </Link>
        {canSell ? (
          <Link href="/seller" className="rounded-2xl border border-border-soft bg-canvas p-4 hover:shadow-soft">
            <Store className="h-6 w-6 text-primary" />
            <p className="mt-2 font-display text-2xl font-extrabold">Seller hub</p>
            <p className="text-sm text-muted">{account.vendors.map((vendor) => vendor.name).join(", ")}</p>
          </Link>
        ) : (
          <Link href="/sell" className="rounded-2xl border border-border-soft bg-canvas p-4 hover:shadow-soft">
            <Store className="h-6 w-6 text-primary" />
            <p className="mt-2 font-display text-2xl font-extrabold">Sell</p>
            <p className="text-sm text-muted">Apply to open a shop</p>
          </Link>
        )}
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-extrabold">Delivery addresses</h2>
          <button onClick={() => setShowAddress((open) => !open)} className="min-h-10 rounded-lg border border-border-soft px-3 text-sm font-bold">
            {showAddress ? "Close" : "Add address"}
          </button>
        </div>
        {showAddress ? (
          <form onSubmit={addAddress} className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["label", "Label"],
                ["phone", "Phone"],
                ["line1", "Street address"],
                ["line2", "Apartment / landmark"],
                ["city", "City"],
                ["state", "State"]
              ] as Array<[keyof typeof emptyAddress, string]>
            ).map(([field, label]) => (
              <label key={field}>
                <span className="text-sm font-black">{label}</span>
                <input
                  required={field !== "line2"}
                  value={addressForm[field]}
                  onChange={(event) => setAddressForm((current) => ({ ...current, [field]: event.target.value }))}
                  className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm"
                />
              </label>
            ))}
            <button type="submit" className="min-h-11 self-end rounded-lg bg-primary px-4 text-sm font-bold text-white">
              Save address
            </button>
          </form>
        ) : null}
        <div className="mt-3 space-y-2">
          {addresses.length === 0 ? <p className="text-sm text-muted">No saved addresses.</p> : null}
          {addresses.map((address) => (
            <div key={address.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-surface-low p-3">
              <div>
                <p className="flex items-center gap-2 font-bold">
                  <MapPin className="h-4 w-4 text-primary" /> {address.label} {address.isDefault ? "(default)" : ""}
                </p>
                <p className="text-sm text-muted">
                  {[address.line1, address.line2, address.city, address.state, address.countryCode].filter(Boolean).join(", ")}
                </p>
                <p className="text-xs text-muted">{address.phone}</p>
              </div>
              <button onClick={() => void removeAddress(address.id)} className="text-xs font-bold text-crimson underline">
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">Saved items</h2>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing saved yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((item) => (
              <Link key={item.id} href={`/product/${item.product.slug}`} className="flex gap-3 rounded-xl bg-surface-low p-3">
                <img src={item.product.images[0]?.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                <div>
                  <p className="line-clamp-2 text-sm font-bold">{item.product.name}</p>
                  <p className="text-sm font-black text-primary">{koboToNaira(item.product.priceKobo)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">Seller application</h2>
        {account.sellerApplication ? (
          <div className="mt-2 rounded-xl bg-surface-low p-3 text-sm">
            <p className="font-bold">
              {account.sellerApplication.businessName} · {account.sellerApplication.status}
            </p>
            {account.sellerApplication.note ? <p className="text-muted">{account.sellerApplication.note}</p> : null}
          </div>
        ) : canSell ? (
          <p className="mt-2 text-sm text-muted">Your seller account is active. Open the seller hub to manage products.</p>
        ) : (
          <form onSubmit={submitApplication} className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["businessName", "Business name"],
                ["market", "Market / location"],
                ["pickupAddress", "Pickup address"],
                ["phone", "Pickup phone"],
                ["category", "Main category"]
              ] as Array<[keyof typeof application, string]>
            ).map(([field, label]) => (
              <label key={field}>
                <span className="text-sm font-black">{label}</span>
                <input
                  required
                  value={application[field]}
                  onChange={(event) => setApplication((current) => ({ ...current, [field]: event.target.value }))}
                  className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm"
                />
              </label>
            ))}
            <button type="submit" disabled={appBusy} className="min-h-11 self-end rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">
              {appBusy ? "Submitting..." : "Apply to sell"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
