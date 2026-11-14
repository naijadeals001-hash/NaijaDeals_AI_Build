import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/auth/api-error";
import { hasAdminConsoleAccess } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { getCatalogueProductPreview } from "@/lib/services/core/catalogue-admin.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Metadata is intentionally static. A draft's name, image, description and
 * price must never appear in a document title, Open Graph tag or sitemap entry
 * before publication, including on an unauthorised request.
 */
export const metadata: Metadata = {
  title: "Catalogue preview — Control Center",
  robots: { index: false, follow: false, nocache: true }
};

function formatPrice(priceKobo: string, currency: string | null) {
  const major = Number(priceKobo) / 100;
  if (!Number.isFinite(major)) return "Unavailable";
  if (!currency) return major.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(major)} ${currency}`;
}

function statusCopy(status: string) {
  if (status === "DRAFT") {
    return {
      label: "Draft — not published",
      tone: "border-[#F2D48C]/40 bg-[#F2D48C]/10 text-[#F2D48C]",
      message:
        "This is an authorized Control Center preview. The public product page returns 404 until this listing is published."
    };
  }
  if (status === "ACTIVE") {
    return {
      label: "Published — publicly visible",
      tone: "border-[#00E676]/40 bg-[#00E676]/10 text-[#B7FFD4]",
      message: "This listing is published. The public product page is available."
    };
  }
  if (status === "ARCHIVED") {
    return {
      label: "Archived — not publicly visible",
      tone: "border-[#8B949E]/40 bg-[#8B949E]/10 text-[#C9D1D9]",
      message: "This listing is archived. It is not publicly visible; historical order snapshots remain readable."
    };
  }
  return {
    label: status,
    tone: "border-[#8B949E]/40 bg-[#8B949E]/10 text-[#C9D1D9]",
    message: "This listing is not currently published."
  };
}

export default async function CatalogueProductPreviewPage({ params }: { params: { id: string } }) {
  // The draft is read directly from the database on every request; no shared
  // cache entry can serve it after the session ends or the status changes.
  noStore();

  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/admin/catalogue/products/${params.id}/preview`)}`);
  }
  if (!hasAdminConsoleAccess(user)) redirect("/");
  if (!hasPermission(user, "products:read") && !hasPermission(user, "products:moderate")) {
    redirect("/admin");
  }

  let product;
  try {
    product = await getCatalogueProductPreview(user, params.id);
  } catch (error) {
    // Unknown ids and out-of-scope records both render the same not-found
    // response so the preview cannot be used to enumerate other regions.
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }

  const status = statusCopy(product.status);
  const activeVariants = product.variants.filter((variant) => variant.isActive);
  const onHandStock = activeVariants.length > 0
    ? activeVariants.reduce((total, variant) => total + variant.stock, 0)
    : product.stock?.quantity ?? 0;
  const cover = product.images[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-[#F0F6FC]">
      <nav aria-label="Breadcrumb" className="text-xs text-[#8B949E]">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <a href="/admin" className="underline hover:text-[#F0F6FC]">
              Control Center
            </a>
          </li>
          <li aria-hidden>/</li>
          <li>
            <a href="/admin/catalogue" className="underline hover:text-[#F0F6FC]">
              Catalogue workflow
            </a>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-[#F0F6FC]">
            {product.status === "DRAFT" ? "Draft preview" : "Product preview"}
          </li>
        </ol>
      </nav>

      <header className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#00E676]">
              {product.status === "DRAFT" ? "Authorized draft preview" : "Catalogue preview"}
            </p>
            <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">{product.name}</h1>
            <p className="mt-1 text-sm text-[#8B949E]">
              {product.category.name} · <span className="break-all">/product/{product.slug}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase ${status.tone}`}>
              {status.label}
            </span>
            {product.isDemo ? (
              <span className="rounded-full border border-[#F2D48C]/40 bg-[#F2D48C]/10 px-2.5 py-1 text-[10px] font-extrabold uppercase text-[#F2D48C]">
                DEMO
              </span>
            ) : null}
            {!product.category.isActive ? (
              <span className="rounded-full border border-[#F85149]/50 bg-[#F85149]/10 px-2.5 py-1 text-[10px] font-extrabold uppercase text-[#FFB4AE]">
                Department inactive
              </span>
            ) : null}
          </div>
        </div>
        <p className={`mt-3 rounded-xl border p-3 text-sm ${status.tone}`}>{status.message}</p>
        {product.isDemo ? (
          <p className="mt-2 text-xs text-[#F2D48C]">
            DEMO — inventory, specifications and availability are illustrative. This is not live supply or a verified
            seller offer.
          </p>
        ) : null}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section aria-labelledby="preview-gallery-heading" className="space-y-3">
          <h2 id="preview-gallery-heading" className="sr-only">
            Product images
          </h2>
          {cover ? (
            <div className="overflow-hidden rounded-2xl border border-[#21262D] bg-[#161B22]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover.url}
                alt={cover.alt ?? ""}
                className="mx-auto max-h-[520px] w-full object-contain"
                loading="eager"
              />
              <p className="border-t border-[#21262D] px-3 py-2 text-xs text-[#8B949E]">
                Primary cover image {product.images.length > 1 ? `1 of ${product.images.length}` : ""} ·{" "}
                <span className="break-all">{cover.url}</span>
                {!cover.alt ? " · alt text missing" : ""}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#30363D] bg-[#0B0E14] p-10 text-center text-sm text-[#8B949E]">
              No product image yet. Publication checks block this listing until an image with accessible alt text is
              added.
            </div>
          )}
          {product.images.length > 1 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {product.images.slice(1).map((image, index) => (
                <li key={image.id} className="overflow-hidden rounded-xl border border-[#21262D] bg-[#161B22]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.alt ?? ""} className="h-36 w-full object-cover" loading="lazy" />
                  <p className="px-2 py-1 text-[10px] text-[#8B949E]">
                    Image {index + 2}
                    {!image.alt ? " · alt text missing" : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <aside className="space-y-3">
          <section
            aria-labelledby="preview-summary-heading"
            className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4"
          >
            <h2 id="preview-summary-heading" className="text-lg font-extrabold">
              Listing summary
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#8B949E]">Price</dt>
                <dd className="text-right font-extrabold">{formatPrice(product.priceKobo, product.currency)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#8B949E]">Department</dt>
                <dd className="text-right font-bold">
                  {product.category.name}
                  <span className="mt-0.5 block text-[10px] font-normal text-[#8B949E]">
                    /{product.category.slug} · {product.category.isActive ? "active" : "inactive"}
                  </span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#8B949E]">Inventory</dt>
                <dd className="text-right font-bold">
                  {product.stock || activeVariants.length > 0
                    ? `${product.available} available of ${onHandStock} ${activeVariants.length > 0 ? "across variants" : "on hand"}`
                    : "No stock record"}
                  {product.stock && product.stock.reserved > 0 && activeVariants.length === 0 ? (
                    <span className="block text-[10px] font-normal text-[#8B949E]">
                      {product.stock.reserved} reserved by open orders
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#8B949E]">Seller</dt>
                <dd className="text-right font-bold">
                  {product.vendor.name}
                  <span className="block text-[10px] font-normal text-[#8B949E]">
                    {product.isDemo ? "Demonstration seller" : product.vendor.status} · {product.vendor.market}
                  </span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#8B949E]">Pickup / dispatch</dt>
                <dd className="max-w-[220px] text-right font-bold">
                  {product.vendor.pickupAddress}
                  <span className="block text-[10px] font-normal text-[#8B949E]">
                    {product.vendor.pickupPhone} · seller record ·{" "}
                    {product.vendor.commissionBps / 100}% commission
                  </span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#8B949E]">Fulfilment</dt>
                <dd className="text-right font-bold">
                  {product.countryCode} · {product.currency ?? "currency not configured"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#8B949E]">Variants</dt>
                <dd className="text-right font-bold">
                  {product.variants.length > 0 ? `${product.variants.length} read-only` : "None (single SKU)"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[#8B949E]">Updated</dt>
                <dd className="text-right font-bold">{product.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</dd>
              </div>
            </dl>
            {product.moderationNote ? (
              <p className="mt-3 rounded-lg border border-[#F2D48C]/30 bg-[#F2D48C]/10 p-2 text-xs text-[#F2D48C]">
                {product.moderationNote}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
              <a href="/admin/catalogue" className="rounded-lg border border-[#30363D] px-3 py-2 underline">
                Back to catalogue
              </a>
              {product.status === "ACTIVE" ? (
                <a
                  href={`/product/${product.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[#58A6FF]/50 px-3 py-2 text-[#58A6FF] underline"
                >
                  Open public page
                </a>
              ) : (
                <span className="rounded-lg border border-[#30363D] px-3 py-2 text-[#8B949E]">
                  Public page returns 404
                </span>
              )}
            </div>
          </section>

          <section
            aria-labelledby="preview-validation-heading"
            className={`rounded-2xl border p-4 ${
              product.validation.valid
                ? "border-[#00E676]/40 bg-[#00E676]/5"
                : "border-[#F85149]/50 bg-[#F85149]/5"
            }`}
          >
            <h2 id="preview-validation-heading" className="text-sm font-extrabold">
              {product.validation.valid ? "Publication checks pass" : "Publication checks blocked"}
            </h2>
            {product.validation.issues.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#FFB4AE]">
                {product.validation.issues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`}>
                    <span className="font-bold">{issue.field}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-[#B7FFD4]">
                Images, alt text, description, price, inventory, department and seller checks are satisfied.
              </p>
            )}
            <p className="mt-2 text-[10px] text-[#8B949E]">
              Validation is computed server-side for this preview. It does not publish the listing.
            </p>
          </section>
        </aside>
      </div>

      <section aria-labelledby="preview-description-heading" className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4">
        <h2 id="preview-description-heading" className="text-lg font-extrabold">
          Description
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#C9D1D9]">{product.description}</p>
      </section>

      <section
        aria-labelledby="preview-attributes-heading"
        data-testid="preview-attributes"
        className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4"
      >
        <h2 id="preview-attributes-heading" className="text-lg font-extrabold">
          Category attributes
        </h2>
        {product.category.attributes.length === 0 ? (
          <p className="mt-2 text-sm text-[#8B949E]">
            This category defines no attributes. That is an explicit taxonomy state, not an omitted section.
          </p>
        ) : (
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            {product.category.attributes.map((definition) => {
              const value = product.attributes?.[definition.key];
              const display =
                value === undefined || value === null || value === ""
                  ? "Not set"
                  : typeof value === "boolean"
                    ? value
                      ? "Yes"
                      : "No"
                    : String(value);
              return (
                <div key={definition.key} className="rounded-lg border border-[#21262D] p-2">
                  <dt className="text-[10px] font-extrabold uppercase tracking-wide text-[#8B949E]">
                    {definition.label}
                    {definition.required ? <span className="ml-1 text-[#FFB4AE]">required</span> : null}
                  </dt>
                  <dd className={display === "Not set" ? "text-[#8B949E]" : "font-bold"}>{display}</dd>
                  <dd className="text-[10px] text-[#8B949E]">
                    {definition.type} · {definition.key}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </section>

      {product.variants.length > 0 ? (
        <section aria-labelledby="preview-variants-heading" className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4">
          <h2 id="preview-variants-heading" className="text-lg font-extrabold">
            Variants (read-only)
          </h2>
          <p className="mt-1 text-xs text-[#8B949E]">
            The schema supports ProductVariant, but the catalogue editor has no create/edit contract for variants yet.
          </p>
          <ul className="mt-2 divide-y divide-[#21262D] text-sm">
            {product.variants.map((variant) => (
              <li key={variant.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-bold">{variant.name}</span>
                  <span className="ml-2 text-xs text-[#8B949E]">{variant.sku}</span>
                </span>
                <span className="text-xs text-[#8B949E]">
                  {formatPrice(variant.priceKobo, product.currency)} · stock {variant.stock} · reserved{" "}
                  {variant.reserved} · {variant.isActive ? "active" : "inactive"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="preview-record-heading" className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4">
        <h2 id="preview-record-heading" className="text-lg font-extrabold">
          Record
        </h2>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-[#8B949E]">Product id</dt>
            <dd className="break-all font-mono">{product.id}</dd>
          </div>
          <div>
            <dt className="text-[#8B949E]">Slug</dt>
            <dd className="break-all font-mono">{product.slug}</dd>
          </div>
          <div>
            <dt className="text-[#8B949E]">Status</dt>
            <dd className="font-bold">{product.status}</dd>
          </div>
          <div>
            <dt className="text-[#8B949E]">Created</dt>
            <dd>{product.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</dd>
          </div>
          <div>
            <dt className="text-[#8B949E]">Images</dt>
            <dd>{product.images.length}</dd>
          </div>
          <div>
            <dt className="text-[#8B949E]">Classification</dt>
            <dd>{product.isDemo ? "DEMO — demonstration inventory" : "Standard listing"}</dd>
          </div>
        </dl>
        <p className="mt-3 rounded-lg border border-[#21262D] bg-[#0D1117] p-2 text-[10px] text-[#8B949E]">
          This page is restricted to authorized Control Center staff, is excluded from search indexing and is served
          without shared caching. It does not make the draft public.
        </p>
      </section>
    </div>
  );
}
