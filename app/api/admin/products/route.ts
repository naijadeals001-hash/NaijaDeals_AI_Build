import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { countryScopeWhere } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Control Center product list.
 *
 * Paginated callers (`page` or `pageSize` present) receive
 * `{ products, total, page, pageSize, totalPages, hasMore, query, status, sort }`.
 * Legacy callers that omit both still receive the historical JSON array, capped
 * at the previous 200 rows, with pagination facts in `X-Total-Count` / `X-Page`
 * / `X-Page-Size` / `X-Total-Pages` headers. The cap is a compatibility limit,
 * not the only way to reach the catalogue: every authorised product is
 * reachable by walking the paginated envelope.
 *
 * Region scope is always applied on the server. The optional `country` filter
 * is ANDed with the caller's scope, so a country-scoped operator requesting a
 * foreign country receives an empty result rather than another region's rows.
 */
const LEGACY_TAKE = 200;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;
const MAX_SEARCH_LENGTH = 120;

const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
type ProductStatusFilter = (typeof PRODUCT_STATUSES)[number];

const PRODUCT_SORTS = ["newest", "oldest", "name", "updated"] as const;
type ProductSort = (typeof PRODUCT_SORTS)[number];

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function readSearch(params: URLSearchParams): string | null {
  if (!params.has("q")) return null;
  const value = (params.get("q") ?? "").trim();
  if (!value) return null;
  if (value.length > MAX_SEARCH_LENGTH) {
    throw new ApiError(400, "validation_error", `q must be ${MAX_SEARCH_LENGTH} characters or fewer.`);
  }
  if (CONTROL_CHARACTERS.test(value)) {
    throw new ApiError(400, "validation_error", "q contains invalid characters.");
  }
  return value;
}

function readStatus(params: URLSearchParams): ProductStatusFilter | null {
  const raw = (params.get("status") ?? "").trim();
  if (!raw) return null;
  const value = raw.toUpperCase();
  if (!PRODUCT_STATUSES.includes(value as ProductStatusFilter)) {
    throw new ApiError(400, "validation_error", `status must be one of: ${PRODUCT_STATUSES.join(", ")}.`);
  }
  return value as ProductStatusFilter;
}

function readSort(params: URLSearchParams): ProductSort {
  const raw = (params.get("sort") ?? "").trim().toLowerCase();
  if (!raw) return "newest";
  if (!PRODUCT_SORTS.includes(raw as ProductSort)) {
    throw new ApiError(400, "validation_error", `sort must be one of: ${PRODUCT_SORTS.join(", ")}.`);
  }
  return raw as ProductSort;
}

function readPositiveInteger(params: URLSearchParams, field: string, max: number): number | null {
  const raw = params.get(field);
  if (raw === null) return null;
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) {
    throw new ApiError(400, "validation_error", `${field} must be a whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ApiError(400, "validation_error", `${field} must be between 1 and ${max}.`);
  }
  return parsed;
}

function readCountry(params: URLSearchParams): string | null {
  const raw = (params.get("country") ?? "").trim();
  if (!raw) return null;
  const value = raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) {
    throw new ApiError(400, "validation_error", "country must be a two-letter country code.");
  }
  return value;
}

function orderByFor(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "name":
      return [{ name: "asc" }, { id: "asc" }];
    case "updated":
      return [{ updatedAt: "desc" }, { id: "asc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminPermission("products:read");
    const params = request.nextUrl.searchParams;

    const search = readSearch(params);
    const status = readStatus(params);
    const sort = readSort(params);
    const country = readCountry(params);
    const page = readPositiveInteger(params, "page", MAX_PAGE) ?? 1;
    const pageSize = readPositiveInteger(params, "pageSize", MAX_PAGE_SIZE) ?? DEFAULT_PAGE_SIZE;
    const paginated = params.has("page") || params.has("pageSize");

    const filters: Prisma.ProductWhereInput[] = [countryScopeWhere(admin)];
    if (country) filters.push({ countryCode: country });
    if (status) filters.push({ status });
    if (search) {
      filters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
          { vendor: { name: { contains: search, mode: "insensitive" } } },
          { category: { name: { contains: search, mode: "insensitive" } } }
        ]
      });
    }
    const where: Prisma.ProductWhereInput = { AND: filters };

    const include = {
      vendor: { select: { id: true, name: true, status: true } },
      category: true,
      images: { take: 1 },
      stock: true,
      variants: true
    } satisfies Prisma.ProductInclude;

    if (!paginated) {
      const [rows, total] = await prisma.$transaction([
        prisma.product.findMany({
          where,
          include,
          orderBy: orderByFor(sort),
          take: LEGACY_TAKE
        }),
        prisma.product.count({ where })
      ]);
      return NextResponse.json(jsonSafe(rows), {
        headers: {
          "Cache-Control": "no-store",
          "X-Total-Count": String(total),
          "X-Page": "1",
          "X-Page-Size": String(LEGACY_TAKE),
          "X-Total-Pages": String(Math.max(1, Math.ceil(total / LEGACY_TAKE)))
        }
      });
    }

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include,
        orderBy: orderByFor(sort),
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.product.count({ where })
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json(
      jsonSafe({
        products: rows,
        total,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
        query: search,
        status,
        sort
      }),
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Total-Count": String(total),
          "X-Page": String(page),
          "X-Page-Size": String(pageSize),
          "X-Total-Pages": String(totalPages)
        }
      }
    );
  } catch (error) {
    return jsonError(error);
  }
}
