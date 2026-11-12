"use client";

export default function CataloguePreviewError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-[#F85149]/50 bg-[#F85149]/10 p-6 text-[#FFB4AE]">
      <h1 className="text-xl font-extrabold">Preview could not be loaded</h1>
      <p className="mt-2 text-sm">
        The catalogue record was not returned. No draft content is shown until the preview loads successfully.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg border border-[#F85149]/50 px-4 py-2 underline"
        >
          Retry preview
        </button>
        <a href="/admin/catalogue" className="rounded-lg border border-[#30363D] px-4 py-2 text-[#F0F6FC] underline">
          Back to catalogue
        </a>
      </div>
    </div>
  );
}
