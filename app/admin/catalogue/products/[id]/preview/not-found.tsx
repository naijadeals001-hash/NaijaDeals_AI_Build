export default function CataloguePreviewNotFound() {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-[#21262D] bg-[#0B0E14] p-6 text-[#F0F6FC]">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#00E676]">Control Center</p>
      <h1 className="mt-1 text-xl font-extrabold">Preview unavailable</h1>
      <p className="mt-2 text-sm text-[#8B949E]">
        This catalogue record does not exist or is outside your administrative scope. No draft content was returned.
      </p>
      <a href="/admin/catalogue" className="mt-4 inline-block rounded-lg border border-[#30363D] px-4 py-2 text-sm font-bold underline">
        Back to catalogue
      </a>
    </div>
  );
}
