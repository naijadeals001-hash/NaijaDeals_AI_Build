/**
 * NaijaDrive assignment-deadline UI verification against the running preview.
 *
 * Creates a real cash ride through the API, has an approved driver accept it, then
 * signs that driver in through a browser and asserts the live deadline countdown is
 * actually rendered on the driver board. Cleans up the ride afterwards.
 *
 * Usage: node scripts/drive-deadline-qa.mjs
 * Env:   QA_BASE_URL (default http://localhost:3100)
 */
import { chromium } from "playwright-core";

const baseUrl = (process.env.QA_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const customerEmail = process.env.QA_CUSTOMER_EMAIL ?? "customer@naijadeals.local";
const customerPassword = process.env.QA_CUSTOMER_PASSWORD ?? "CustomerPass123!";
const driverEmail = process.env.QA_DRIVER_EMAIL ?? "driver@naijadeals.local";
const driverPassword = process.env.QA_DRIVER_PASSWORD ?? "DriverPass123!";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} -- ${detail}`);
}

class Api {
  cookies = new Map();
  async call(path, options = {}) {
    const headers = { Origin: baseUrl, ...(options.headers ?? {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    for (const entry of response.headers.getSetCookie?.() ?? []) {
      const pair = entry.split(";")[0];
      const split = pair.indexOf("=");
      if (split > 0) this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }
  login(email, password) {
    return this.call("/api/auth/login", { method: "POST", body: { email, password } });
  }
}

const customer = new Api();
const driver = new Api();
const consoleErrors = [];
const riderConsoleErrors = [];
let rideId = "";

const browser = await chromium.launch({ executablePath: chromePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

try {
  const customerLogin = await customer.login(customerEmail, customerPassword);
  const driverLogin = await driver.login(driverEmail, driverPassword);
  record(
    "Set-up accounts sign in through the API",
    customerLogin.status === 200 && driverLogin.status === 200,
    `customer ${customerLogin.status}, driver ${driverLogin.status}`
  );

  const request = await customer.call("/api/drive/rides", {
    method: "POST",
    body: {
      pickupId: "maryland",
      dropoffId: "apapa",
      vehicleClass: "economy",
      paymentMethod: "cash"
    }
  });
  rideId = request.body?.id ?? "";
  record("A real ride is requested for the deadline check", request.status === 201, `HTTP ${request.status}`);

  const accept = await driver.call(`/api/drive/driver/rides/${rideId}/accept`, { method: "POST" });
  record("The driver accepts and the server sets a deadline", accept.status === 200 && Boolean(accept.body?.assignmentExpiresAt), `HTTP ${accept.status}`);

  await page.goto(`${baseUrl}/login?next=/driver`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(driverEmail);
  await page.getByLabel("Password").fill(driverPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/driver", { timeout: 20000 });

  const heading = page.getByRole("heading", { name: "Driver board" });
  await heading.waitFor({ timeout: 15000 });
  record("Driver board renders this driver's active ride", await heading.isVisible(), "heading visible");

  const countdown = page.getByText(/left to update this ride/);
  await countdown.waitFor({ timeout: 15000 });
  const text = await countdown.first().innerText();
  const hasSeconds = /\d+\s*s left to update this ride/.test(text);
  record("The live deadline countdown is rendered", hasSeconds, text.slice(0, 80));

  // Prove it is a live clock, not a static number: the seconds should change.
  const first = await countdown.first().innerText();
  await page.waitForTimeout(2200);
  const second = await countdown.first().innerText();
  record("The countdown ticks down between refreshes", first !== second, `${first.slice(0, 24)} -> ${second.slice(0, 24)}`);

  record("No console errors on the driver board", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  // The rider must see the same deadline, from their own account.
  const riderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const riderPage = await riderContext.newPage();
  riderPage.on("console", (message) => {
    if (message.type() === "error") riderConsoleErrors.push(message.text());
  });
  riderPage.on("pageerror", (error) => riderConsoleErrors.push(String(error)));
  try {
    await riderPage.goto(`${baseUrl}/login?next=/naijadrive`, { waitUntil: "networkidle" });
    await riderPage.getByLabel("Email").fill(customerEmail);
    await riderPage.getByLabel("Password").fill(customerPassword);
    await riderPage.getByRole("button", { name: "Sign in" }).click();
    await riderPage.waitForURL("**/naijadrive", { timeout: 20000 });

    const riderDeadline = riderPage.getByText(/Your driver has .* to (arrive|start the trip)/);
    await riderDeadline.waitFor({ timeout: 15000 });
    const riderText = await riderDeadline.first().innerText();
    record("The rider sees the driver's response deadline", /\d+\s*s|\d+ min/.test(riderText), riderText.slice(0, 80));
    record("No console errors on the rider view", riderConsoleErrors.length === 0, riderConsoleErrors.slice(0, 3).join(" | "));
  } finally {
    await riderContext.close();
  }
} catch (error) {
  record("Driver deadline UI flow completed", false, error instanceof Error ? error.message : String(error));
} finally {
  await context.close();
  await browser.close();

  // Clean up so repeated runs do not leave a ride stuck in the queue.
  if (rideId) {
    await driver.call(`/api/drive/driver/rides/${rideId}/release`, { method: "POST", body: { reason: "QA cleanup" } });
    await customer.call(`/api/drive/rides/${rideId}/cancel`, { method: "POST", body: { reason: "QA cleanup" } });
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
