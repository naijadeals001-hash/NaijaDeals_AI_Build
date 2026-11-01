/**
 * NaijaDrive end-to-end verification against a running local server.
 *
 * Usage:
 *   1. npm run prisma:seed
 *   2. Start the app on http://localhost:3001 with NODE_ENV=development.
 *   3. TEST_BASE_URL=http://localhost:3001 npx tsx scripts/drive-tests.ts
 *
 * The suite books real rides in the local database, so it cancels or completes
 * every ride it creates. It never claims a live dispatch, map or card payment.
 */

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3001").replace(/\/$/, "");

type Json = Record<string, any>;

class Client {
  private cookies = new Map<string, string>();

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async request(
    path: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
  ) {
    const headers: Record<string, string> = { Origin: BASE, ...(options.headers ?? {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual"
    });

    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookies) {
      const pair = entry.split(";")[0];
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }

  get(path: string) {
    return this.request(path);
  }

  post(path: string, body?: unknown) {
    return this.request(path, { method: "POST", body });
  }

  patch(path: string, body?: unknown) {
    return this.request(path, { method: "PATCH", body });
  }

  del(path: string) {
    return this.request(path, { method: "DELETE" });
  }

  async login(email: string, password: string) {
    const result = await this.post("/api/auth/login", { email, password });
    assert(result.status === 200, `login ${email} failed: ${result.status} ${JSON.stringify(result.body)}`);
    return result.body.user as Json;
  }

  async register(name: string, email: string) {
    const result = await this.post("/api/auth/register", {
      name,
      email,
      password: "DrivePass123!"
    });
    assert(result.status === 201, `register ${email} failed: ${result.status} ${JSON.stringify(result.body)}`);
    return result.body.user as Json;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isStatus(result: { status: number; body?: unknown }, expected: number, label: string) {
  assert(
    result.status === expected,
    `${label}: expected HTTP ${expected}, got ${result.status} ${JSON.stringify(result.body)}`
  );
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

async function step(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, detail: `${Date.now() - started}ms` });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail: message });
    console.error(`FAIL  ${name}\n      ${message}`);
  }
}

function walletBalances(wallet: Json) {
  return {
    available: BigInt(String(wallet.availableKobo ?? 0)),
    held: BigInt(String(wallet.heldKobo ?? 0))
  };
}

async function main() {
  const guest = new Client();
  const customer = new Client();
  const other = new Client();
  const driver1 = new Client();
  const driver2 = new Client();
  const admin = new Client();

  console.log(`NaijaDrive suite against ${BASE}\n`);

  await customer.login("customer@naijadeals.local", "CustomerPass123!");
  await driver1.login("driver@naijadeals.local", "DriverPass123!");
  await driver2.login("driver2@naijadeals.local", "DriverPass123!");
  await admin.login("admin@naijadeals.local", "AdminPass123!");
  await other.register("Cross Account Rider", `cross-${Date.now()}@naijadeals.local`);

  let walletQuote: Json | null = null;
  let walletRideId = "";
  let winningDriver: Client | null = null;

  await step("Quote is computed from Lagos places and returns integer kobo", async () => {
    const response = await guest.get("/api/drive/quote?pickup=computer-village&dropoff=maryland&vehicleClass=bike");
    isStatus(response, 200, "quote");
    const quote = response.body as Json;
    assert(Number.isInteger(quote.fareKobo), `fare is not an integer: ${quote.fareKobo}`);
    assert(quote.fareKobo > 0, "fare must be positive");
    assert(quote.distanceMeters > 0, "distance must be positive");
    assert(quote.currency === "NGN", `currency should be NGN, got ${quote.currency}`);
    assert(quote.vehicleClass.id === "bike", "quote did not return the chosen class");

    // The itemised fare must reconcile exactly to the number the rider is quoted.
    const breakdown = quote.breakdown;
    assert(breakdown, "quote is missing a fare breakdown");
    const itemised =
      breakdown.baseKobo + breakdown.distanceKobo + breakdown.timeKobo + breakdown.adjustmentKobo;
    assert(
      itemised === quote.fareKobo,
      `breakdown ${JSON.stringify(breakdown)} sums to ${itemised}, not ${quote.fareKobo}`
    );
    assert(Number.isInteger(breakdown.adjustmentKobo), "rounding adjustment must be integer kobo");

    walletQuote = quote;
  });

  await step("Quote rejects the same pick-up and drop-off", async () => {
    const response = await guest.get("/api/drive/quote?pickup=ajah&dropoff=ajah&vehicleClass=economy");
    isStatus(response, 400, "same place quote");
  });

  await step("Quote rejects an unknown vehicle class", async () => {
    const response = await guest.get("/api/drive/quote?pickup=ajah&dropoff=maryland&vehicleClass=helicopter");
    isStatus(response, 400, "unknown class quote");
  });

  await step("Anonymous rider cannot request a ride", async () => {
    const response = await guest.post("/api/drive/rides", {
      pickupId: "computer-village",
      dropoffId: "maryland",
      vehicleClass: "bike",
      paymentMethod: "cash"
    });
    isStatus(response, 401, "anonymous request");
  });

  const before = walletBalances((await customer.get("/api/wallet")).body as Json);

  await step("Customer requests a wallet ride and the fare is held", async () => {
    const response = await customer.post("/api/drive/rides", {
      pickupId: "computer-village",
      dropoffId: "maryland",
      vehicleClass: "bike",
      paymentMethod: "wallet"
    });
    isStatus(response, 201, "wallet ride request");
    const ride = response.body as Json;
    walletRideId = ride.id;
    assert(ride.paymentStatus === "held", `expected held payment, got ${ride.paymentStatus}`);
    assert(String(ride.fareKobo) === String(walletQuote?.fareKobo), "server fare differs from the public quote");

    const after = walletBalances((await customer.get("/api/wallet")).body as Json);
    const fare = BigInt(String(ride.fareKobo));
    assert(
      before.available - after.available === fare,
      `available balance did not drop by the fare (${before.available} -> ${after.available}, fare ${fare})`
    );
    assert(after.held - before.held === fare, "held balance did not increase by the fare");
    walletQuote = { ...walletQuote, fareKobo: ride.fareKobo };
  });

  await step("A second active ride request is rejected", async () => {
    const response = await customer.post("/api/drive/rides", {
      pickupId: "computer-village",
      dropoffId: "maryland",
      vehicleClass: "bike",
      paymentMethod: "cash"
    });
    isStatus(response, 409, "duplicate active ride");
  });

  await step("Another rider cannot read or cancel the ride", async () => {
    const read = await other.get(`/api/drive/rides/${walletRideId}`);
    isStatus(read, 403, "cross-account read");
    const cancel = await other.post(`/api/drive/rides/${walletRideId}/cancel`, { reason: "nope" });
    isStatus(cancel, 403, "cross-account cancel");
  });

  await step("A non-driver cannot use driver endpoints", async () => {
    const board = await customer.get("/api/drive/driver/rides");
    isStatus(board, 403, "customer driver board");
    const accept = await customer.post(`/api/drive/driver/rides/${walletRideId}/accept`);
    isStatus(accept, 403, "customer accept");
  });

  await step("Only one of two drivers wins the acceptance race", async () => {
    const [first, second] = await Promise.all([
      driver1.post(`/api/drive/driver/rides/${walletRideId}/accept`),
      driver2.post(`/api/drive/driver/rides/${walletRideId}/accept`)
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    assert(
      statuses[0] === 200 && statuses[1] === 409,
      `expected one 200 and one 409, got ${first.status} and ${second.status}`
    );
    const winner = first.status === 200 ? first : second;
    winningDriver = first.status === 200 ? driver1 : driver2;
    assert((winner.body as Json).status === "driver_assigned", "winning ride was not assigned");
  });

  await step("The losing driver cannot advance the ride", async () => {
    assert(winningDriver, "no winning driver from the acceptance race");
    const loser = winningDriver === driver1 ? driver2 : driver1;
    const response = await loser.post(`/api/drive/driver/rides/${walletRideId}/status`, { status: "in_progress" });
    isStatus(response, 403, "loser advances ride");
  });

  await step("Completing before starting is rejected", async () => {
    assert(winningDriver, "no winning driver from the acceptance race");
    const response = await winningDriver.post(`/api/drive/driver/rides/${walletRideId}/status`, {
      status: "completed"
    });
    isStatus(response, 409, "complete before start");
  });

  await step("Driver advances the trip and the wallet fare is released", async () => {
    assert(winningDriver, "no winning driver from the acceptance race");
    const beforeWallet = walletBalances((await winningDriver.get("/api/wallet")).body as Json);

    for (const status of ["driver_arriving", "in_progress", "completed"] as const) {
      const response = await winningDriver.post(`/api/drive/driver/rides/${walletRideId}/status`, { status });
      isStatus(response, 200, `driver status ${status}`);
    }

    const board = (await winningDriver.get("/api/drive/driver/rides")).body as Json;
    const completed = (board.recent as Json[]).find((item) => item.id === walletRideId);
    assert(completed, "completed ride missing from driver history");
    assert(completed.paymentStatus === "paid", `expected paid, got ${completed.paymentStatus}`);

    const afterRider = walletBalances((await customer.get("/api/wallet")).body as Json);
    assert(afterRider.held === BigInt(0), `rider held balance should be zero, got ${afterRider.held}`);

    const afterWallet = walletBalances((await winningDriver.get("/api/wallet")).body as Json);
    const fare = BigInt(String(completed.fareKobo));
    assert(
      afterWallet.available - beforeWallet.available === fare,
      `driver balance did not rise by the fare (${beforeWallet.available} -> ${afterWallet.available}, fare ${fare})`
    );
  });

  await step("Completing the same trip again does not double-pay", async () => {
    assert(winningDriver, "no winning driver from the acceptance race");
    const beforeWallet = walletBalances((await winningDriver.get("/api/wallet")).body as Json);
    const response = await winningDriver.post(`/api/drive/driver/rides/${walletRideId}/status`, {
      status: "completed"
    });
    isStatus(response, 200, "duplicate completion");
    assert((response.body as Json).paymentStatus === "paid", "duplicate completion changed payment state");
    const afterWallet = walletBalances((await winningDriver.get("/api/wallet")).body as Json);
    assert(
      afterWallet.available === beforeWallet.available,
      "duplicate completion paid the driver twice"
    );
  });

  let refundRideId = "";
  await step("Cancelling a wallet ride returns the hold to the rider", async () => {
    const beforeCancel = walletBalances((await customer.get("/api/wallet")).body as Json);
    const request = await customer.post("/api/drive/rides", {
      pickupId: "yaba-tejuosho",
      dropoffId: "lekki-phase-1",
      vehicleClass: "bike",
      paymentMethod: "wallet"
    });
    isStatus(request, 201, "refund ride request");
    const ride = request.body as Json;
    refundRideId = ride.id;

    const cancel = await customer.post(`/api/drive/rides/${ride.id}/cancel`, { reason: "Plan changed" });
    isStatus(cancel, 200, "rider cancel");
    assert((cancel.body as Json).paymentStatus === "refunded", "cancelled ride was not marked refunded");

    const afterCancel = walletBalances((await customer.get("/api/wallet")).body as Json);
    assert(afterCancel.available === beforeCancel.available, "available balance was not restored");
    assert(afterCancel.held === beforeCancel.held, "held balance was not restored");
  });

  await step("Cancelling the same ride twice is idempotent", async () => {
    const response = await customer.post(`/api/drive/rides/${refundRideId}/cancel`, { reason: "Again" });
    isStatus(response, 200, "duplicate cancel");
  });

  let cashRideId = "";
  await step("A cash ride completes with payment due until the driver records cash", async () => {
    const request = await customer.post("/api/drive/rides", {
      pickupId: "surulere",
      dropoffId: "gbagada",
      vehicleClass: "comfort",
      paymentMethod: "cash"
    });
    isStatus(request, 201, "cash ride request");
    const ride = request.body as Json;
    cashRideId = ride.id;
    assert(ride.paymentStatus === "pending", "cash ride should start pending");

    const accept = await driver2.post(`/api/drive/driver/rides/${ride.id}/accept`);
    isStatus(accept, 200, "cash ride accept");
    for (const status of ["driver_arriving", "in_progress", "completed"] as const) {
      const response = await driver2.post(`/api/drive/driver/rides/${ride.id}/status`, { status });
      isStatus(response, 200, `cash ride status ${status}`);
    }

    const board = (await driver2.get("/api/drive/driver/rides")).body as Json;
    const completed = (board.recent as Json[]).find((item) => item.id === ride.id);
    assert(completed, "cash ride missing from history");
    assert(completed.paymentStatus === "pending", "cash ride should not be marked paid on completion");

    const cash = await driver2.post(`/api/drive/driver/rides/${ride.id}/cash`);
    isStatus(cash, 200, "record cash");
    assert((cash.body as Json).paymentStatus === "paid", "cash was not recorded");

    const again = await driver2.post(`/api/drive/driver/rides/${ride.id}/cash`);
    isStatus(again, 200, "record cash twice");
    assert((again.body as Json).paymentStatus === "paid", "duplicate cash recording changed state");
  });

  await step("A driver can release an accepted ride back to the queue", async () => {
    const request = await customer.post("/api/drive/rides", {
      pickupId: "maryland",
      dropoffId: "apapa",
      vehicleClass: "economy",
      paymentMethod: "cash"
    });
    isStatus(request, 201, "release ride request");
    const ride = request.body as Json;
    const accept = await driver1.post(`/api/drive/driver/rides/${ride.id}/accept`);
    isStatus(accept, 200, "release ride accept");
    const release = await driver1.post(`/api/drive/driver/rides/${ride.id}/release`, { reason: "Vehicle issue" });
    isStatus(release, 200, "release ride");
    assert((release.body as Json).status === "requested", "released ride did not return to requested");
    assert((release.body as Json).driver === null, "released ride still has a driver");
    const cancel = await customer.post(`/api/drive/rides/${ride.id}/cancel`, { reason: "Cleanup" });
    isStatus(cancel, 200, "cleanup cancel");
  });

  await step("A non-admin cannot list or cancel rides in the Control Center", async () => {
    const list = await customer.get("/api/admin/rides");
    isStatus(list, 403, "customer admin rides");
    const cancel = await customer.post(`/api/admin/rides/${cashRideId}/cancel`, { reason: "nope" });
    isStatus(cancel, 403, "customer admin cancel");
  });

  await step("The Control Center lists rides and can cancel a rider's live ride", async () => {
    const list = await admin.get("/api/admin/rides");
    isStatus(list, 200, "admin rides");
    assert(Array.isArray((list.body as Json).rides), "admin rides payload missing rides");

    const request = await customer.post("/api/drive/rides", {
      pickupId: "ikeja-city-mall",
      dropoffId: "maryland",
      vehicleClass: "xl",
      paymentMethod: "wallet"
    });
    isStatus(request, 201, "admin cancel target request");
    const ride = request.body as Json;

    const cancel = await admin.post(`/api/admin/rides/${ride.id}/cancel`, { reason: "Operations check" });
    isStatus(cancel, 200, "admin cancel");
    assert((cancel.body as Json).status === "cancelled", "admin cancel did not cancel the ride");
    assert((cancel.body as Json).paymentStatus === "refunded", "admin cancel did not refund the hold");
  });

  await step("Rider fare cannot be quoted across an invalid route", async () => {
    const response = await guest.get("/api/drive/quote?pickup=unknown-place&dropoff=ajah&vehicleClass=economy");
    isStatus(response, 400, "unknown place quote");
  });

  await step("Saved places: create, list, rename and delete are scoped to the account", async () => {
    const stamp = Date.now();
    const created = await customer.post("/api/drive/places", {
      nickname: `Mum's place ${stamp}`,
      placeId: "ikeja-city-mall"
    });
    isStatus(created, 201, "create saved place");
    const savedId = (created.body as Json).id as string;

    const list = await customer.get("/api/drive/places");
    isStatus(list, 200, "list saved places");
    assert(
      (list.body as Json[]).some((place) => place.id === savedId),
      "created saved place is missing from the list"
    );

    const renamed = await customer.patch(`/api/drive/places/${savedId}`, {
      nickname: `Office ${stamp}`
    });
    isStatus(renamed, 200, "rename saved place");
    assert(
      String((renamed.body as Json).nickname).startsWith("Office"),
      "saved-place rename did not apply"
    );

    const otherList = await other.get("/api/drive/places");
    isStatus(otherList, 200, "other account list saved places");
    assert(
      !(otherList.body as Json[]).some((place) => place.id === savedId),
      "saved place leaked into another account"
    );

    const otherDelete = await other.del(`/api/drive/places/${savedId}`);
    isStatus(otherDelete, 404, "cross-account saved-place delete blocked");

    const deleted = await customer.del(`/api/drive/places/${savedId}`);
    isStatus(deleted, 200, "delete saved place");
  });

  await step("Saved places reject an unknown landmark and a duplicate nickname", async () => {
    const unknown = await customer.post("/api/drive/places", {
      nickname: `Nowhere ${Date.now()}`,
      placeId: "not-a-bookable-place"
    });
    isStatus(unknown, 400, "unknown landmark saved-place");

    const stamp = Date.now();
    const first = await customer.post("/api/drive/places", {
      nickname: `Dup ${stamp}`,
      placeId: "maryland"
    });
    isStatus(first, 201, "first duplicate-check saved place");
    const duplicate = await customer.post("/api/drive/places", {
      nickname: `Dup ${stamp}`,
      placeId: "apapa"
    });
    isStatus(duplicate, 409, "duplicate saved-place nickname");
    await customer.del(`/api/drive/places/${(first.body as Json).id}`);
  });

  await step("Acceptance sets a response deadline that clears once the trip is moving", async () => {
    const request = await customer.post("/api/drive/rides", {
      pickupId: "maryland",
      dropoffId: "apapa",
      vehicleClass: "economy",
      paymentMethod: "cash"
    });
    isStatus(request, 201, "deadline ride request");
    const ride = request.body as Json;

    const accept = await driver1.post(`/api/drive/driver/rides/${ride.id}/accept`);
    isStatus(accept, 200, "deadline ride accept");
    const accepted = accept.body as Json;
    assert(accepted.assignmentExpiresAt, "acceptance did not set assignmentExpiresAt");
    const delta = new Date(accepted.assignmentExpiresAt).getTime() - Date.now();
    assert(
      delta > 8 * 60 * 1000 && delta <= 10 * 60 * 1000 + 10_000,
      `acceptance deadline is not about ten minutes ahead (${delta}ms)`
    );

    const arriving = await driver1.post(`/api/drive/driver/rides/${ride.id}/status`, {
      status: "driver_arriving"
    });
    isStatus(arriving, 200, "deadline ride arriving");
    assert((arriving.body as Json).assignmentExpiresAt, "arrival did not reset the deadline");

    const started = await driver1.post(`/api/drive/driver/rides/${ride.id}/status`, {
      status: "in_progress"
    });
    isStatus(started, 200, "deadline ride started");
    assert(
      (started.body as Json).assignmentExpiresAt === null,
      "a moving trip should clear the assignment deadline"
    );

    const completed = await driver1.post(`/api/drive/driver/rides/${ride.id}/status`, {
      status: "completed"
    });
    isStatus(completed, 200, "deadline ride completed");
  });

  await step("Cancelling after the driver sets off charges no invented fee", async () => {
    const before = walletBalances((await customer.get("/api/wallet")).body as Json);
    const request = await customer.post("/api/drive/rides", {
      pickupId: "yaba-tejuosho",
      dropoffId: "lekki-phase-1",
      vehicleClass: "economy",
      paymentMethod: "wallet"
    });
    isStatus(request, 201, "late cancel request");
    const ride = request.body as Json;

    const accept = await driver1.post(`/api/drive/driver/rides/${ride.id}/accept`);
    isStatus(accept, 200, "late cancel accept");
    const arriving = await driver1.post(`/api/drive/driver/rides/${ride.id}/status`, {
      status: "driver_arriving"
    });
    isStatus(arriving, 200, "late cancel arriving");

    const cancel = await customer.post(`/api/drive/rides/${ride.id}/cancel`, {
      reason: "Plans changed after the driver set off"
    });
    isStatus(cancel, 200, "late cancel");
    const cancelled = cancel.body as Json;
    assert(
      cancelled.paymentStatus === "refunded",
      "late cancellation should refund the full hold while the fee policy is undefined"
    );
    assert(
      String(cancelled.cancellationFeeKobo ?? "0") === "0",
      "no cancellation fee may be charged while the policy is undefined"
    );

    const after = walletBalances((await customer.get("/api/wallet")).body as Json);
    assert(after.available === before.available, "available balance was not fully restored");
    assert(after.held === before.held, "held balance was not fully restored");
  });

  const passed = results.filter((item) => item.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    console.error(JSON.stringify(results.filter((item) => !item.ok), null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
