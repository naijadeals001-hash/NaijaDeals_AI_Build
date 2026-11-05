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
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addressBusy, setAddressBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [summary, addressList, savedList] = await Promise.all([
        apiClient.getAccount() as Promise<Account>,
        apiClient.getAddresses() as Promise<Address[]>,
        apiClient.getSaved()
      ]);
      setAccount(summary);
      setProfileForm({ name: (summary as Account).name, phone: (summary as Account).phone ?? "" });
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

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setNotice(""); setProfileBusy(true);
    try {
      const updated = await apiClient.updateAccount(profileForm);
      setAccount((current) => current ? { ...current, name: updated.name, phone: updated.phone ?? null } : current);
      setNotice("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally { setProfileBusy(false); }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setError("New password and confirmation do not match."); return; }
    setPasswordBusy(true);
    try {
      await apiClient.changePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      setNotice("Password changed. Signing you out…");
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      router.push("/login?next=/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally { setPasswordBusy(false); }
  }

  async function saveAddress(event: React.FormEvent) {
    event.preventDefault();
    if (!editingAddress) return;
    setError(""); setNotice(""); setAddressBusy(editingAddress.id);
    try {
      await apiClient.updateAddress(editingAddress.id, { label: editingAddress.label, city: editingAddress.city, state: editingAddress.state, line1: editingAddress.line1, line2: editingAddress.line2, phone: editingAddress.phone, isDefault: editingAddress.isDefault });
      setEditingAddress(null);
      setNotice("Address updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update address.");
    } finally { setAddressBusy(""); }
  }

  async function makeDefault(address: Address) {
    setError(""); setAddressBusy(address.id);
    try {
      await apiClient.updateAddress(address.id, { isDefault: true });
      setNotice("Default delivery address updated.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not set default address."); }
    finally { setAddressBusy(""); }
  }

  async function removeSaved(productId: string) {
    setError(""); setAddressBusy(productId);
    try { await apiClient.toggleSaved(productId); setNotice("Removed from saved items."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not remove saved item."); }
    finally { setAddressBusy(""); }
  }

  async function moveSavedToCart(product: ApiProduct) {
    setError(""); setAddressBusy(product.id);
    try {
      await apiClient.addCartItem(product.id, 1, product.variants?.[0]?.id ?? null);
      setNotice("Added to cart.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add saved item to cart."); }
    finally { setAddressBusy(""); }
  }

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
      <section className="grid gap-3 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="rounded-2xl border border-border-soft bg-canvas p-4">
          <h2 className="font-display text-lg font-extrabold">Profile</h2>
          <label className="mt-2 block text-xs font-bold">Name
            <input required minLength={2} maxLength={80} value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm" />
          </label>
          <label className="mt-2 block text-xs font-bold">Phone
            <input value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} inputMode="tel" className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm" />
          </label>
          <button type="submit" disabled={profileBusy} className="mt-3 min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">{profileBusy ? "Saving…" : "Save profile"}</button>
        </form>
        <form onSubmit={savePassword} className="rounded-2xl border border-border-soft bg-canvas p-4">
          <h2 className="font-display text-lg font-extrabold">Password &amp; security</h2>
          <label className="mt-2 block text-xs font-bold">Current password
            <input required type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm" />
          </label>
          <label className="mt-2 block text-xs font-bold">New password
            <input required minLength={8} type="password" autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm" />
          </label>
          <label className="mt-2 block text-xs font-bold">Confirm new password
            <input required minLength={8} type="password" autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm" />
          </label>
          <button type="submit" disabled={passwordBusy} className="mt-3 min-h-10 rounded-lg border border-border-soft px-4 text-sm font-bold disabled:opacity-60">{passwordBusy ? "Changing…" : "Change password"}</button>
        </form>
      </section>
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

      <section id="addresses" className="rounded-2xl border border-border-soft bg-canvas p-5">
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
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                {!address.isDefault ? <button type="button" disabled={addressBusy === address.id} onClick={() => void makeDefault(address)} className="text-primary underline">Set default</button> : <span className="text-muted">Default</span>}
                <button type="button" onClick={() => setEditingAddress(address)} className="text-primary underline">Edit</button>
                <button type="button" onClick={() => void removeAddress(address.id)} className="text-crimson underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
        {editingAddress ? (
          <form onSubmit={saveAddress} className="mt-3 grid gap-2 rounded-xl border border-primary/30 bg-primary-soft/30 p-3 sm:grid-cols-2">
            {([["label","Label"],["phone","Phone"],["line1","Street address"],["line2","Apartment / landmark"],["city","City"],["state","State"]] as Array<[keyof Address,string]>).map(([field,label]) => (
              <label key={field} className="text-xs font-bold">{label}
                <input value={(editingAddress[field] as string | null) ?? ""} onChange={(event) => setEditingAddress({ ...editingAddress, [field]: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-white px-3 text-sm" />
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={editingAddress.isDefault} onChange={(event) => setEditingAddress({ ...editingAddress, isDefault: event.target.checked })} /> Make default</label>
            <div className="flex gap-2 self-end">
              <button type="submit" disabled={addressBusy === editingAddress.id} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">Save address</button>
              <button type="button" onClick={() => setEditingAddress(null)} className="min-h-10 rounded-lg border border-border-soft px-4 text-sm font-bold">Cancel</button>
            </div>
          </form>
        ) : null}
      </section>

      <section id="saved" className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">Saved items</h2>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing saved yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((item) => (
              <div key={item.id} className="rounded-xl bg-surface-low p-3">
                <Link href={`/product/${item.product.slug}`} className="flex gap-3">
                  <img src={item.product.images[0]?.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <div>
                    <p className="line-clamp-2 text-sm font-bold">{item.product.name}</p>
                    <p className="text-sm font-black text-primary">{koboToNaira(item.product.priceKobo)}</p>
                    <p className="text-[11px] text-muted">{(item.product.stock?.quantity ?? 0) > 0 ? "In stock" : "Out of stock"}</p>
                  </div>
                </Link>
                <div className="mt-2 flex gap-3 text-xs font-bold">
                  <button type="button" disabled={addressBusy === item.product.id || (item.product.stock?.quantity ?? 0) <= 0} onClick={() => void moveSavedToCart(item.product)} className="text-primary underline disabled:opacity-50">Add to cart</button>
                  <button type="button" disabled={addressBusy === item.product.id} onClick={() => void removeSaved(item.product.id)} className="text-crimson underline disabled:opacity-50">Remove</button>
                </div>
              </div>
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
