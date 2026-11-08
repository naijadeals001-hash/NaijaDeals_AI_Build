import { randomBytes } from "node:crypto";
import { Prisma, type ServiceBookingStatus, type ServiceMode, type ServicePricingType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import { assertRegion } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";
import { postBalancedTransaction } from "@/lib/services/core/wallet.service";
import { ensureWallet } from "@/lib/payments/service";

type Db = Prisma.TransactionClient;

const professionalPublic = { status: "VERIFIED" as const, published: true };

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function uniqueListingSlug(title: string) {
  const base = slugify(title) || "service";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const exists = await prisma.serviceListing.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function bookingReference() {
  return `NG-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function commissionFor(amountKobo: bigint, bps: number) {
  return (amountKobo * BigInt(bps)) / BigInt(10000);
}

function ratingOf(reviews: Array<{ rating: number }>) {
  if (reviews.length === 0) return { average: null as number | null, count: 0 };
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length };
}

// ---------------------------------------------------------------------------
// Public discovery
// ---------------------------------------------------------------------------

export async function listGigCategories() {
  return prisma.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}

export async function listGigSpotlights() {
  return prisma.serviceSpotlight.findMany({
    where: { isActive: true, category: { isActive: true } },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: { sortOrder: "asc" },
    take: 8
  });
}

export async function getGigSiteConfig() {
  return prisma.gigSiteConfig.findUnique({ where: { id: "default" } });
}

export type ServiceSearchInput = {
  q?: string;
  category?: string;
  mode?: ServiceMode;
  countryCode?: string;
  city?: string;
  minKobo?: bigint;
  maxKobo?: bigint;
  sort?: "recent" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
};

export async function searchGigServices(input: ServiceSearchInput) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, input.pageSize ?? 12));
  const where: Prisma.ServiceListingWhereInput = {
    status: "ACTIVE",
    professional: professionalPublic,
    category: { isActive: true }
  };

  if (input.q) {
    where.OR = [
      { title: { contains: input.q, mode: "insensitive" } },
      { summary: { contains: input.q, mode: "insensitive" } },
      { description: { contains: input.q, mode: "insensitive" } },
      { category: { name: { contains: input.q, mode: "insensitive" } } },
      { professional: { displayName: { contains: input.q, mode: "insensitive" } } }
    ];
  }
  if (input.category) where.category = { slug: input.category, isActive: true };
  if (input.mode) where.mode = input.mode;
  if (input.countryCode) where.countryCode = input.countryCode;
  if (input.city) where.city = { equals: input.city, mode: "insensitive" };
  if (input.minKobo !== undefined || input.maxKobo !== undefined) {
    where.priceKobo = {
      ...(input.minKobo !== undefined ? { gte: input.minKobo } : {}),
      ...(input.maxKobo !== undefined ? { lte: input.maxKobo } : {})
    };
  }

  const orderBy: Prisma.ServiceListingOrderByWithRelationInput[] =
    input.sort === "price_asc"
      ? [{ priceKobo: "asc" }, { createdAt: "desc" }]
      : input.sort === "price_desc"
        ? [{ priceKobo: "desc" }, { createdAt: "desc" }]
        : [{ isFeatured: "desc" }, { createdAt: "desc" }];

  const [items, total] = await Promise.all([
    prisma.serviceListing.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { name: true, slug: true, accent: true, icon: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        packages: { where: { isActive: true }, orderBy: { priceKobo: "asc" }, take: 1 },
        professional: {
          select: {
            id: true,
            displayName: true,
            city: true,
            state: true,
            countryCode: true,
            avatarUrl: true,
            responseMinutes: true
          }
        }
      }
    }),
    prisma.serviceListing.count({ where })
  ]);

  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getGigServiceBySlug(slug: string) {
  const listing = await prisma.serviceListing.findFirst({
    where: { slug, status: "ACTIVE", professional: professionalPublic },
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
      packages: { where: { isActive: true }, orderBy: { priceKobo: "asc" } },
      professional: {
        include: {
          categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
          serviceAreas: true,
          availability: { orderBy: { weekday: "asc" } },
          portfolio: { orderBy: { createdAt: "desc" }, take: 6 },
          user: { select: { id: true, name: true, createdAt: true } }
        }
      }
    }
  });
  if (!listing) return null;

  const reviews = await prisma.serviceReview.findMany({
    where: { professionalId: listing.professional.userId, status: "PUBLISHED" },
    include: { customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  const completed = await prisma.serviceBooking.count({
    where: { professionalProfileId: listing.professionalId, status: "COMPLETED" }
  });

  return { listing, reviews, rating: ratingOf(reviews), completedBookings: completed };
}

export async function listGigProfessionals(input: { q?: string; category?: string; countryCode?: string; city?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, input.pageSize ?? 12));
  const where: Prisma.ProfessionalProfileWhereInput = { ...professionalPublic };
  if (input.countryCode) where.countryCode = input.countryCode;
  if (input.city) where.city = { equals: input.city, mode: "insensitive" };
  if (input.category) where.categories = { some: { category: { slug: input.category } } };
  if (input.q) {
    where.OR = [
      { displayName: { contains: input.q, mode: "insensitive" } },
      { headline: { contains: input.q, mode: "insensitive" } },
      { bio: { contains: input.q, mode: "insensitive" } }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.professionalProfile.findMany({
      where,
      orderBy: [{ verifiedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        categories: { include: { category: { select: { name: true, slug: true } } } },
        listings: { where: { status: "ACTIVE" }, select: { id: true, title: true, slug: true, priceKobo: true, pricingType: true } },
        user: {
          select: {
            name: true,
            gigReviewsReceived: { where: { status: "PUBLISHED" }, select: { rating: true } }
          }
        }
      }
    }),
    prisma.professionalProfile.count({ where })
  ]);

  return {
    items: items.map((profile) => ({ ...profile, rating: ratingOf(profile.user.gigReviewsReceived) })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function getGigProfessional(id: string) {
  const profile = await prisma.professionalProfile.findFirst({
    where: { id, ...professionalPublic },
    include: {
      categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
      listings: { where: { status: "ACTIVE" }, include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, packages: true, category: true }, orderBy: { createdAt: "desc" } },
      portfolio: { orderBy: { createdAt: "desc" } },
      serviceAreas: true,
      availability: { orderBy: { weekday: "asc" } },
      user: { select: { id: true, name: true, createdAt: true } }
    }
  });
  if (!profile) return null;

  const reviews = await prisma.serviceReview.findMany({
    where: { professionalId: profile.userId, status: "PUBLISHED" },
    include: { customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const completed = await prisma.serviceBooking.count({
    where: { professionalProfileId: profile.id, status: "COMPLETED" }
  });

  return { profile, reviews, rating: ratingOf(reviews), completedBookings: completed };
}

export async function listOpenGigJobs(input: { q?: string; category?: string; mode?: ServiceMode; countryCode?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, input.pageSize ?? 12));
  const where: Prisma.CustomerJobWhereInput = { status: "OPEN" };
  if (input.mode) where.mode = input.mode;
  if (input.countryCode) where.countryCode = input.countryCode;
  if (input.category) where.category = { slug: input.category };
  if (input.q) {
    where.OR = [
      { title: { contains: input.q, mode: "insensitive" } },
      { description: { contains: input.q, mode: "insensitive" } }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.customerJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { name: true, slug: true } },
        customer: { select: { name: true, createdAt: true } },
        _count: { select: { proposals: true } }
      }
    }),
    prisma.customerJob.count({ where })
  ]);

  return {
    items: items.map((job) => ({
      ...job,
      customer: { name: job.customer.name.split(" ")[0] + " " + (job.customer.name.split(" ")[1]?.[0] ?? "") + ".", createdAt: job.customer.createdAt }
    })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function getGigJob(id: string, user: SessionUser | null) {
  const job = await prisma.customerJob.findUnique({
    where: { id },
    include: {
      category: { select: { name: true, slug: true } },
      customer: { select: { id: true, name: true, createdAt: true } },
      proposals: {
        include: {
          professional: {
            select: {
              id: true,
              displayName: true,
              headline: true,
              city: true,
              state: true,
              countryCode: true,
              avatarUrl: true,
              status: true,
              published: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });
  if (!job) return null;

  const isOwner = user?.id === job.customerId;
  const isAdmin = user?.actorType === "ADMIN";
  if (job.status !== "OPEN" && !isOwner && !isAdmin) return null;

  return {
    ...job,
    customer: { name: job.customer.name.split(" ")[0] + " " + (job.customer.name.split(" ")[1]?.[0] ?? "") + ".", createdAt: job.customer.createdAt },
    proposals: isOwner || isAdmin ? job.proposals : job.proposals.map((proposal) => ({ ...proposal, amountKobo: null, message: "" }))
  };
}

// ---------------------------------------------------------------------------
// Professional onboarding & profile management
// ---------------------------------------------------------------------------

export async function getProfessionalForUser(userId: string) {
  return prisma.professionalProfile.findUnique({
    where: { userId },
    include: {
      categories: { include: { category: true } },
      listings: { orderBy: { createdAt: "desc" }, include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, category: { select: { name: true } } } },
      serviceAreas: true,
      availability: { orderBy: { weekday: "asc" } }
    }
  });
}

export async function assertVerifiedProfessional(userId: string) {
  const profile = await prisma.professionalProfile.findUnique({ where: { userId } });
  if (!profile) throw new ApiError(403, "professional_required", "Create a professional profile before offering services.");
  if (profile.status !== "VERIFIED") {
    throw new ApiError(403, "professional_not_verified", "Your professional profile is still awaiting verification.");
  }
  return profile;
}

export async function applyAsProfessional(userId: string, input: {
  displayName: string;
  headline: string;
  bio: string;
  countryCode: string;
  state: string;
  city: string;
  serviceModes: ServiceMode[];
  categoryIds: string[];
  languages?: string[];
  yearsExperience?: number | null;
  avatarUrl?: string | null;
}) {
  const existing = await prisma.professionalProfile.findUnique({ where: { userId } });
  if (existing) throw new ApiError(409, "professional_exists", "You already have a professional profile.");

  const categories = await prisma.serviceCategory.findMany({
    where: { id: { in: input.categoryIds }, isActive: true },
    select: { id: true }
  });
  if (categories.length !== input.categoryIds.length || categories.length === 0) {
    throw new ApiError(400, "invalid_category", "Choose at least one active service category.");
  }

  const profile = await prisma.professionalProfile.create({
    data: {
      userId,
      displayName: input.displayName,
      headline: input.headline,
      bio: input.bio,
      countryCode: input.countryCode,
      state: input.state,
      city: input.city,
      serviceModes: input.serviceModes,
      languages: input.languages ?? [],
      yearsExperience: input.yearsExperience ?? null,
      avatarUrl: input.avatarUrl ?? null,
      status: "PENDING",
      published: false,
      categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      serviceAreas: { create: [{ countryCode: input.countryCode, state: input.state, city: input.city }] }
    },
    include: { categories: true }
  });

  await recordAudit({
    actorId: userId,
    action: "gig.professional_applied",
    entity: "ProfessionalProfile",
    entityId: profile.id,
    metadata: { displayName: profile.displayName, countryCode: profile.countryCode, city: profile.city }
  });
  return profile;
}

export async function updateProfessionalProfile(userId: string, input: {
  displayName?: string;
  headline?: string;
  bio?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  serviceModes?: ServiceMode[];
  languages?: string[];
  yearsExperience?: number | null;
  responseMinutes?: number | null;
  avatarUrl?: string | null;
  published?: boolean;
  categoryIds?: string[];
}) {
  const profile = await prisma.professionalProfile.findUnique({ where: { userId } });
  if (!profile) throw new ApiError(404, "professional_not_found", "Professional profile not found.");

  if (input.published && profile.status !== "VERIFIED") {
    throw new ApiError(403, "not_verified", "Only verified professionals can publish their profile.");
  }

  const { categoryIds, published, ...fields } = input;
  const updated = await prisma.$transaction(async (tx) => {
    if (categoryIds) {
      const categories = await tx.serviceCategory.findMany({
        where: { id: { in: categoryIds }, isActive: true },
        select: { id: true }
      });
      if (categories.length !== categoryIds.length || categories.length === 0) {
        throw new ApiError(400, "invalid_category", "Choose at least one active service category.");
      }
      await tx.professionalCategory.deleteMany({ where: { professionalId: profile.id } });
      await tx.professionalCategory.createMany({
        data: categoryIds.map((categoryId) => ({ professionalId: profile.id, categoryId }))
      });
    }
    return tx.professionalProfile.update({
      where: { id: profile.id },
      data: {
        ...fields,
        ...(published === undefined ? {} : { published: profile.status === "VERIFIED" ? published : false })
      },
      include: { categories: { include: { category: true } } }
    });
  });

  await recordAudit({
    actorId: userId,
    action: "gig.professional_profile_updated",
    entity: "ProfessionalProfile",
    entityId: profile.id,
    metadata: { fields: Object.keys(input) }
  });
  return updated;
}

export async function upsertAvailability(userId: string, slots: Array<{ weekday: number; startMinute: number; endMinute: number }>) {
  const profile = await assertVerifiedProfessional(userId);
  for (const slot of slots) {
    if (slot.weekday < 0 || slot.weekday > 6) throw new ApiError(400, "invalid_weekday", "Weekday must be between 0 and 6.");
    if (slot.startMinute < 0 || slot.endMinute > 1440 || slot.startMinute >= slot.endMinute) {
      throw new ApiError(400, "invalid_availability", "Availability windows must end after they start.");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.availabilitySlot.deleteMany({ where: { professionalId: profile.id } });
    if (slots.length > 0) {
      await tx.availabilitySlot.createMany({
        data: slots.map((slot) => ({ professionalId: profile.id, ...slot }))
      });
    }
  });
  return prisma.availabilitySlot.findMany({ where: { professionalId: profile.id }, orderBy: { weekday: "asc" } });
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export async function createServiceListing(userId: string, input: {
  categoryId: string;
  title: string;
  summary: string;
  description: string;
  mode: ServiceMode;
  pricingType: ServicePricingType;
  priceKobo?: bigint | null;
  countryCode: string;
  state?: string | null;
  city?: string | null;
  imageUrl?: string | null;
}) {
  const profile = await assertVerifiedProfessional(userId);
  const category = await prisma.serviceCategory.findFirst({ where: { id: input.categoryId, isActive: true } });
  if (!category) throw new ApiError(400, "invalid_category", "Choose an active service category.");
  if (input.pricingType === "QUOTE" && input.priceKobo) {
    throw new ApiError(400, "invalid_price", "Quote-based services do not set a fixed price.");
  }
  if (input.pricingType !== "QUOTE" && (!input.priceKobo || input.priceKobo <= BigInt(0))) {
    throw new ApiError(400, "invalid_price", "Set a price for fixed or hourly services.");
  }

  const slug = await uniqueListingSlug(input.title);
  const listing = await prisma.serviceListing.create({
    data: {
      professionalId: profile.id,
      categoryId: input.categoryId,
      title: input.title,
      slug,
      summary: input.summary,
      description: input.description,
      mode: input.mode,
      pricingType: input.pricingType,
      priceKobo: input.priceKobo ?? null,
      countryCode: input.countryCode,
      state: input.state ?? profile.state,
      city: input.city ?? profile.city,
      isRemote: input.mode === "REMOTE",
      status: "ACTIVE",
      images: input.imageUrl ? { create: [{ url: input.imageUrl, alt: input.title, sortOrder: 0 }] } : undefined
    },
    include: { images: true, category: true }
  });

  await recordAudit({
    actorId: userId,
    action: "gig.listing_created",
    entity: "ServiceListing",
    entityId: listing.id,
    metadata: { title: listing.title, category: listing.category.name, mode: listing.mode }
  });
  return listing;
}

export async function updateServiceListing(userId: string, listingIdOrSlug: string, input: {
  title?: string;
  summary?: string;
  description?: string;
  mode?: ServiceMode;
  pricingType?: ServicePricingType;
  priceKobo?: bigint | null;
  status?: "DRAFT" | "ACTIVE" | "PAUSED";
  imageUrl?: string | null;
}) {
  const profile = await assertVerifiedProfessional(userId);
  const listing = await prisma.serviceListing.findFirst({
    where: { professionalId: profile.id, OR: [{ id: listingIdOrSlug }, { slug: listingIdOrSlug }] }
  });
  if (!listing) throw new ApiError(404, "listing_not_found", "Listing not found.");
  if (listing.status === "SUSPENDED" && input.status && input.status !== "PAUSED") {
    throw new ApiError(403, "listing_suspended", "This listing is suspended and can only be edited after review.");
  }
  if (input.pricingType === "QUOTE" && input.priceKobo) {
    throw new ApiError(400, "invalid_price", "Quote-based services do not set a fixed price.");
  }

  const updated = await prisma.serviceListing.update({
    where: { id: listing.id },
    data: {
      title: input.title,
      summary: input.summary,
      description: input.description,
      mode: input.mode,
      pricingType: input.pricingType,
      priceKobo: input.pricingType === "QUOTE" ? null : input.priceKobo,
      status: listing.status === "SUSPENDED" ? undefined : input.status,
      isRemote: input.mode === undefined ? undefined : input.mode === "REMOTE",
      ...(input.imageUrl
        ? { images: { deleteMany: {}, create: [{ url: input.imageUrl, alt: input.title ?? listing.title, sortOrder: 0 }] } }
        : {})
    },
    include: { images: true, category: true }
  });

  await recordAudit({
    actorId: userId,
    action: "gig.listing_updated",
    entity: "ServiceListing",
    entityId: listing.id,
    metadata: { fields: Object.keys(input) }
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Jobs & proposals
// ---------------------------------------------------------------------------

export async function createCustomerJob(userId: string, input: {
  categoryId?: string | null;
  title: string;
  description: string;
  mode: ServiceMode;
  budgetKobo?: bigint | null;
  countryCode: string;
  state: string;
  city?: string | null;
  deadline?: Date | null;
}) {
  if (input.categoryId) {
    const category = await prisma.serviceCategory.findFirst({ where: { id: input.categoryId, isActive: true } });
    if (!category) throw new ApiError(400, "invalid_category", "Choose an active service category.");
  }
  const job = await prisma.customerJob.create({
    data: {
      customerId: userId,
      categoryId: input.categoryId ?? null,
      title: input.title,
      description: input.description,
      mode: input.mode,
      budgetKobo: input.budgetKobo ?? null,
      countryCode: input.countryCode,
      state: input.state,
      city: input.city ?? null,
      deadline: input.deadline ?? null,
      status: "OPEN"
    },
    include: { category: { select: { name: true } } }
  });
  await recordAudit({
    actorId: userId,
    action: "gig.job_posted",
    entity: "CustomerJob",
    entityId: job.id,
    metadata: { title: job.title, mode: job.mode, countryCode: job.countryCode }
  });
  return job;
}

export async function submitProposal(userId: string, jobId: string, input: { amountKobo: bigint; message: string; deliveryDays: number }) {
  const profile = await assertVerifiedProfessional(userId);
  const job = await prisma.customerJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ApiError(404, "job_not_found", "Job not found.");
  if (job.status !== "OPEN") throw new ApiError(409, "job_closed", "This job is no longer accepting proposals.");
  if (job.customerId === userId) throw new ApiError(400, "own_job", "You cannot propose on your own job.");
  if (input.amountKobo <= BigInt(0)) throw new ApiError(400, "invalid_amount", "Enter a valid proposal amount.");
  if (input.deliveryDays < 1 || input.deliveryDays > 365) throw new ApiError(400, "invalid_delivery", "Delivery must be between 1 and 365 days.");

  const existing = await prisma.jobProposal.findUnique({ where: { jobId_professionalId: { jobId, professionalId: profile.id } } });
  if (existing) throw new ApiError(409, "proposal_exists", "You already sent a proposal for this job.");

  const proposal = await prisma.jobProposal.create({
    data: {
      jobId,
      professionalId: profile.id,
      amountKobo: input.amountKobo,
      message: input.message,
      deliveryDays: input.deliveryDays,
      status: "SUBMITTED"
    }
  });
  await recordAudit({
    actorId: userId,
    action: "gig.proposal_submitted",
    entity: "JobProposal",
    entityId: proposal.id,
    metadata: { jobId, amountKobo: input.amountKobo.toString(), deliveryDays: input.deliveryDays }
  });
  return proposal;
}

export async function acceptProposal(userId: string, proposalId: string) {
  const proposal = await prisma.jobProposal.findUnique({
    where: { id: proposalId },
    include: {
      job: true,
      professional: { include: { user: { select: { id: true } } } }
    }
  });
  if (!proposal) throw new ApiError(404, "proposal_not_found", "Proposal not found.");
  if (proposal.job.customerId !== userId) throw new ApiError(403, "forbidden", "Only the job owner can accept a proposal.");
  if (proposal.job.status !== "OPEN" || proposal.status !== "SUBMITTED") {
    throw new ApiError(409, "proposal_closed", "This job or proposal is no longer open.");
  }

  const booking = await prisma.$transaction(async (tx) => {
    await tx.jobProposal.updateMany({ where: { jobId: proposal.jobId, id: { not: proposal.id } }, data: { status: "REJECTED" } });
    await tx.jobProposal.update({ where: { id: proposal.id }, data: { status: "ACCEPTED" } });
    await tx.customerJob.update({ where: { id: proposal.jobId }, data: { status: "ASSIGNED" } });

    const created = await tx.serviceBooking.create({
      data: {
        reference: bookingReference(),
        customerId: proposal.job.customerId,
        professionalId: proposal.professional.user.id,
        professionalProfileId: proposal.professionalId,
        jobId: proposal.jobId,
        categoryId: proposal.job.categoryId,
        mode: proposal.job.mode,
        title: proposal.job.title,
        description: proposal.job.description,
        status: "REQUESTED",
        countryCode: proposal.job.countryCode,
        state: proposal.job.state,
        city: proposal.job.city,
        amountKobo: proposal.amountKobo,
        commissionBps: proposal.professional.commissionBps
      }
    });
    await tx.conversation.create({
      data: {
        bookingId: created.id,
        jobId: proposal.jobId,
        customerId: proposal.job.customerId,
        professionalId: proposal.professional.user.id
      }
    });
    return created;
  });

  await recordAudit({
    actorId: userId,
    action: "gig.proposal_accepted",
    entity: "JobProposal",
    entityId: proposal.id,
    metadata: { jobId: proposal.jobId, bookingId: booking.id, amountKobo: proposal.amountKobo.toString() }
  });
  return booking;
}

// ---------------------------------------------------------------------------
// Bookings, wallet escrow and reviews
// ---------------------------------------------------------------------------

export async function requestBooking(userId: string, input: {
  listingId?: string;
  professionalProfileId?: string;
  title?: string;
  description?: string;
  mode?: ServiceMode;
  scheduledAt?: Date | null;
  address?: string | null;
  amountKobo?: bigint;
}) {
  let profileId = input.professionalProfileId ?? "";
  let listing: { id: string; title: string; summary: string; mode: ServiceMode; priceKobo: bigint | null; pricingType: ServicePricingType; professionalId: string; categoryId: string; countryCode: string; state: string | null; city: string | null } | null = null;

  if (input.listingId) {
    listing = await prisma.serviceListing.findFirst({
      where: { id: input.listingId, status: "ACTIVE", professional: professionalPublic },
      select: {
        id: true,
        title: true,
        summary: true,
        mode: true,
        priceKobo: true,
        pricingType: true,
        professionalId: true,
        categoryId: true,
        countryCode: true,
        state: true,
        city: true
      }
    });
    if (!listing) throw new ApiError(404, "listing_not_found", "This service is not available.");
    profileId = listing.professionalId;
  }

  const profile = await prisma.professionalProfile.findFirst({
    where: { id: profileId, ...professionalPublic }
  });
  if (!profile) throw new ApiError(404, "professional_not_found", "This professional is not available.");
  if (profile.userId === userId) throw new ApiError(400, "self_booking", "You cannot book your own service.");

  const amount =
    input.amountKobo ??
    (listing?.pricingType === "FIXED" ? listing.priceKobo : null) ??
    (listing?.pricingType === "HOURLY" ? listing.priceKobo : null);
  if (!amount || amount <= BigInt(0)) throw new ApiError(400, "amount_required", "Agree a price before requesting this booking.");

  const title = input.title ?? listing?.title;
  if (!title) throw new ApiError(400, "title_required", "Describe the work you need.");

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.serviceBooking.create({
      data: {
        reference: bookingReference(),
        customerId: userId,
        professionalId: profile.userId,
        professionalProfileId: profile.id,
        listingId: listing?.id ?? null,
        categoryId: listing?.categoryId ?? null,
        mode: input.mode ?? listing?.mode ?? profile.serviceModes[0] ?? "LOCAL",
        title,
        description: input.description ?? listing?.summary ?? null,
        scheduledAt: input.scheduledAt ?? null,
        address: input.address ?? null,
        countryCode: listing?.countryCode ?? profile.countryCode,
        state: listing?.state ?? profile.state,
        city: listing?.city ?? profile.city,
        amountKobo: amount,
        commissionBps: profile.commissionBps,
        status: "REQUESTED"
      }
    });
    await tx.conversation.create({
      data: {
        bookingId: created.id,
        customerId: userId,
        professionalId: profile.userId
      }
    });
    return created;
  });

  await recordAudit({
    actorId: userId,
    action: "gig.booking_requested",
    entity: "ServiceBooking",
    entityId: booking.id,
    metadata: { reference: booking.reference, amountKobo: booking.amountKobo.toString(), professionalProfileId: profile.id }
  });
  return booking;
}

export async function listBookingsForUser(userId: string) {
  return prisma.serviceBooking.findMany({
    where: { OR: [{ customerId: userId }, { professionalId: userId }] },
    include: {
      professionalProfile: { select: { id: true, displayName: true, avatarUrl: true, city: true, state: true } },
      customer: { select: { id: true, name: true } },
      listing: { select: { slug: true, title: true } },
      category: { select: { name: true } },
      review: { select: { id: true, status: true, rating: true } },
      disputes: { where: { status: { in: ["OPEN", "UNDER_REVIEW"] } }, select: { id: true, status: true } }
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function getBookingForUser(userId: string, bookingId: string) {
  const booking = await prisma.serviceBooking.findUnique({
    where: { id: bookingId },
    include: {
      professionalProfile: { select: { id: true, displayName: true, headline: true, avatarUrl: true, city: true, state: true, countryCode: true } },
      customer: { select: { id: true, name: true } },
      listing: { select: { slug: true, title: true } },
      category: { select: { name: true } },
      milestones: { orderBy: { createdAt: "asc" } },
      conversation: { select: { id: true } },
      review: true,
      disputes: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!booking) return null;
  if (booking.customerId !== userId && booking.professionalId !== userId) return null;
  return booking;
}

async function lockedWallet(tx: Db, userId: string) {
  const wallet = await ensureWallet(tx, { userId, ownerType: "CUSTOMER" });
  const rows = await tx.$queryRaw<Array<{ availableKobo: bigint; heldKobo: bigint }>>`
    SELECT "availableKobo", "heldKobo" FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
  return { wallet, ...(rows[0] ?? { availableKobo: BigInt(0), heldKobo: BigInt(0) }) };
}

export async function fundBooking(userId: string, bookingId: string) {
  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ApiError(404, "booking_not_found", "Booking not found.");
  if (booking.customerId !== userId) throw new ApiError(403, "forbidden", "Only the customer can fund this booking.");
  if (booking.status !== "ACCEPTED") throw new ApiError(409, "not_accepted", "The professional must accept the booking before payment.");
  if (booking.paymentStatus !== "UNPAID") throw new ApiError(409, "already_funded", "This booking is already funded.");

  const amount = booking.amountKobo;
  await prisma.$transaction(async (tx) => {
    const customer = await lockedWallet(tx, userId);
    if (customer.availableKobo < amount) {
      throw new ApiError(402, "insufficient_wallet", "Top up your NaijaPay wallet to fund this booking.");
    }
    const professional = await ensureWallet(tx, { userId: booking.professionalId, ownerType: "CUSTOMER" });

    await tx.wallet.update({ where: { id: customer.wallet.id }, data: { availableKobo: { decrement: amount } } });
    await tx.wallet.update({ where: { id: professional.id }, data: { heldKobo: { increment: amount } } });
    await tx.serviceBooking.update({ where: { id: booking.id }, data: { paymentStatus: "HELD" } });

    await postBalancedTransaction({
      tx,
      actorId: userId,
      walletId: customer.wallet.id,
      type: "hold",
      amountKobo: amount,
      reference: `gig:${booking.reference}:fund`,
      description: `NaijaGigs booking ${booking.reference} funded into escrow`,
      entries: [
        { walletId: customer.wallet.id, direction: "DEBIT", amountKobo: amount, memo: "Customer wallet moved to gig escrow" },
        { walletId: professional.id, direction: "CREDIT", amountKobo: amount, memo: "Professional payable held in gig escrow" }
      ]
    });
  });

  await recordAudit({
    actorId: userId,
    action: "gig.booking_funded",
    entity: "ServiceBooking",
    entityId: booking.id,
    metadata: { reference: booking.reference, amountKobo: amount.toString() }
  });
  return prisma.serviceBooking.findUniqueOrThrow({ where: { id: booking.id } });
}

async function releaseBookingFunds(tx: Db, booking: { id: string; reference: string; professionalId: string; amountKobo: bigint; commissionBps: number }, actorId: string) {
  const gross = booking.amountKobo;
  const commission = commissionFor(gross, booking.commissionBps);
  const net = gross - commission;
  const professional = await ensureWallet(tx, { userId: booking.professionalId, ownerType: "CUSTOMER" });
  const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
  const locked = await tx.$queryRaw<Array<{ heldKobo: bigint }>>`
    SELECT "heldKobo" FROM "Wallet" WHERE id = ${professional.id} FOR UPDATE`;
  if ((locked[0]?.heldKobo ?? BigInt(0)) < gross) {
    throw new ApiError(409, "escrow_conflict", "The booking escrow balance is no longer available.");
  }
  await tx.wallet.update({ where: { id: professional.id }, data: { heldKobo: { decrement: gross }, availableKobo: { increment: net } } });
  if (commission > BigInt(0)) {
    await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: commission } } });
  }
  await tx.serviceBooking.update({ where: { id: booking.id }, data: { paymentStatus: "RELEASED" } });

  await postBalancedTransaction({
    tx,
    actorId,
    walletId: professional.id,
    type: "release",
    amountKobo: gross,
    reference: `gig:${booking.reference}:release`,
    description: `NaijaGigs booking ${booking.reference} completed`,
    entries: [
      { walletId: professional.id, direction: "DEBIT", amountKobo: gross, memo: "Gig escrow released" },
      { walletId: professional.id, direction: "CREDIT", amountKobo: net, memo: "Professional earnings" },
      ...(commission > BigInt(0)
        ? [{ walletId: platform.id, direction: "CREDIT" as const, amountKobo: commission, memo: "NaijaGigs commission" }]
        : [])
    ]
  });
}

async function refundBookingFunds(tx: Db, booking: { id: string; reference: string; customerId: string; professionalId: string; amountKobo: bigint }, actorId: string) {
  const amount = booking.amountKobo;
  const customer = await ensureWallet(tx, { userId: booking.customerId, ownerType: "CUSTOMER" });
  const professional = await ensureWallet(tx, { userId: booking.professionalId, ownerType: "CUSTOMER" });
  const locked = await tx.$queryRaw<Array<{ heldKobo: bigint }>>`
    SELECT "heldKobo" FROM "Wallet" WHERE id = ${professional.id} FOR UPDATE`;
  if ((locked[0]?.heldKobo ?? BigInt(0)) < amount) {
    throw new ApiError(409, "escrow_conflict", "The booking escrow balance is no longer available.");
  }
  await tx.wallet.update({ where: { id: professional.id }, data: { heldKobo: { decrement: amount } } });
  await tx.wallet.update({ where: { id: customer.id }, data: { availableKobo: { increment: amount } } });
  await tx.serviceBooking.update({ where: { id: booking.id }, data: { paymentStatus: "REFUNDED" } });

  await postBalancedTransaction({
    tx,
    actorId,
    walletId: professional.id,
    type: "refund",
    amountKobo: amount,
    reference: `gig:${booking.reference}:refund`,
    description: `NaijaGigs booking ${booking.reference} refunded`,
    entries: [
      { walletId: professional.id, direction: "DEBIT", amountKobo: amount, memo: "Gig escrow reversed" },
      { walletId: customer.id, direction: "CREDIT", amountKobo: amount, memo: "Gig booking refund" }
    ]
  });
}

const bookingTransitions: Record<string, { from: ServiceBookingStatus[]; to: ServiceBookingStatus; actor: "customer" | "professional" | "either" }> = {
  accept: { from: ["REQUESTED"], to: "ACCEPTED", actor: "professional" },
  decline: { from: ["REQUESTED", "ACCEPTED"], to: "DECLINED", actor: "professional" },
  start: { from: ["ACCEPTED"], to: "IN_PROGRESS", actor: "professional" },
  submit: { from: ["IN_PROGRESS"], to: "SUBMITTED", actor: "professional" },
  approve: { from: ["SUBMITTED"], to: "COMPLETED", actor: "customer" },
  cancel: { from: ["REQUESTED", "ACCEPTED"], to: "CANCELLED", actor: "either" }
};

export async function transitionBooking(userId: string, bookingId: string, action: keyof typeof bookingTransitions) {
  const transition = bookingTransitions[action];
  if (!transition) throw new ApiError(400, "invalid_action", "Unknown booking action.");

  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ApiError(404, "booking_not_found", "Booking not found.");
  const isCustomer = booking.customerId === userId;
  const isProfessional = booking.professionalId === userId;
  if (!isCustomer && !isProfessional) throw new ApiError(403, "forbidden", "This booking belongs to other accounts.");
  if (transition.actor === "customer" && !isCustomer) throw new ApiError(403, "forbidden", "Only the customer can perform this action.");
  if (transition.actor === "professional" && !isProfessional) throw new ApiError(403, "forbidden", "Only the professional can perform this action.");
  if (!transition.from.includes(booking.status)) {
    throw new ApiError(409, "invalid_transition", `A ${booking.status.toLowerCase()} booking cannot be ${action}ed.`);
  }
  if (action === "start" && booking.paymentStatus !== "HELD") {
    throw new ApiError(409, "payment_required", "The customer must fund the booking before work starts.");
  }
  if (action === "approve" && booking.paymentStatus !== "HELD") {
    throw new ApiError(409, "payment_required", "This booking has no escrow balance to release.");
  }
  if (action === "submit") {
    const now = new Date();
    await prisma.serviceBooking.update({ where: { id: booking.id }, data: { status: "SUBMITTED", submittedAt: now } });
  } else if (action === "approve") {
    await prisma.$transaction(async (tx) => {
      await tx.serviceBooking.update({ where: { id: booking.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await releaseBookingFunds(tx, booking, userId);
      if (booking.jobId) await tx.customerJob.update({ where: { id: booking.jobId }, data: { status: "CLOSED" } });
    });
  } else if (action === "cancel" && booking.paymentStatus === "HELD") {
    await prisma.$transaction(async (tx) => {
      await tx.serviceBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledReason: "Cancelled before work started" } });
      await refundBookingFunds(tx, booking, userId);
      if (booking.jobId) await tx.customerJob.update({ where: { id: booking.jobId }, data: { status: "OPEN" } });
    });
  } else {
    await prisma.serviceBooking.update({
      where: { id: booking.id },
      data: {
        status: transition.to,
        acceptedAt: action === "accept" ? new Date() : undefined,
        cancelledReason: action === "decline" ? "Declined by the professional" : action === "cancel" ? "Cancelled before payment" : undefined
      }
    });
  }

  await recordAudit({
    actorId: userId,
    action: `gig.booking_${action}`,
    entity: "ServiceBooking",
    entityId: booking.id,
    metadata: { from: booking.status, to: transition.to, reference: booking.reference }
  });
  return prisma.serviceBooking.findUniqueOrThrow({ where: { id: booking.id } });
}

export async function createBookingReview(userId: string, bookingId: string, input: { rating: number; comment: string }) {
  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId }, include: { review: true } });
  if (!booking) throw new ApiError(404, "booking_not_found", "Booking not found.");
  if (booking.customerId !== userId) throw new ApiError(403, "forbidden", "Only the customer can review this booking.");
  if (booking.status !== "COMPLETED") throw new ApiError(409, "not_completed", "You can review a booking after it is completed.");
  if (booking.review) throw new ApiError(409, "review_exists", "This booking already has a review.");
  if (input.rating < 1 || input.rating > 5) throw new ApiError(400, "invalid_rating", "Rating must be between 1 and 5.");

  const review = await prisma.serviceReview.create({
    data: {
      bookingId,
      customerId: userId,
      professionalId: booking.professionalId,
      rating: input.rating,
      comment: input.comment,
      status: "PENDING"
    }
  });
  await recordAudit({
    actorId: userId,
    action: "gig.review_submitted",
    entity: "ServiceReview",
    entityId: review.id,
    metadata: { bookingId, rating: input.rating }
  });
  return review;
}

export async function openBookingDispute(userId: string, bookingId: string, input: { reason: string; details?: string }) {
  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ApiError(404, "booking_not_found", "Booking not found.");
  if (booking.customerId !== userId && booking.professionalId !== userId) {
    throw new ApiError(403, "forbidden", "This booking belongs to other accounts.");
  }
  if (!["ACCEPTED", "IN_PROGRESS", "SUBMITTED", "DISPUTED"].includes(booking.status)) {
    throw new ApiError(409, "not_disputable", "This booking can no longer be disputed.");
  }
  const open = await prisma.serviceDispute.findFirst({ where: { bookingId, status: { in: ["OPEN", "UNDER_REVIEW"] } } });
  if (open) throw new ApiError(409, "dispute_exists", "There is already an open dispute for this booking.");

  const [dispute] = await prisma.$transaction([
    prisma.serviceDispute.create({
      data: { bookingId, openedById: userId, reason: input.reason, details: input.details ?? null, status: "OPEN" }
    }),
    prisma.serviceBooking.update({ where: { id: booking.id }, data: { status: "DISPUTED" } })
  ]);
  await recordAudit({
    actorId: userId,
    action: "gig.dispute_opened",
    entity: "ServiceDispute",
    entityId: dispute.id,
    metadata: { bookingId, reason: input.reason }
  });
  return dispute;
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export async function sendBookingMessage(userId: string, bookingId: string, body: string) {
  const booking = await prisma.serviceBooking.findUnique({
    where: { id: bookingId },
    include: { conversation: true }
  });
  if (!booking) throw new ApiError(404, "booking_not_found", "Booking not found.");
  if (booking.customerId !== userId && booking.professionalId !== userId) {
    throw new ApiError(403, "forbidden", "This conversation belongs to other accounts.");
  }

  const conversation =
    booking.conversation ??
    (await prisma.conversation.create({
      data: { bookingId: booking.id, jobId: booking.jobId, customerId: booking.customerId, professionalId: booking.professionalId }
    }));

  const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: userId, body } });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  return message;
}

export async function listConversationsForUser(userId: string) {
  return prisma.conversation.findMany({
    where: { OR: [{ customerId: userId }, { professionalId: userId }] },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      customer: { select: { id: true, name: true } },
      professional: { select: { id: true, name: true } },
      booking: { select: { id: true, reference: true, title: true, status: true } }
    },
    orderBy: { lastMessageAt: "desc" }
  });
}

export async function getConversationForUser(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      customer: { select: { id: true, name: true } },
      professional: { select: { id: true, name: true } },
      booking: { select: { id: true, reference: true, title: true, status: true } }
    }
  });
  if (!conversation) return null;
  if (conversation.customerId !== userId && conversation.professionalId !== userId) return null;

  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() }
  });
  return conversation;
}

export async function sendConversationMessage(userId: string, conversationId: string, body: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new ApiError(404, "conversation_not_found", "Conversation not found.");
  if (conversation.customerId !== userId && conversation.professionalId !== userId) {
    throw new ApiError(403, "forbidden", "This conversation belongs to other accounts.");
  }
  const message = await prisma.message.create({ data: { conversationId, senderId: userId, body } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  return message;
}

// ---------------------------------------------------------------------------
// Professional workspace
// ---------------------------------------------------------------------------

export async function professionalOverview(userId: string) {
  const profile = await prisma.professionalProfile.findUnique({
    where: { userId },
    include: {
      categories: { include: { category: true } },
      listings: { orderBy: { createdAt: "desc" } },
      serviceAreas: true,
      availability: { orderBy: { weekday: "asc" } }
    }
  });
  if (!profile) return null;

  const [proposals, bookings, reviews] = await Promise.all([
    prisma.jobProposal.findMany({
      where: { professionalId: profile.id },
      include: { job: { select: { id: true, title: true, status: true, city: true, state: true, mode: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.serviceBooking.findMany({
      where: { professionalProfileId: profile.id },
      include: { customer: { select: { name: true } }, listing: { select: { title: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.serviceReview.findMany({ where: { professionalId: userId }, orderBy: { createdAt: "desc" } })
  ]);

  const completed = bookings.filter((booking) => booking.status === "COMPLETED");
  const released = bookings.filter((booking) => booking.paymentStatus === "RELEASED");
  const gross = released.reduce((total, booking) => total + booking.amountKobo, BigInt(0));
  const commission = released.reduce((total, booking) => total + commissionFor(booking.amountKobo, booking.commissionBps), BigInt(0));

  return {
    profile,
    proposals,
    bookings,
    reviews,
    metrics: {
      completedBookings: completed.length,
      releasedBookings: released.length,
      grossKobo: gross.toString(),
      commissionKobo: commission.toString(),
      netKobo: (gross - commission).toString(),
      averageRating: ratingOf(reviews.filter((review) => review.status === "PUBLISHED")),
      pendingProposals: proposals.filter((proposal) => proposal.status === "SUBMITTED").length
    }
  };
}

export async function customerOverview(userId: string) {
  const [jobs, bookings, conversations] = await Promise.all([
    prisma.customerJob.findMany({
      where: { customerId: userId },
      include: {
        category: { select: { name: true } },
        _count: { select: { proposals: true } },
        proposals: { where: { status: "SUBMITTED" }, select: { id: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.serviceBooking.findMany({
      where: { customerId: userId },
      include: {
        professionalProfile: { select: { displayName: true, avatarUrl: true, city: true, state: true, id: true } },
        listing: { select: { slug: true, title: true } },
        review: { select: { id: true, status: true } },
        disputes: { where: { status: { in: ["OPEN", "UNDER_REVIEW"] } }, select: { id: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.conversation.findMany({
      where: { customerId: userId },
      include: {
        messages: { take: 1, orderBy: { createdAt: "desc" } },
        professional: { select: { name: true } },
        booking: { select: { reference: true, title: true } }
      },
      orderBy: { lastMessageAt: "desc" },
      take: 10
    })
  ]);

  return { jobs, bookings, conversations };
}

// ---------------------------------------------------------------------------
// Control Center moderation
// ---------------------------------------------------------------------------

export async function adminGigOverview(admin: SessionUser) {
  const scoped = admin.scopeCountryCode
    ? { countryCode: admin.scopeCountryCode, ...(admin.scopeCityCode ? { city: admin.scopeCityCode } : {}) }
    : {};

  const [professionals, listings, reviews, disputes, bookings] = await Promise.all([
    prisma.professionalProfile.findMany({ where: { ...scoped }, include: { user: { select: { email: true } }, categories: { include: { category: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.serviceListing.findMany({ where: { ...scoped }, include: { professional: { select: { displayName: true, id: true } }, category: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.serviceReview.findMany({ include: { professional: { select: { name: true } }, customer: { select: { name: true } }, booking: { select: { reference: true, countryCode: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.serviceDispute.findMany({ include: { booking: { select: { reference: true, title: true, amountKobo: true, countryCode: true, city: true } }, openedBy: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.serviceBooking.findMany({ where: { ...scoped }, select: { status: true, paymentStatus: true, amountKobo: true, countryCode: true, city: true } })
  ]);

  return {
    professionals,
    listings,
    reviews,
    disputes,
    metrics: {
      pendingProfessionals: professionals.filter((profile) => profile.status === "PENDING").length,
      activeListings: listings.filter((listing) => listing.status === "ACTIVE").length,
      pendingReviews: reviews.filter((review) => review.status === "PENDING").length,
      openDisputes: disputes.filter((dispute) => dispute.status === "OPEN" || dispute.status === "UNDER_REVIEW").length,
      bookings: bookings.length,
      heldKobo: bookings.filter((booking) => booking.paymentStatus === "HELD").reduce((total, booking) => total + booking.amountKobo, BigInt(0)).toString()
    }
  };
}

function assertGigRegion(admin: SessionUser, target: { countryCode?: string | null; city?: string | null }) {
  assertRegion(admin, { countryCode: target.countryCode ?? null, city: target.city ?? null });
}

export async function moderateProfessional(admin: SessionUser, profileId: string, action: "VERIFY" | "REJECT" | "SUSPEND" | "REINSTATE", note?: string) {
  const profile = await prisma.professionalProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw new ApiError(404, "professional_not_found", "Professional profile not found.");
  assertGigRegion(admin, profile);

  const status = action === "VERIFY" || action === "REINSTATE" ? "VERIFIED" : action === "REJECT" ? "REJECTED" : "SUSPENDED";
  const updated = await prisma.professionalProfile.update({
    where: { id: profile.id },
    data: {
      status,
      verifiedAt: status === "VERIFIED" ? new Date() : profile.verifiedAt,
      published: status === "VERIFIED" ? true : false,
      suspendedReason: action === "SUSPEND" ? note ?? "Suspended by the Control Center" : null
    }
  });

  await recordAudit({
    actorId: admin.id,
    action: `gig.professional_${action.toLowerCase()}`,
    entity: "ProfessionalProfile",
    entityId: profile.id,
    metadata: { before: profile.status, after: status, note: note ?? null }
  });
  return updated;
}

export async function moderateListing(admin: SessionUser, listingId: string, action: "ACTIVATE" | "PAUSE" | "SUSPEND", note?: string) {
  const listing = await prisma.serviceListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new ApiError(404, "listing_not_found", "Listing not found.");
  assertGigRegion(admin, listing);
  const status = action === "ACTIVATE" ? "ACTIVE" : action === "PAUSE" ? "PAUSED" : "SUSPENDED";
  const updated = await prisma.serviceListing.update({
    where: { id: listing.id },
    data: { status, moderationNote: action === "SUSPEND" ? note ?? "Suspended by the Control Center" : null }
  });
  await recordAudit({
    actorId: admin.id,
    action: `gig.listing_${action.toLowerCase()}`,
    entity: "ServiceListing",
    entityId: listing.id,
    metadata: { before: listing.status, after: status, note: note ?? null }
  });
  return updated;
}

export async function moderateReview(admin: SessionUser, reviewId: string, action: "PUBLISH" | "HIDE", note?: string) {
  const review = await prisma.serviceReview.findUnique({
    where: { id: reviewId },
    include: { booking: { select: { countryCode: true, city: true } } }
  });
  if (!review) throw new ApiError(404, "review_not_found", "Review not found.");
  assertGigRegion(admin, review.booking);
  const status = action === "PUBLISH" ? "PUBLISHED" : "HIDDEN";
  const updated = await prisma.serviceReview.update({ where: { id: review.id }, data: { status } });
  await recordAudit({
    actorId: admin.id,
    action: `gig.review_${action.toLowerCase()}`,
    entity: "ServiceReview",
    entityId: review.id,
    metadata: { before: review.status, after: status, note: note ?? null }
  });
  return updated;
}

export async function resolveDispute(admin: SessionUser, disputeId: string, input: { resolution: string; outcome: "refund" | "release" | "none" }) {
  const dispute = await prisma.serviceDispute.findUnique({
    where: { id: disputeId },
    include: { booking: true }
  });
  if (!dispute) throw new ApiError(404, "dispute_not_found", "Dispute not found.");
  assertGigRegion(admin, dispute.booking);
  if (dispute.status === "RESOLVED" || dispute.status === "CLOSED") {
    throw new ApiError(409, "dispute_closed", "This dispute is already resolved.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceDispute.update({
      where: { id: dispute.id },
      data: { status: "RESOLVED", resolution: input.resolution }
    });
    if (input.outcome === "refund" && dispute.booking.paymentStatus === "HELD") {
      await refundBookingFunds(tx, dispute.booking, admin.id);
      await tx.serviceBooking.update({ where: { id: dispute.bookingId }, data: { status: "CANCELLED", cancelledReason: "Resolved by the Control Center with a refund" } });
    } else if (input.outcome === "release" && dispute.booking.paymentStatus === "HELD") {
      await releaseBookingFunds(tx, dispute.booking, admin.id);
      await tx.serviceBooking.update({ where: { id: dispute.bookingId }, data: { status: "COMPLETED", completedAt: new Date() } });
    } else {
      await tx.serviceBooking.update({ where: { id: dispute.bookingId }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
  });

  await recordAudit({
    actorId: admin.id,
    action: "gig.dispute_resolved",
    entity: "ServiceDispute",
    entityId: dispute.id,
    metadata: { outcome: input.outcome, resolution: input.resolution, bookingId: dispute.bookingId }
  });
  return prisma.serviceDispute.findUniqueOrThrow({ where: { id: dispute.id } });
}
