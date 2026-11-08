"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

const serviceModes = ["LOCAL", "REMOTE", "PROJECT"] as const;
const modeLabels: Record<string, string> = { LOCAL: "Local (in person)", REMOTE: "Remote", PROJECT: "Project based" };
const maxBioLength = 3000;
const maxHeadlineLength = 140;

type Category = { id: string; name: string };

/**
 * Professional onboarding. Posts the real application to /api/gigs/pro
 * (session-authenticated); nothing is stored client-side or faked.
 */
function ProfessionalApplyPage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    displayName: "",
    headline: "",
    bio: "",
    countryCode: "NG",
    state: "",
    city: "",
    serviceModes: [] as string[],
    categories: [] as string[],
    languages: [] as string[],
    yearsExperience: "",
    portfolioUrl: ""
  });

  useEffect(() => {
    fetch("/api/gigs/categories")
      .then((res) => (res.ok ? res.json() : { categories: [] }))
      .then((body) => setCategories(Array.isArray(body.categories) ? body.categories : []))
      .catch(() => setCategories([]));
  }, []);

  const toggle = (key: "serviceModes" | "categories", value: string) => {
    setForm((prev) => {
      const list = prev[key];
      const limit = key === "categories" ? 4 : 3;
      const next = list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value].slice(-limit);
      return { ...prev, [key]: next };
    });
  };

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = event.target;
      setForm((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setStatus("submitting");
      setError(null);
      try {
        const response = await fetch("/api/gigs/pro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            displayName: form.displayName.trim(),
            headline: form.headline.trim(),
            bio: form.bio.trim(),
            countryCode: form.countryCode,
            state: form.state.trim(),
            city: form.city.trim(),
            serviceModes: form.serviceModes,
            categoryIds: form.categories,
            languages: form.languages.length > 0 ? form.languages : ["English"],
            yearsExperience: parseInt(form.yearsExperience, 10) || 0,
            avatarUrl: form.portfolioUrl.trim() || undefined
          })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) {
            window.location.href = "/login?next=/naijagigs/pro/apply";
            return;
          }
          throw new Error(body.error ?? `Application failed (HTTP ${response.status}).`);
        }
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to submit application.");
      }
    },
    [form]
  );

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7F6] py-12">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#0F7A4A]" aria-hidden="true" />
          <h2 className="mb-2 font-display text-2xl font-extrabold text-[#0B1F16]">Application submitted</h2>
          <p className="mb-6 text-sm text-[#6B7A72]">
            Your professional onboarding application has been received. Our team reviews profiles
            within 2–3 business days and your status will update to VERIFIED once approved.
          </p>
          <Link
            href="/naijagigs/pro/dashboard"
            className="rounded-xl bg-[#0F7A4A] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#0B6540]"
          >
            Continue to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7F6]">
      <nav className="sticky top-0 z-10 border-b border-[#E5DFD2] bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="font-display text-xl font-extrabold text-[#0B1F16]">NaijaGigs — Professional onboarding</h1>
          <Link href="/naijagigs" className="text-xs font-medium text-[#6B7A72] transition-colors hover:text-[#0F7A4A]">
            ← Back to NaijaGigs
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="mb-2 font-display text-2xl font-extrabold text-[#0B1F16]">Become a NaijaGigs professional</h2>
          <p className="mb-6 text-sm text-[#6B7A72]">
            Offer local or remote services on the NaijaDeals ecosystem. Payments run through NaijaPay
            escrow; payouts land in your NaijaPay wallet.
          </p>

          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-5">
            <label className="block text-xs font-medium text-[#16241D]">
              Display name
              <input
                type="text"
                name="displayName"
                value={form.displayName}
                onChange={handleChange}
                placeholder="e.g. Adaeze Interiors"
                maxLength={80}
                required
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
              />
            </label>

            <label className="block text-xs font-medium text-[#16241D]">
              Headline
              <input
                type="text"
                name="headline"
                value={form.headline}
                onChange={handleChange}
                placeholder="e.g. Certified interior designer helping brands tell their story"
                maxLength={maxHeadlineLength}
                required
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
              />
              <span className="mt-1 block text-[11px] text-[#6B7A72]">{maxHeadlineLength} characters max</span>
            </label>

            <label className="block text-xs font-medium text-[#16241D]">
              Bio
              <textarea
                name="bio"
                value={form.bio}
                onChange={handleChange}
                placeholder="Tell customers about your skills, experience and the services you offer."
                maxLength={maxBioLength}
                required
                rows={5}
                className="mt-1.5 w-full resize-none rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
              />
              <span className="mt-1 block text-[11px] text-[#6B7A72]">{maxBioLength} characters max</span>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block text-xs font-medium text-[#16241D]">
                Country
                <select
                  name="countryCode"
                  value={form.countryCode}
                  onChange={handleChange}
                  className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none focus:border-[#0F7A4A]"
                >
                  <option value="NG">Nigeria (NGN)</option>
                  <option value="GH">Ghana (GHS)</option>
                  <option value="KE">Kenya (KES)</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-[#16241D]">
                Years of experience
                <input
                  type="number"
                  name="yearsExperience"
                  value={form.yearsExperience}
                  onChange={handleChange}
                  min={0}
                  max={60}
                  placeholder="e.g. 5"
                  className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block text-xs font-medium text-[#16241D]">
                State
                <input
                  type="text"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
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
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="e.g. Ikeja"
                  maxLength={80}
                  required
                  className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-xs font-medium text-[#16241D]">Service modes (choose at least one)</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {serviceModes.map((mode) => (
                  <label
                    key={mode}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition ${
                      form.serviceModes.includes(mode)
                        ? "border-[#0F7A4A] bg-[#EAF4EE] text-[#064E3B]"
                        : "border-[#E5DFD2] bg-white text-[#16241D]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.serviceModes.includes(mode)}
                      onChange={() => toggle("serviceModes", mode)}
                      className="h-4 w-4 accent-[#0F7A4A]"
                    />
                    {modeLabels[mode]}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-medium text-[#16241D]">Categories (up to 4)</legend>
              {categories.length === 0 ? (
                <p className="mt-2 text-xs text-[#6B7A72]">
                  Categories are unavailable right now. You can add them after applying.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition ${
                        form.categories.includes(category.id)
                          ? "border-[#0F7A4A] bg-[#EAF4EE] text-[#064E3B]"
                          : "border-[#E5DFD2] bg-white text-[#16241D]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.categories.includes(category.id)}
                        onChange={() => toggle("categories", category.id)}
                        className="h-4 w-4 accent-[#0F7A4A]"
                      />
                      {category.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <label className="block text-xs font-medium text-[#16241D]">
              Languages (comma separated)
              <input
                type="text"
                name="languages"
                value={form.languages.join(", ")}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    languages: event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, 8)
                  }))
                }
                placeholder="English, Yoruba, Igbo"
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
              />
            </label>

            <label className="block text-xs font-medium text-[#16241D]">
              Portfolio or profile link (optional)
              <input
                type="url"
                name="portfolioUrl"
                value={form.portfolioUrl}
                onChange={handleChange}
                placeholder="https://…"
                maxLength={500}
                className="mt-1.5 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-sm text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
              />
            </label>

            <div className="mt-2">
              <button
                type="submit"
                disabled={status === "submitting" || form.serviceModes.length === 0}
                className={`inline-flex items-center gap-2 rounded-xl px-8 py-3 font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F7A4A] disabled:cursor-not-allowed disabled:opacity-60 ${
                  status === "submitting" ? "bg-[#F5F7F6] text-[#16241D]" : "bg-[#0F7A4A] text-white hover:bg-[#0B6540]"
                }`}
              >
                {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {status === "submitting" ? "Submitting application…" : "Apply as professional"}
              </button>
            </div>
          </form>

          <div className="mt-8 rounded-xl border border-[#DFDEDB] bg-[#EDE6D8] p-6">
            <p className="mb-3 text-xs text-[#6B7A72]">
              <strong>Verification timeline:</strong> applications are reviewed within 2–3 business days. Once VERIFIED
              you can publish service listings and receive bookings.
            </p>
            <p className="text-xs text-[#6B7A72]">
              <strong>Commission:</strong> platform commission applies per completed booking on the NaijaPay ledger;
              payouts settle into your NaijaPay wallet.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ProfessionalApplyPage;
