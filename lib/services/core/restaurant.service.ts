import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";

type ApplicationStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

export type RestaurantApplicationRow = {
  id: string;
  userId: string;
  kitchenName: string;
  cuisine: string;
  market: string;
  address: string;
  phone: string;
  status: ApplicationStatus;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RestaurantRow = {
  id: string;
  slug: string;
  ownerId: string;
  name: string;
  cuisine: string;
  market: string;
  address: string;
  phone: string;
  status: "PENDING" | "VERIFIED" | "SUSPENDED";
  isSample: boolean;
  applicationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MenuItemRow = {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  priceKobo: bigint | string;
  published: boolean;
  available: boolean;
  isSample: boolean;
  createdAt: Date;
};

function requireText(value: unknown, label: string, max = 120) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ApiError(400, "validation_error", `${label} is required.`);
  if (text.length > max) throw new ApiError(400, "validation_error", `${label} must be ${max} characters or fewer.`);
  return text;
}

function parseNaira(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : String(value ?? "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new ApiError(400, "validation_error", "Enter a price in naira, for example 4500 or 4500.50.");
  const kobo = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(kobo) || kobo < 100) throw new ApiError(400, "validation_error", "Price must be at least ₦1.");
  if (kobo > 100_000_000_00) throw new ApiError(400, "validation_error", "Price is above the allowed limit.");
  return BigInt(kobo);
}

export async function getOwnRestaurant(userId: string) {
  const rows = await prisma.$queryRaw<RestaurantRow[]>`
    SELECT * FROM "Restaurant" WHERE "ownerId" = ${userId} AND "isSample" = false ORDER BY "createdAt" ASC LIMIT 1`;
  return rows[0] ?? null;
}

export async function getOwnRestaurantApplication(userId: string) {
  const rows = await prisma.$queryRaw<RestaurantApplicationRow[]>`
    SELECT * FROM "RestaurantApplication" WHERE "userId" = ${userId} ORDER BY "createdAt" DESC LIMIT 1`;
  return rows[0] ?? null;
}

export async function submitRestaurantApplication(userId: string, input: Record<string, unknown>) {
  const kitchenName = requireText(input.kitchenName, "Kitchen name");
  const cuisine = requireText(input.cuisine, "Cuisine", 80);
  const market = requireText(input.market, "Delivery area", 80);
  const address = requireText(input.address, "Kitchen address", 200);
  const phone = requireText(input.phone, "Phone", 40);

  const existing = await getOwnRestaurantApplication(userId);
  if (existing && existing.status !== "REJECTED") {
    throw new ApiError(409, "application_exists", "You already have a kitchen application under review or approved.");
  }
  const approvedRestaurant = await getOwnRestaurant(userId);
  if (approvedRestaurant) {
    throw new ApiError(409, "kitchen_exists", "Your kitchen is already active.");
  }

  const row = existing
    ? (await prisma.$queryRaw<RestaurantApplicationRow[]>`
        UPDATE "RestaurantApplication" SET "kitchenName" = ${kitchenName}, cuisine = ${cuisine}, market = ${market},
          address = ${address}, phone = ${phone}, status = 'SUBMITTED'::"RestaurantApplicationStatus",
          note = NULL, "reviewedAt" = NULL, "reviewedBy" = NULL, "updatedAt" = NOW()
        WHERE id = ${existing.id} RETURNING *`)[0]
    : (await prisma.$queryRaw<RestaurantApplicationRow[]>`
        INSERT INTO "RestaurantApplication" (id, "userId", "kitchenName", cuisine, market, address, phone, status, "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${userId}, ${kitchenName}, ${cuisine}, ${market}, ${address}, ${phone}, 'SUBMITTED'::"RestaurantApplicationStatus", NOW(), NOW())
        RETURNING *`)[0];

  await recordAudit({
    actorId: userId,
    action: "restaurant_application.submitted",
    entity: "RestaurantApplication",
    entityId: row.id,
    metadata: { kitchenName, cuisine, market, resubmission: Boolean(existing) }
  });
  return row;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "kitchen";
}

async function uniqueSlug(base: string) {
  let slug = base;
  let suffix = 0;
  while ((await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Restaurant" WHERE slug = ${slug} LIMIT 1`).length > 0) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

export async function reviewRestaurantApplication(input: {
  adminId: string;
  applicationId: string;
  decision: "approve" | "reject";
  note?: string;
}) {
  const rows = await prisma.$queryRaw<RestaurantApplicationRow[]>`
    SELECT * FROM "RestaurantApplication" WHERE id = ${input.applicationId} LIMIT 1`;
  const application = rows[0];
  if (!application) throw new ApiError(404, "application_not_found", "Kitchen application not found.");
  if (application.status !== "SUBMITTED") {
    throw new ApiError(409, "already_reviewed", "This kitchen application has already been reviewed.");
  }
  const note = input.note?.trim() || (input.decision === "approve" ? "Approved by administrator." : "Application rejected by administrator.");

  if (input.decision === "reject") {
    const rejected = (await prisma.$queryRaw<RestaurantApplicationRow[]>`
      UPDATE "RestaurantApplication" SET status = 'REJECTED'::"RestaurantApplicationStatus", note = ${note},
        "reviewedBy" = ${input.adminId}, "reviewedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${application.id} RETURNING *`)[0];
    await recordAudit({
      actorId: input.adminId,
      action: "restaurant_application.rejected",
      entity: "RestaurantApplication",
      entityId: application.id,
      metadata: { kitchenName: application.kitchenName, note }
    });
    await notify(application.userId, "restaurant_application_rejected", "Kitchen application rejected", note, "/restaurant/apply");
    return { application: rejected, restaurant: null };
  }

  const existing = await prisma.$queryRaw<RestaurantRow[]>`
    SELECT * FROM "Restaurant" WHERE "applicationId" = ${application.id} LIMIT 1`;
  if (existing[0]) {
    await prisma.$executeRaw`
      UPDATE "RestaurantApplication" SET status = 'APPROVED'::"RestaurantApplicationStatus", note = ${note},
        "reviewedBy" = ${input.adminId}, "reviewedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${application.id}`;
    return { application: { ...application, status: "APPROVED" as const, note }, restaurant: existing[0] };
  }

  const slug = await uniqueSlug(slugify(application.kitchenName));
  const restaurant = (await prisma.$queryRaw<RestaurantRow[]>`
    INSERT INTO "Restaurant" (id, slug, "ownerId", name, cuisine, market, address, phone, status, "isSample", "applicationId", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${slug}, ${application.userId}, ${application.kitchenName}, ${application.cuisine}, ${application.market},
      ${application.address}, ${application.phone}, 'VERIFIED'::"RestaurantStatus", false, ${application.id}, NOW(), NOW())
    RETURNING *`)[0];
  await prisma.$executeRaw`
    UPDATE "RestaurantApplication" SET status = 'APPROVED'::"RestaurantApplicationStatus", note = ${note},
      "reviewedBy" = ${input.adminId}, "reviewedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${application.id}`;
  await recordAudit({
    actorId: input.adminId,
    action: "restaurant_application.approved",
    entity: "RestaurantApplication",
    entityId: application.id,
    metadata: { kitchenName: application.kitchenName, restaurantId: restaurant.id, slug }
  });
  await notify(application.userId, "restaurant_application_approved", "Kitchen approved", `${restaurant.name} is live. Publish your first menu item.`, "/restaurant");
  return { application: { ...application, status: "APPROVED" as const, note }, restaurant };
}

export async function listRestaurantApplications() {
  return prisma.$queryRaw<Array<RestaurantApplicationRow & { userName: string; userEmail: string; restaurantId: string | null }>>`
    SELECT a.*, u.name AS "userName", u.email AS "userEmail",
      (SELECT r.id FROM "Restaurant" r WHERE r."applicationId" = a.id LIMIT 1) AS "restaurantId"
    FROM "RestaurantApplication" a JOIN "User" u ON u.id = a."userId"
    ORDER BY a."createdAt" DESC`;
}

export async function getRestaurantMenu(userId: string) {
  const restaurant = await getOwnRestaurant(userId);
  if (!restaurant) throw new ApiError(403, "not_a_kitchen", "No kitchen is linked to this account.");
  const items = await prisma.$queryRaw<MenuItemRow[]>`
    SELECT * FROM "MenuItem" WHERE "restaurantId" = ${restaurant.id} ORDER BY "createdAt" ASC`;
  return { restaurant, items };
}

async function requireWritableRestaurant(userId: string) {
  const restaurant = await getOwnRestaurant(userId);
  if (!restaurant) throw new ApiError(403, "not_a_kitchen", "No kitchen is linked to this account.");
  if (restaurant.status !== "VERIFIED") {
    throw new ApiError(403, "kitchen_suspended", "This kitchen is not allowed to change its menu right now.");
  }
  return restaurant;
}

export async function createMenuItem(userId: string, input: Record<string, unknown>) {
  const restaurant = await requireWritableRestaurant(userId);
  const name = requireText(input.name, "Item name");
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 240) : null;
  const priceKobo = parseNaira(input.priceNaira ?? input.priceKobo);
  const item = (await prisma.$queryRaw<MenuItemRow[]>`
    INSERT INTO "MenuItem" (id, "restaurantId", name, description, "priceKobo", published, available, "isSample", "createdAt")
    VALUES (${randomUUID()}, ${restaurant.id}, ${name}, ${description}, ${priceKobo}, false, true, false, NOW())
    RETURNING *`)[0];
  await recordAudit({
    actorId: userId,
    action: "restaurant.menu_item_created",
    entity: "MenuItem",
    entityId: item.id,
    metadata: { restaurantId: restaurant.id, name, priceKobo: priceKobo.toString() }
  });
  return item;
}

export async function updateMenuItem(userId: string, itemId: string, patch: Record<string, unknown>) {
  const restaurant = await requireWritableRestaurant(userId);
  const existing = (await prisma.$queryRaw<MenuItemRow[]>`SELECT * FROM "MenuItem" WHERE id = ${itemId} LIMIT 1`)[0];
  if (!existing) throw new ApiError(404, "item_not_found", "Menu item not found.");
  if (existing.restaurantId !== restaurant.id) throw new ApiError(403, "forbidden", "This menu item belongs to another kitchen.");

  const name = patch.name === undefined ? existing.name : requireText(patch.name, "Item name");
  const description = patch.description === undefined ? existing.description : (typeof patch.description === "string" ? patch.description.trim().slice(0, 240) : null);
  const priceKobo = patch.priceNaira === undefined && patch.priceKobo === undefined
    ? BigInt(existing.priceKobo)
    : parseNaira(patch.priceNaira ?? patch.priceKobo);
  const published = patch.published === undefined ? existing.published : Boolean(patch.published);
  const available = patch.available === undefined ? existing.available : Boolean(patch.available);

  const updated = (await prisma.$queryRaw<MenuItemRow[]>`
    UPDATE "MenuItem" SET name = ${name}, description = ${description}, "priceKobo" = ${priceKobo},
      published = ${published}, available = ${available}
    WHERE id = ${itemId} RETURNING *`)[0];
  await recordAudit({
    actorId: userId,
    action: "restaurant.menu_item_updated",
    entity: "MenuItem",
    entityId: itemId,
    metadata: {
      restaurantId: restaurant.id,
      before: { name: existing.name, priceKobo: String(existing.priceKobo), published: existing.published, available: existing.available },
      after: { name: updated.name, priceKobo: String(updated.priceKobo), published: updated.published, available: updated.available }
    }
  });
  return updated;
}

export async function setRestaurantStatus(input: { adminId: string; restaurantId: string; status: "VERIFIED" | "SUSPENDED"; reason?: string }) {
  const existing = (await prisma.$queryRaw<RestaurantRow[]>`SELECT * FROM "Restaurant" WHERE id = ${input.restaurantId} LIMIT 1`)[0];
  if (!existing) throw new ApiError(404, "restaurant_not_found", "Kitchen not found.");
  if (existing.isSample) throw new ApiError(409, "sample_kitchen", "Sample kitchens are managed by fixtures, not the Control Center.");
  const updated = (await prisma.$queryRaw<RestaurantRow[]>`
    UPDATE "Restaurant" SET status = ${input.status}::"RestaurantStatus", "updatedAt" = NOW()
    WHERE id = ${existing.id} RETURNING *`)[0];
  await recordAudit({
    actorId: input.adminId,
    action: "restaurant.status_changed",
    entity: "Restaurant",
    entityId: existing.id,
    metadata: { before: existing.status, after: updated.status, reason: input.reason ?? null }
  });
  await notify(existing.ownerId,
    updated.status === "SUSPENDED" ? "restaurant_suspended" : "restaurant_reactivated",
    updated.status === "SUSPENDED" ? "Kitchen suspended" : "Kitchen reactivated",
    input.reason ?? (updated.status === "SUSPENDED" ? "Menu changes are blocked while the kitchen is suspended." : "Your kitchen can publish menu items again."),
    "/restaurant");
  return updated;
}

async function notify(userId: string, kind: string, title: string, body: string, href: string) {
  await prisma.$executeRaw`
    INSERT INTO "PartnerNotification" (id, "userId", kind, title, body, href, "createdAt")
    VALUES (${randomUUID()}, ${userId}, ${kind}, ${title}, ${body}, ${href}, NOW())`;
}
