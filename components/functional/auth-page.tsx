"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { apiClient, type SessionUser } from "@/lib/api-client";

function landingFor(user: SessionUser) {
  if (user.roles.includes("admin") || user.actorType === "ADMIN") return "/admin";
  if (user.roles.includes("vendor") || user.actorType === "VENDOR") return "/seller";
  if (user.roles.includes("courier") || user.actorType === "COURIER") return "/courier";
  return "/account";
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await apiClient.login(email, password)
          : await apiClient.register({ name, email, password, phone: phone || undefined });
      const next = params.get("next");
      router.push(next || landingFor(result.user));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header className="text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 font-display text-3xl font-extrabold">{mode === "login" ? "Sign in" : "Create an account"}</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "login" ? "Access your cart, orders and seller tools." : "Buy on NaijaDeals or apply to become a seller."}
        </p>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          <AlertCircle className="mb-1 h-4 w-4" />
          {error}
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border-soft bg-canvas p-5">
        {mode === "register" ? (
          <>
            <label className="block">
              <span className="text-sm font-black">Full name</span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-sm font-black">Phone (optional)</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold outline-none focus:border-primary"
              />
            </label>
          </>
        ) : null}
        <label className="block">
          <span className="text-sm font-black">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-sm font-black">Password</span>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold outline-none focus:border-primary"
          />
          {mode === "register" ? <span className="text-xs text-muted">At least 8 characters.</span> : null}
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New to NaijaDeals?{" "}
            <Link href="/register" className="font-bold text-primary underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-primary underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
