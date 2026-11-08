import { searchGigServices, listGigCategories } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [categories, servicesResult] = await Promise.all([
    listGigCategories(),
    searchGigServices({
      q: undefined,
      category: undefined,
      mode: undefined,
      countryCode: undefined,
      city: undefined,
      sort: "recent" as const,
      page: 1,
      pageSize: 20,
    }),
  ]);

  const services = servicesResult.items || [];

  return (
    <>
      <div className="mx-auto max-w-[1440px] px-4 py-11 sm:px-6 lg:px-10">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <h1 className="font-display text-[25px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[30px]">
            NaijaGigs Services
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search services, professionals, or categories..."
              className="flex-1 bg-transparent border-b-2 border-[#E5DFD2] rounded-py-1 text-[13px] text-[#16241D] outline-none placeholder:text-[#8A978F]"
            />
            <select
              className="pr-8 bg-transparent text-[12px] font-semibold text-[#2C3B33] outline-none"
            >
              <option value="all">All categories</option>
              {categories.map((cat) => {
                return (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.name}
                  </option>
                );
              })}
            </select>
            <button
              className="px-4 py-2 rounded-xl bg-[#0F7A4A] text-[12px] font-bold text-white transition hover:bg-[#0B6540]"
            >
              Apply filters
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {services.map((listing) => {
            return (
              <div
                key={listing.id}
                className="group rounded-xl bg-[#EDE6D8] overflow-hidden hover:shadow-lg transition-shadow"
              >
                {listing.images?.[0]?.url ? (
                  <img
                    src={listing.images[0].url}
                    alt={listing.title}
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div
                    className="h-48 w-full bg-[#E7E0D2] flex items-center justify-center text-[11px] text-[#6B7A72]"
                  >
                    No image
                  </div>
                )}

                <div className="p-4">
                  <h3 className="font-semibold text-[#0B1F16] line-clamp-2">
                    {listing.title}
                  </h3>
                  <p className="text-[11px] text-[#6B7A72] line-clamp-2">
                    {listing.summary || "No description available"}
                  </p>

                  <div className="flex gap-2 text-[10px] text-[#6B7A72] mt-3">
                    <span>
                      {listing.mode === "LOCAL"
                        ? "Local"
                        : listing.mode === "REMOTE"
                        ? "Remote"
                        : "Project"}
                    </span>
                    <span>{listing.isRemote ? "Remote" : "In-person"}</span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#E5DFD2]">
                    <a
                      href={`/naijagigs/professionals/${listing.professional.id}`}
                      className="text-[11px] font-medium text-[#0F7A4A] hover:text-[#0B6540] transition-colors"
                    >
                      Contact professional
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {services.length === 0 && (
          <p className="mt-8 text-center text-[12px] text-[#6B7A72]">
            No services found. Try adjusting your search or browse categories.
          </p>
        )}
      </div>
    </>
  );
}