import { listGigProfessionals } from "@/lib/services/gigs/service";
import { listGigCategories } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export default async function ProfessionalsPage() {
  const [categories, professionalsResult] = await Promise.all([
    listGigCategories(),
    listGigProfessionals({
      q: undefined,
      category: undefined,
      countryCode: undefined,
      city: undefined,
      page: 1,
      pageSize: 20,
    }),
  ]);

  const professionals = professionalsResult.items || [];

  return (
    <>
      <div className="mx-auto max-w-[1440px] px-4 py-11 sm:px-6 lg:px-10">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <h1 className="font-display text-[25px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[30px]">
            NaijaGigs Professionals
          </h1>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search professionals or skills..."
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
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {professionals.map((profile) => {
            const avatar = profile.avatarUrl || null;
            const initials = (profile.displayName || profile.user?.name || "?").trim().charAt(0).toUpperCase();
            return (
              <div
                key={profile.id}
                className="group rounded-xl bg-[#EDE6D8] overflow-hidden hover:shadow-lg transition-shadow"
              >
                {avatar ? (
                  <img
                    src={avatar}
                    alt={profile.displayName}
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={profile.displayName}
                    className="flex h-48 w-full items-center justify-center bg-[#DDECE3] font-display text-4xl font-extrabold text-[#0F7A4A]"
                  >
                    {initials}
                  </div>
                )}

                <div className="p-4">
                  <h3 className="font-semibold text-[#0B1F16] line-clamp-2">
                    {profile.displayName}
                  </h3>
                  <p className="text-[11px] text-[#6B7A72] line-clamp-2">
                    {profile.headline || "Professional service provider"}
                  </p>

                  <div className="flex gap-2 text-[10px] text-[#6B7A72] mt-3">
                    <span>{profile.countryCode || "NG"}</span>
                    <span>{profile.state || "—"}</span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#E5DFD2]">
                    <a
                      href={`/naijagigs/pro/${profile.id}`}
                      className="text-[11px] font-medium text-[#0F7A4A] hover:text-[#0B6540] transition-colors"
                    >
                      View profile
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {professionals.length === 0 && (
          <p className="mt-8 text-center text-[12px] text-[#6B7A72]">
            No professionals found. Try adjusting your search or browse categories.
          </p>
        )}
      </div>
    </>
  );
}