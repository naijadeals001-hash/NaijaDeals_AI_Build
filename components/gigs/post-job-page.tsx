"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

type Category = { id: string; name: string };
type Mode = "LOCAL" | "REMOTE" | "PROJECT";

const modeOptions: Array<{ value: Mode; label: string }> = [
  { value: "LOCAL", label: "Local — someone comes to you" },
  { value: "REMOTE", label: "Remote — work done online" },
  { value: "PROJECT", label: "Project — scoped engagement" }
];

function nairaToKobo(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const kobo = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null;
}

/**
 * Post a Job — creates a real CustomerJob record via /api/gigs/jobs that
 * verified professionals can browse and quote on (session-authenticated).
 */
export function NaijaGigsPostJobPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ reference?: string; title?: string } | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    categoryId: "",
    mode: "LOCAL" as Mode,
    budget: "",
    countryCode: "NG",
    state: "",
    city: "",
    deadline: ""
  });

  useEffect(() => {
    fetch("/api/gigs/categories")
      .then((res) => (res.ok ? res.json() : { categories: [] }))
      .then((body) => setCategories(Array.isArray(body.categories) ? body.categories : []))
      .catch(() => setCategories([]));
  }, []);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    const budgetKobo = form.budget.trim() ? nairaToKobo(form.budget) : null;
    if (form.budget.trim() && budgetKobo === null) {
      setError("Enter a valid budget amount, e.g. 25000.");
      setStatus("error");
      return;
    }
    try {
      const res = await fetch("/api/gigs/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          categoryId: form.categoryId || undefined,
          mode: form.mode,
          budgetKobo,
          countryCode: form.countryCode,
          state: form.state.trim(),
          city: form.city.trim() || undefined,
          deadline: form.deadline || undefined
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login?next=/naijagigs/post-job";
          return;
        }
        throw new Error(body.error ?? `Posting failed (HTTP ${res.status}).`);
      }
      setResult({ reference: body.reference, title: body.title });
      setStatus("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Posting failed.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#0F7A4A]" aria-hidden />
          <h2 className="font-display text-2xl font-extrabold text-[#0B1F16]">Job posted</h2>
          <p className="mt-2 text-sm text-[#6B7A72]">
            {result?.title ? `"${result.title}"` : "Your job"} is now visible to verified professionals
            {result?.reference ? ` under reference ${result.reference}` : ""}. Quotes you receive appear in your
            NaijaGigs overview.
          </p>
          <Link
            href="/naijagigs/services"
            className="mt-5 inline-block rounded-xl bg-[#0F7A4A] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#0B6540]"
          >
            Browse services while you wait
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/naijagigs" aria-label="Back to NaijaGigs" className="rounded-full border border-black/10 bg-white p-2.5 text-[#0B1F16] transition hover:bg-[#F5F7F6]">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0B1F16]">Post a Job</h1>
          <p className="text-xs text-[#6B7A72]">Describe the work — verified professionals send you quotes.</p>
        </div>
      </header>

      <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C]">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="grid gap-5">
          <label className="block text-xs font-medium text-[#16241D]">
            Job title
            <input
              type="text"
              value={form.title}
              onChange={set("title")}
              placeholder="e.g. Install a split AC in a 2-bedroom flat"
              maxLength={140}
              required
              className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
            />
          </label>

          <label className="block text-xs font-medium text-[#16241D]">
            Describe the work
            <textarea
              value={form.description}
              onChange={set("description")}
              placeholder="What needs doing, materials, access, expectations…"
              maxLength={4000}
              required
              rows={5}
              className="mt-1.5 w-full resize-none rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-[#16241D]">
              Category
              <select
                value={form.categoryId}
                onChange={set("categoryId")}
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none focus:border-[#0F7A4A]"
              >
                <option value="">Not sure yet</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-[#16241D]">
              Work arrangement
              <select
                value={form.mode}
                onChange={set("mode")}
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none focus:border-[#0F7A4A]"
              >
                {modeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs font-medium text-[#16241D]">
            Budget (₦, optional)
            <input
              inputMode="decimal"
              value={form.budget}
              onChange={set("budget")}
              placeholder="e.g. 35000"
              className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
            />
            <span className="mt-1 block text-[11px] text-[#6B7A72]">Professionals can quote above or below this.</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-[#16241D]">
              State
              <input
                type="text"
                value={form.state}
                onChange={set("state")}
                placeholder="e.g. Lagos"
                maxLength={80}
                required
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
              />
            </label>
            <label className="block text-xs font-medium text-[#16241D]">
              City
              <input
                type="text"
                value={form.city}
                onChange={set("city")}
                placeholder="e.g. Ikeja"
                maxLength={80}
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-[#16241D]">
            Deadline (optional)
            <input
              type="date"
              value={form.deadline}
              onChange={set("deadline")}
              className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none focus:border-[#0F7A4A]"
            />
          </label>

          <button
            type="submit"
            disabled={status === "submitting"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F7A4A] px-8 py-3.5 text-sm font-bold text-white transition hover:bg-[#0B6540] disabled:opacity-60"
          >
            {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {status === "submitting" ? "Posting job…" : "Post job"}
          </button>
          <p className="text-[11px] text-[#6B7A72]">
            Posting is free. You choose which quote to accept; payment is held safely by NaijaPay until the work is done.
          </p>
        </form>
      </div>
    </div>
  );
}
