/**
 * NaijaShop cart availability acceptance tests.
 *
 * Scope:
 *   - `/api/cart` reports the server-authoritative availability for active and
 *     saved lines (out of stock, product/vendor/variant unavailable,
 *     variant required);
 *   - the cart UI consumes it, disables checkout and prevents implied purchase;
 *   - `/checkout` is blocked by the client gate and still refused by the server;
 *   - 390/768/1440 layouts have no horizontal overflow.
 *
 * Run only against an isolated TEST database and an app pointed at it:
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3106 \
 *     npx tsx scripts/naijashop-cart-availability-tests.ts
 *
 * Set SKIP_UI=1 to run only the API contract. Screenshots are written under
 * qa-artifacts/cart-availability/ (Git-ignored).
 */
import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_REQUIRED_TABLES, requireTestDatabase } from "./lib/test-db-guard";

const BASE = (process.env.TEST_BASE_URL ?? "").replace(/\/$/, "");
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "nd_session";
const SKIP_UI = process.env.SKIP_UI === "1";
if (!BASE) throw new Error("TEST_BASE_URL is required (for example http://localhost:3106).");

type Json = Record<string, any>;
type CheckResult = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: CheckResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS  ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`FAIL  ${name}\n      ${detail}`);
  }
}

class Client {
  private cookies = new Map<string, string>();

  constructor(token?: string) {
    if (token) this.cookies.set(SESSION_COOKIE, token);
  }

  async request(pathname: string, options: { method?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { Origin: BASE };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${BASE}${pathname}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual"
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: response.status, body: body as Json };
  }

  get(pathname: string) {
    return this.request(pathname);
  }

  post(pathname: string, body?: unknown) {
    return this.request(pathname, { method: "POST", body });
  }
}

function isStatus(response: { status: number; body: Json }, expected: number, label: string) {
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`);
  }
}

function sessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const target = await requireTestDatabase({
    requiredTables: [
      ...DEFAULT_REQUIRED_TABLES,
      "Cart",
      "CartItem",
      "Product",
      "ProductImage",
      "ProductVariant",
      "InventoryStock",
      "Vendor",
      "Category",
      "User",
      "Role",
      "UserRole",
      "Session",
      "Order",
      "OrderItem"
    ]
  });

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toLowerCase();
  const created = {
    userIds: [] as string[],
    sessionIds: [] as string[],
    roleIds: [] as string[],
    categoryIds: [] as string[],
    vendorIds: [] as string[],
    productIds: [] as string[],
    cartIds: [] as string[],
    cartItemIds: [] as string[],
    orderIds: [] as string[]
  };

  async function roleId(name: string) {
    const role = await prisma.role.findUnique({ where: { name } });
    if (role) return role.id;
    const createdRole = await prisma.role.create({ data: { name } });
    created.roleIds.push(createdRole.id);
    return createdRole.id;
  }

  let customerId = "";

  let exitCode = 1;
  try {
    console.log(`TEST database verified (${target.databaseName}); marker ${target.marker}`);
    console.log(`Fixture suffix ${suffix}`);

    const customer = await prisma.user.create({
      data: {
        email: `cart-availability-${suffix}@example.test`,
        name: `Cart Availability ${suffix}`,
        actorType: "CUSTOMER",
        verifiedAt: new Date()
      }
    });
    created.userIds.push(customer.id);
    customerId = customer.id;
    await prisma.userRole.create({ data: { userId: customer.id, roleId: await roleId("customer") } });
    const token = sessionToken();
    const session = await prisma.session.create({
      data: {
        userId: customer.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        userAgent: "naijashop-cart-availability-tests"
      }
    });
    created.sessionIds.push(session.id);
    const client = new Client(token);

    const category = await prisma.category.create({
      data: { name: `Cart Availability ${suffix}`, slug: `cart-availability-${suffix}`, description: "Isolated acceptance fixture" }
    });
    created.categoryIds.push(category.id);

    const verifiedVendor = await prisma.vendor.create({
      data: {
        ownerId: customer.id,
        name: `Cart Availability Verified ${suffix}`,
        slug: `cart-availability-verified-${suffix}`,
        market: "Lagos Island, Lagos",
        pickupAddress: "2 Cart Way, Lagos",
        pickupPhone: "+2348000000020",
        countryCode: "NG",
        status: "VERIFIED",
        trustScore: 80
      }
    });
    created.vendorIds.push(verifiedVendor.id);

    const suspendedVendor = await prisma.vendor.create({
      data: {
        ownerId: customer.id,
        name: `Cart Availability Suspended ${suffix}`,
        slug: `cart-availability-suspended-${suffix}`,
        market: "Lagos Island, Lagos",
        pickupAddress: "3 Cart Way, Lagos",
        pickupPhone: "+2348000000021",
        countryCode: "NG",
        status: "SUSPENDED",
        trustScore: 50
      }
    });
    created.vendorIds.push(suspendedVendor.id);

    async function createProduct(input: {
      label: string;
      status?: "ACTIVE" | "SUSPENDED";
      vendorId?: string;
      quantity: number;
      variants?: Array<{ name: string; isActive: boolean; stock: number }>;
    }) {
      const product = await prisma.product.create({
        data: {
          slug: `cart-availability-${input.label}-${suffix}`,
          name: `Cart ${input.label} ${suffix}`,
          description: "Isolated cart availability fixture.",
          vendorId: input.vendorId ?? verifiedVendor.id,
          categoryId: category.id,
          priceKobo: 500000n,
          countryCode: "NG",
          status: input.status ?? "ACTIVE",
          isSample: false,
          images: { create: [{ url: "/products/tecno-spark-20.svg", alt: input.label, sortOrder: 0 }] },
          stock: { create: { quantity: input.quantity, reserved: 0, lowStockLevel: 3 } },
          variants: input.variants
            ? {
                create: input.variants.map((variant, index) => ({
                  name: variant.name,
                  sku: `CART-SKU-${suffix}-${input.label}-${index}`,
                  priceKobo: 500000n,
                  stock: variant.stock,
                  reserved: 0,
                  isActive: variant.isActive
                }))
              }
            : undefined
        },
        include: { variants: true }
      });
      created.productIds.push(product.id);
      return product;
    }

    const availableProduct = await createProduct({ label: "available", quantity: 5 });
    const partialStockProduct = await createProduct({ label: "partial-stock", quantity: 2 });
    const outOfStockProduct = await createProduct({ label: "out-of-stock", quantity: 0 });
    const variantUnavailableProduct = await createProduct({
      label: "variant-unavailable",
      quantity: 5,
      variants: [{ name: "Inactive option", isActive: false, stock: 5 }]
    });
    const variantRequiredProduct = await createProduct({
      label: "variant-required",
      quantity: 5,
      variants: [{ name: "Active option", isActive: true, stock: 5 }]
    });
    const productUnavailable = await createProduct({ label: "product-suspended", quantity: 5, status: "SUSPENDED" });
    const vendorUnavailable = await createProduct({ label: "vendor-suspended", quantity: 5, vendorId: suspendedVendor.id });
    const savedVariantUnavailable = await createProduct({
      label: "saved-variant-unavailable",
      quantity: 5,
      variants: [{ name: "Retired saved option", isActive: false, stock: 5 }]
    });

    const cart = await prisma.cart.create({ data: { userId: customer.id, status: "ACTIVE" } });
    created.cartIds.push(cart.id);

    const lines = [
      { productId: availableProduct.id, quantity: 2, savedForLater: false },
      { productId: partialStockProduct.id, quantity: 3, savedForLater: false },
      { productId: outOfStockProduct.id, quantity: 1, savedForLater: false },
      { productId: variantUnavailableProduct.id, variantId: variantUnavailableProduct.variants[0].id, quantity: 1, savedForLater: false },
      { productId: variantRequiredProduct.id, quantity: 1, savedForLater: false },
      { productId: productUnavailable.id, quantity: 1, savedForLater: false },
      { productId: vendorUnavailable.id, quantity: 1, savedForLater: false },
      { productId: savedVariantUnavailable.id, variantId: savedVariantUnavailable.variants[0].id, quantity: 1, savedForLater: true }
    ];
    for (const line of lines) {
      const item = await prisma.cartItem.create({ data: { cartId: cart.id, ...line } });
      created.cartItemIds.push(item.id);
    }

    await check("Cart API reports availability for every active and saved line", async () => {
      const response = await client.get("/api/cart");
      isStatus(response, 200, "read cart");
      const items = response.body.items as Json[];
      assert(items.length === 8, `expected 8 lines, got ${items.length}`);
      const byProduct = new Map(items.map((item) => [String(item.productId), item]));

      const available = byProduct.get(availableProduct.id)!;
      assert(available.availability.purchasable === true, "available line is not purchasable");
      assert(available.availability.reason === null, "available line has a reason");
      assert(available.availability.available === 5, `available units ${available.availability.available}`);

      // A line can be purchasable in principle but still exceed the units that
      // can be added; the cart UI must block that quantity, not imply a sale.
      const partial = byProduct.get(partialStockProduct.id)!;
      assert(partial.availability.purchasable === true, "partial-stock line should remain purchasable");
      assert(partial.availability.available === 2, `partial-stock available ${partial.availability.available}`);
      assert(partial.quantity === 3, "partial-stock fixture quantity changed");

      const expected: Array<[string, string]> = [
        [outOfStockProduct.id, "out_of_stock"],
        [variantUnavailableProduct.id, "variant_unavailable"],
        [variantRequiredProduct.id, "variant_required"],
        [productUnavailable.id, "product_unavailable"],
        [vendorUnavailable.id, "vendor_unavailable"],
        [savedVariantUnavailable.id, "variant_unavailable"]
      ];
      for (const [productId, reason] of expected) {
        const line = byProduct.get(productId);
        assert(line, `missing line for ${productId}`);
        assert(line.availability.purchasable === false, `${reason} line is purchasable`);
        assert(line.availability.reason === reason, `${reason} line reason ${line.availability.reason}`);
      }
      assert(byProduct.get(savedVariantUnavailable.id)!.savedForLater === true, "saved line flag was lost");
      return "available=true; out_of_stock, variant_unavailable, variant_required, product_unavailable, vendor_unavailable all false (saved line included)";
    });

    await check("Server checkout still refuses an unavailable cart", async () => {
      const before = await prisma.order.count({ where: { customerId: customer.id } });
      const response = await client.post("/api/checkout", {
        address: {
          contactName: "Cart Fixture",
          contactPhone: "+2348000000022",
          countryCode: "NG",
          state: "Lagos",
          city: "Lagos",
          line1: "4 Cart Way, Lagos"
        },
        saveAddress: false
      });
      isStatus(response, 409, "checkout unavailable");
      assert(response.body.code === "item_unavailable", `expected item_unavailable, got ${response.body.code}`);
      const after = await prisma.order.count({ where: { customerId: customer.id } });
      assert(after === before, `checkout created ${after - before} order(s) despite refusal`);
      return "HTTP 409 item_unavailable; no order created";
    });

    if (!SKIP_UI) {
      await check("Cart and checkout UI present unavailable lines at 390/768/1440", async () => {
        const { chromium } = await import("playwright");
        const outDir = path.resolve("qa-artifacts", "cart-availability");
        await mkdir(outDir, { recursive: true });
        const browser = await chromium.launch({ headless: true });
        const viewports = [
          { width: 390, height: 844 },
          { width: 768, height: 1024 },
          { width: 1440, height: 900 }
        ];
        const notes: string[] = [];
        try {
          for (const viewport of viewports) {
            const context = await browser.newContext({ viewport });
            await context.addCookies([{ name: SESSION_COOKIE, value: token, url: BASE }]);
            const page = await context.newPage();
            await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
            await page.getByText("Unavailable — Out of stock.").first().waitFor({ timeout: 20_000 });

            const blockedArticle = page.locator("article", { hasText: "Unavailable — Out of stock." }).first();
            assert(await blockedArticle.isVisible(), `${viewport.width}: unavailable active line is not visible`);
            assert(
              await blockedArticle.getByRole("button", { name: "Increase quantity" }).isDisabled(),
              `${viewport.width}: quantity increase is enabled on an unavailable line`
            );
            const partialArticle = page.locator("article", { hasText: "Only 2 units can be added." }).first();
            assert(await partialArticle.isVisible(), `${viewport.width}: over-quantity line is not explained`);
            assert(
              await partialArticle.getByRole("button", { name: "Increase quantity" }).isDisabled(),
              `${viewport.width}: quantity increase is enabled above available stock`
            );
            assert(
              await page.getByRole("button", { name: "Proceed to checkout" }).isDisabled(),
              `${viewport.width}: checkout is enabled with unavailable active lines`
            );
            assert(
              await page.getByText("Move to cart").first().isDisabled(),
              `${viewport.width}: an unavailable saved line can still be moved to the cart`
            );
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth + 1
            );
            assert(!overflow, `${viewport.width}: horizontal overflow on the cart page`);
            await page.screenshot({ path: path.join(outDir, `cart-${viewport.width}.png`), fullPage: true });

            await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
            await page
              .getByRole("heading", { name: "Some items in your cart are unavailable" })
              .waitFor({ timeout: 20_000 });
            assert(
              (await page.getByRole("link", { name: "Review cart" }).count()) === 1,
              `${viewport.width}: checkout gate has no cart link`
            );
            assert(
              (await page.getByRole("button", { name: /Review order and choose payment/ }).count()) === 0,
              `${viewport.width}: checkout form is reachable with an unavailable cart`
            );
            const checkoutOverflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth + 1
            );
            assert(!checkoutOverflow, `${viewport.width}: horizontal overflow on the checkout gate`);
            await page.screenshot({ path: path.join(outDir, `checkout-blocked-${viewport.width}.png`), fullPage: true });
            await context.close();
            notes.push(`${viewport.width}px ok`);
          }

          // The gate must not block a legitimate cart: save the unavailable
          // lines and confirm the ordinary checkout form remains reachable.
          await prisma.cartItem.updateMany({
            where: {
              cartId: cart.id,
              productId: {
                in: [
                  partialStockProduct.id,
                  outOfStockProduct.id,
                  variantUnavailableProduct.id,
                  variantRequiredProduct.id,
                  productUnavailable.id,
                  vendorUnavailable.id
                ]
              }
            },
            data: { savedForLater: true }
          });
          const positiveContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await positiveContext.addCookies([{ name: SESSION_COOKIE, value: token, url: BASE }]);
          const positivePage = await positiveContext.newPage();
          await positivePage.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
          const submitButton = positivePage.getByRole("button", { name: "Review order and choose payment" });
          await submitButton.waitFor({ timeout: 20_000 });
          assert(!(await submitButton.isDisabled()), "an all-available active cart was blocked from checkout");
          await positivePage.screenshot({
            path: path.join(outDir, "checkout-available-1440.png"),
            fullPage: true
          });
          await positiveContext.close();
          notes.push("available-cart checkout reachable");
        } finally {
          await browser.close();
        }
        return `UI assertions passed at ${notes.join(", ")}; screenshots in qa-artifacts/cart-availability`;
      });
    }

    exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
  } finally {
    await prisma.orderItem.deleteMany({ where: { order: { customerId } } }).catch(() => undefined);
    await prisma.order.deleteMany({ where: { customerId } }).catch(() => undefined);
    await prisma.cartItem.deleteMany({ where: { id: { in: created.cartItemIds } } }).catch(() => undefined);
    await prisma.cart.deleteMany({ where: { id: { in: created.cartIds } } }).catch(() => undefined);
    await prisma.productImage.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.inventoryStock.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.productVariant.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { id: { in: created.productIds } } }).catch(() => undefined);
    await prisma.vendor.deleteMany({ where: { id: { in: created.vendorIds } } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: { in: created.categoryIds } } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { id: { in: created.sessionIds } } }).catch(() => undefined);
    await prisma.userRole.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
    for (const roleId of created.roleIds) {
      const references = await prisma.userRole.count({ where: { roleId } }).catch(() => 0);
      if (references === 0) await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = exitCode;
}

void main().catch((error) => {
  console.error(`TEST_RUN_FAILED ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
