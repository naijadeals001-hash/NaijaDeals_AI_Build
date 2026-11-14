/**
 * Service-worker navigation race acceptance.
 *
 * Verifies the production service-worker lifecycle against a real Chromium
 * instance and a real production build:
 *
 *   A. A fresh install claims the page without reloading it.
 *   B. A returning session reuses the controller without reloading.
 *   C. A new worker installs into `waiting`, shows the update banner and does
 *      not replace the controller until the user accepts the update.
 *   D. Accepting the update reloads exactly once, then the new worker controls
 *      the page and the banner disappears (no reload loop).
 *   E. Offline navigation still falls back to the precached /offline page and
 *      recovers when the network returns.
 *   F. The previously failing immediate home -> Shop click is repeated 10 times
 *      in fresh browser contexts (fresh first-install claim each time). Every
 *      trial must reach /naijashop in the same document, with no aborted
 *      document navigation and no reload. Cancelled Next router-prefetch/RSC
 *      requests are recorded as diagnostics; they are not document failures
 *      when the target page renders in the same document.
 *
 * The test origin is a small proxy in front of `next start`. It serves a
 * controlled `/sw.js` so an update can be simulated deterministically, while
 * every other request reaches the real production build. The controlled worker
 * is the repository's actual `public/sw.js`; the update variant only appends a
 * comment so the browser sees changed script bytes. No product code is stubbed.
 *
 * Usage:
 *   node scripts/sw-navigation-race-tests.cjs
 *
 * Environment:
 *   NEXT_DIST_DIR        isolated build directory (default `.next-sw-race`)
 *   SW_TEST_SKIP_BUILD=1 reuse that build instead of rebuilding
 *   SW_TEST_REBUILD=1    force a rebuild even if BUILD_ID exists
 *   SW_TEST_DATABASE_URL explicitly selected TEST/REVIEW database
 *   CHROME_PATH          browser executable override
 *
 * Safety: refuses production-looking database names, prints only the database
 * name, never modifies the official activation suite or the 3047 build.
 */
const { chromium } = require("playwright-core");
const { spawn, spawnSync } = require("node:child_process");
const { createServer: createNetServer } = require("node:net");
const { createServer: createHttpServer, request: httpRequest } = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

const ROOT = process.cwd();
const BUILD_DIR = process.env.NEXT_DIST_DIR || ".next-sw-race";
const ARTIFACT_DIR = path.join(ROOT, "qa-artifacts", "visual", "sw-race");
const CHROME_PATH = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const RACE_TRIALS = 10;
// Controlled delivery latency for /sw.js during the race trials. It widens the
// real install/claim window so the click reliably overlaps it; it does not
// change product code and is not used to hide a failure.
const SW_INSTALL_DELAY_MS = 220;

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

let passed = 0;
const failures = [];
const evidence = [];

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
  evidence.push({ name, status: ok ? "PASS" : "FAIL", detail: detail || "" });
}

function info(message) {
  console.log(`      ${message}`);
}

const REFUSED_DATABASES = new Set([
  "naijadeals_core",
  "naijadeals_prod",
  "naijadeals_production",
  "naijadeals_live",
  "naijadeals_shared",
  "postgres",
  "template0",
  "template1"
]);

function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function resolveDatabaseUrl() {
  const explicit = process.env.SW_TEST_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const current = process.env.DATABASE_URL?.trim();
  if (current && !REFUSED_DATABASES.has(databaseName(current))) return current;

  const envPath = path.join(ROOT, ".env");
  const envText = fs.readFileSync(envPath, "utf8");
  const line = envText.split(/\r?\n/).find((entry) => entry.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("No DATABASE_URL was found in .env.");
  const raw = line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
  const url = new URL(raw);
  url.pathname = "/naijadeals_review";
  return url.toString();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcess(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function runLogged(command, args, env, logPath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(logPath, { flags: "a" });
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.pipe(stream);
    child.stderr.pipe(stream);
    child.on("error", reject);
    child.on("exit", (code) => {
      stream.end();
      resolve(code ?? 1);
    });
  });
}

/**
 * Next adds the isolated distDir to tsconfig.json's include list. Restore the
 * exact pre-build file when (and only when) that insertion is the sole change,
 * so running this acceptance script leaves the working tree as it found it.
 */
function restoreTsconfigAfterBuild(before) {
  if (before === null) return;
  const tsconfigPath = path.join(ROOT, "tsconfig.json");
  const current = fs.readFileSync(tsconfigPath, "utf8");
  if (current === before) return;
  try {
    const original = JSON.parse(before);
    const built = JSON.parse(current);
    const entry = `${BUILD_DIR}/types/**/*.ts`;
    const originalCount = (original.include || []).filter((value) => value === entry).length;
    const builtCount = (built.include || []).filter((value) => value === entry).length;
    if (builtCount === originalCount + 1) {
      const stripped = { ...built, include: built.include.filter((value) => value !== entry) };
      if (JSON.stringify(stripped) === JSON.stringify(original)) {
        fs.writeFileSync(tsconfigPath, before);
        info("restored tsconfig.json after the isolated build added its distDir include");
        return;
      }
    }
  } catch {
    /* fall through to the warning */
  }
  info("WARNING: tsconfig.json changed during the build; inspect it before committing");
}

function startServer(args, env, logPath) {
  const stream = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn("npx", args, {
    cwd: ROOT,
    env,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  return child;
}

async function waitForHttp(url, child, logPath, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`The isolated server exited with code ${child.exitCode}. See ${logPath}.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch {
      /* still starting */
    }
    await delay(1_000);
  }
  throw new Error(`The isolated server did not become ready. See ${logPath}.`);
}

/**
 * Test-origin proxy: controlled /sw.js, optional offline mode that resets the
 * upstream socket (a real network failure for the page/service worker), and
 * pass-through for every other request.
 */
function startProxy(port, upstreamPort, initialSwSource) {
  const state = {
    swSource: initialSwSource,
    swDelayMs: 0,
    offline: false
  };

  const server = createHttpServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/sw.js") {
      const send = () => {
        const body = Buffer.from(state.swSource, "utf8");
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Service-Worker-Allowed": "/",
          "Content-Length": body.length
        });
        res.end(body);
      };
      if (state.swDelayMs > 0) setTimeout(send, state.swDelayMs);
      else send();
      return;
    }

    if (state.offline) {
      // A destroyed socket is a network failure, not a synthetic response, so
      // the worker's fetch().catch() offline path is exercised.
      req.socket.destroy();
      return;
    }

    const headers = { ...req.headers, host: `127.0.0.1:${upstreamPort}` };
    const proxyRequest = httpRequest(
      {
        hostname: "127.0.0.1",
        port: upstreamPort,
        path: req.url,
        method: req.method,
        headers
      },
      (upstreamResponse) => {
        res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(res);
      }
    );
    proxyRequest.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("upstream unavailable");
      } else {
        res.destroy();
      }
    });
    req.pipe(proxyRequest);
  });

  return {
    state,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve(true));
      }),
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve(true));
      })
  };
}

const RACE_INIT_SCRIPT = () => {
  const LOAD_KEY = "__sw_race_doc_loads";
  let loads = 1;
  try {
    loads = Number(sessionStorage.getItem(LOAD_KEY) || "0") + 1;
    sessionStorage.setItem(LOAD_KEY, String(loads));
  } catch {
    /* storage can be unavailable in a locked-down context */
  }
  const navigation = performance.getEntriesByType("navigation")[0];
  window.__swRace = {
    docLoads: loads,
    navType: navigation ? navigation.type : "unknown",
    controllerChanges: 0,
    startedAt: Date.now()
  };
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    window.__swRace.controllerChanges += 1;
    window.__swRace.lastControllerChangeAt = Date.now();
  });
};

async function readRaceState(page) {
  return page.evaluate(() => (window.__swRace ? { ...window.__swRace } : null));
}

async function settleFrames(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      })
  );
}

/** Wait until a first-install (or update activation) claim is observable. */
async function waitForController(page, timeout = 30_000) {
  try {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForControllerChange(page, timeout = 10_000) {
  try {
    await page.waitForFunction(() => (window.__swRace?.controllerChanges || 0) > 0, null, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function registrationSnapshot(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      exists: Boolean(registration),
      active: registration?.active?.state ?? null,
      waiting: registration?.waiting?.state ?? null,
      installing: registration?.installing?.state ?? null,
      scope: registration?.scope ?? null,
      controller: Boolean(navigator.serviceWorker.controller)
    };
  });
}

function attachFailureRecorder(page) {
  const record = { requestFailures: [], pageErrors: [], mainFrameNavigations: [], documentRequests: [] };
  page.on("request", (request) => {
    if (request.resourceType() === "document" && request.isNavigationRequest()) {
      record.documentRequests.push(request.url());
    }
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    record.requestFailures.push({
      url: request.url(),
      resourceType: request.resourceType(),
      errorText: failure?.errorText || "unknown failure",
      isNavigation: request.isNavigationRequest(),
      nextRouterPrefetch: request.headers()["next-router-prefetch"] || "",
      rsc: request.headers().rsc || ""
    });
  });
  page.on("pageerror", (error) => record.pageErrors.push(error.message));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && /^https?:/.test(frame.url())) record.mainFrameNavigations.push(frame.url());
  });
  return record;
}

/**
 * A document navigation that aborted is a real navigation failure. Next Link
 * prefetch RSC requests are routinely cancelled when the user navigates, and a
 * cancelled prefetch is not a failed journey. Both are recorded; only document
 * aborts fail the run.
 */
function abortedDocumentNavigations(record) {
  return record.requestFailures.filter(
    (failure) =>
      failure.errorText.includes("ERR_ABORTED") &&
      (failure.resourceType === "document" || failure.isNavigation)
  );
}

function abortedRscRequests(record) {
  return record.requestFailures.filter(
    (failure) => failure.errorText.includes("ERR_ABORTED") && failure.url.includes("_rsc=")
  );
}

async function launchBrowser() {
  const attempts = [];
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    attempts.push(`bundled Chromium: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
  if (fs.existsSync(CHROME_PATH)) {
    try {
      return await chromium.launch({ headless: true, executablePath: CHROME_PATH });
    } catch (error) {
      attempts.push(`Chrome: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }
  throw new Error(`No Chromium browser could be launched (${attempts.join("; ")}).`);
}

(async () => {
  const databaseUrl = resolveDatabaseUrl();
  const database = databaseName(databaseUrl);
  if (REFUSED_DATABASES.has(database)) {
    throw new Error(`Refusing to run against a production-looking database (${database}).`);
  }
  info(`database: ${database} (name only)`);
  info(`build dir: ${BUILD_DIR}`);

  const swSource = fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8");
  const installBlock = swSource.slice(
    swSource.indexOf('addEventListener("install"'),
    swSource.indexOf('addEventListener("activate"')
  );
  const privatePrefixLine = swSource.split(/\r?\n/).find((line) => line.includes("PRIVATE_PREFIXES")) || "";
  check("worker install no longer self-activates an update", installBlock.length > 0 && !installBlock.includes("skipWaiting()"));
  check(
    "worker still activates only on the explicit SKIP_WAITING message",
    /addEventListener\("message"[\s\S]{0,220}SKIP_WAITING[\s\S]{0,120}skipWaiting\(\)/.test(swSource)
  );
  check(
    "private and financial prefixes remain uncached",
    ["/api/", "/admin", "/wallet", "/checkout", "/pay"].every((prefix) => privatePrefixLine.includes(`"${prefix}"`))
  );
  check(
    "GET-only and private-route early returns remain",
    /request\.method !== "GET"\)\s*return/.test(swSource) && /isPrivate\(url\)\)\s*return/.test(swSource)
  );
  check(
    "cache names stay versioned with activation cleanup",
    /const VERSION = "naijadeals-v1"/.test(swSource) && /caches\.delete/.test(swSource)
  );

  const providerSource = fs.readFileSync(path.join(ROOT, "components", "platform", "platform-provider.tsx"), "utf8");
  check(
    "provider captures the pre-registration controller and drops the sessionStorage reload flag",
    providerSource.includes("controllerWasPresent") &&
      providerSource.includes("navigator.serviceWorker.controller") &&
      !providerSource.includes("naijadeals:sw-reloaded")
  );

  const browser = await launchBrowser();
  let upstream = null;
  let proxy = null;
  let context = null;
  try {
    const upstreamPort = await freePort();
    const testPort = await freePort();
    const testBase = `http://127.0.0.1:${testPort}`;
    const serverEnv = {
      ...process.env,
      NEXT_DIST_DIR: BUILD_DIR,
      DATABASE_URL: databaseUrl,
      NEXT_PUBLIC_APP_URL: testBase,
      ENABLE_TEST_PAYMENTS: "false",
      // The full lint/type pass for this repository exceeds Node's 4 GB default
      // old-space on a cold build; the machine has memory available.
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=8192"
    };

    const buildIdPath = path.join(ROOT, BUILD_DIR, "BUILD_ID");
    const buildLog = path.join(ARTIFACT_DIR, "build.log");
    const shouldBuild = process.env.SW_TEST_REBUILD === "1" || !fs.existsSync(buildIdPath) || process.env.SW_TEST_SKIP_BUILD !== "1";
    if (shouldBuild) {
      info("building the isolated production build (log: qa-artifacts/visual/sw-race/build.log)");
      const tsconfigPath = path.join(ROOT, "tsconfig.json");
      const tsconfigBefore = fs.existsSync(tsconfigPath) ? fs.readFileSync(tsconfigPath, "utf8") : null;
      let code;
      try {
        code = await runLogged("npm", ["run", "build"], serverEnv, buildLog);
      } finally {
        restoreTsconfigAfterBuild(tsconfigBefore);
      }
      if (code !== 0) throw new Error(`The isolated build failed with exit code ${code}. See ${buildLog}.`);
      check("isolated production build succeeds", fs.existsSync(buildIdPath), `BUILD_ID ${fs.readFileSync(buildIdPath, "utf8").trim()}`);
    } else {
      check("reusing an existing isolated production build", fs.existsSync(buildIdPath), BUILD_DIR);
    }

    proxy = startProxy(testPort, upstreamPort, swSource);
    await proxy.listen();

    const serverLog = path.join(ARTIFACT_DIR, "next-server.log");
    upstream = startServer(["next", "start", "-p", String(upstreamPort)], serverEnv, serverLog);
    await waitForHttp(`${testBase}/offline`, upstream, serverLog);
    check("isolated production server responds through the test origin", true, testBase);

    // ---- A. Fresh install ------------------------------------------------
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(RACE_INIT_SCRIPT);
    const freshPage = await context.newPage();
    const freshRecord = attachFailureRecorder(freshPage);
    const freshResponse = await freshPage.goto(`${testBase}/`, { waitUntil: "load", timeout: 60_000 });
    check("fresh install: home page loads", freshResponse?.status() === 200, String(freshResponse?.status()));
    const freshControlled = await waitForController(freshPage);
    const freshSawControllerChange = await waitForControllerChange(freshPage);
    await settleFrames(freshPage);
    const freshState = await readRaceState(freshPage);
    const freshSnapshot = await registrationSnapshot(freshPage);
    check("fresh install: worker becomes active and controls the page", freshControlled && freshSnapshot.active === "activated", JSON.stringify(freshSnapshot));
    check("fresh install: clients.claim observed in the same document", freshSawControllerChange && freshState?.controllerChanges >= 1, String(freshState?.controllerChanges));
    check("fresh install: no full-page reload", freshState?.docLoads === 1 && freshState?.navType === "navigate", `docLoads=${freshState?.docLoads} navType=${freshState?.navType}`);
    check(
      "fresh install: no additional document navigation request",
      freshRecord.documentRequests.length === 1,
      `documentRequests=${JSON.stringify(freshRecord.documentRequests)} events=${JSON.stringify(freshRecord.mainFrameNavigations)}`
    );
    check("fresh install: no update banner", (await freshPage.getByText("A new version of NaijaDeals is ready.").count()) === 0);
    check(
      "fresh install: no aborted document navigation",
      abortedDocumentNavigations(freshRecord).length === 0,
      JSON.stringify(abortedDocumentNavigations(freshRecord))
    );
    if (abortedRscRequests(freshRecord).length > 0) {
      info(`fresh install: ${abortedRscRequests(freshRecord).length} cancelled Next prefetch request(s) ignored`);
    }

    // ---- B. Returning session -------------------------------------------
    const returningPage = await context.newPage();
    const returningRecord = attachFailureRecorder(returningPage);
    const returningResponse = await returningPage.goto(`${testBase}/`, { waitUntil: "load", timeout: 60_000 });
    const returningControlled = await waitForController(returningPage);
    await settleFrames(returningPage);
    const returningState = await readRaceState(returningPage);
    check("returning session: home page loads under the existing controller", returningResponse?.status() === 200 && returningControlled, String(returningResponse?.status()));
    check("returning session: no reload and no new controllerchange", returningState?.docLoads === 1 && returningState?.controllerChanges === 0, `docLoads=${returningState?.docLoads} changes=${returningState?.controllerChanges}`);
    check("returning session: no update banner", (await returningPage.getByText("A new version of NaijaDeals is ready.").count()) === 0);
    check("returning session: no aborted document navigation", abortedDocumentNavigations(returningRecord).length === 0);

    // ---- C. Update installs into waiting, without taking over ----------
    const updateMarker = `/* sw-race update ${Date.now()} */`;
    proxy.state.swSource = `${swSource}\n${updateMarker}\n`;
    await returningPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("No service worker registration was found.");
      await registration.update();
    });
    await returningPage.waitForFunction(
      async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return Boolean(registration?.waiting);
      },
      null,
      { timeout: 30_000 }
    );
    await returningPage.getByText("A new version of NaijaDeals is ready.").waitFor({ state: "visible", timeout: 15_000 });
    // Re-read after the banner is rendered: the previous snapshot ran in the
    // gap between the waiting observation and React committing the banner.
    await returningPage.waitForFunction(
      async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.waiting?.state === "installed";
      },
      null,
      { timeout: 15_000 }
    );
    const waitingSnapshot = await registrationSnapshot(returningPage);
    check("update: new worker stays in waiting", waitingSnapshot.waiting === "installed" && waitingSnapshot.active === "activated", JSON.stringify(waitingSnapshot));
    check("update: banner announces the waiting worker", true);
    const beforeUpdateState = await readRaceState(returningPage);
    check("update: waiting worker does not replace the controller early", beforeUpdateState?.docLoads === 1 && beforeUpdateState?.controllerChanges === 0, `docLoads=${beforeUpdateState?.docLoads} changes=${beforeUpdateState?.controllerChanges}`);
    check("update: worker stays waiting until the user accepts", (await registrationSnapshot(returningPage)).waiting === "installed");

    // ---- D. Accepting the update reloads exactly once -------------------
    const reloaded = returningPage.waitForEvent("framenavigated", {
      predicate: (frame) => frame === returningPage.mainFrame(),
      timeout: 30_000
    });
    await returningPage.getByRole("button", { name: "Update now" }).click();
    await reloaded;
    await returningPage.waitForLoadState("load", { timeout: 30_000 });
    await returningPage.waitForFunction(
      async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return Boolean(registration?.active) && !registration.waiting;
      },
      null,
      { timeout: 30_000 }
    );
    await settleFrames(returningPage);
    const afterUpdateState = await readRaceState(returningPage);
    const afterUpdateSnapshot = await registrationSnapshot(returningPage);
    check("update accepted: exactly one document load after the update", afterUpdateState?.docLoads === 2, `docLoads=${afterUpdateState?.docLoads}`);
    check("update accepted: the reload is visible as a reload navigation", afterUpdateState?.docLoads === 2 && afterUpdateState?.navType === "reload", `docLoads=${afterUpdateState?.docLoads} navType=${afterUpdateState?.navType}`);
    check("update accepted: the new worker controls the page", afterUpdateSnapshot.active === "activated" && afterUpdateSnapshot.waiting === null, JSON.stringify(afterUpdateSnapshot));
    check("update accepted: banner clears", (await returningPage.getByText("A new version of NaijaDeals is ready.").count()) === 0);
    // A real round-trip after the reload proves the one-shot guard did not start
    // a reload loop without relying on a fixed sleep.
    await returningPage.evaluate(async () => {
      const response = await fetch("/manifest.webmanifest", { cache: "no-store" });
      if (!response.ok) throw new Error(`manifest ${response.status}`);
    });
    const afterLoopProbe = await readRaceState(returningPage);
    check("update accepted: no reload loop after a follow-up request", afterLoopProbe?.docLoads === 2, String(afterLoopProbe?.docLoads));

    // ---- E. Offline fallback and recovery -------------------------------
    // Warm the offline route's own client chunks first. The worker precaches
    // the /offline document; its static chunks are cache-first and are stored
    // when the page is opened online, which is the returning-user case this
    // check exercises.
    const warmOffline = await returningPage.goto(`${testBase}/offline`, { waitUntil: "load", timeout: 30_000 });
    const warmOfflineHeading = await returningPage.getByRole("heading", { name: "You are offline" }).count();
    check(
      "offline: page loads normally before network loss",
      warmOffline?.status() === 200 && warmOfflineHeading > 0,
      `status=${warmOffline?.status()} heading=${warmOfflineHeading}`
    );
    await returningPage.goto(`${testBase}/`, { waitUntil: "load", timeout: 30_000 });
    proxy.state.offline = true;
    const offlineResponse = await returningPage.goto(`${testBase}/naijashop`, { waitUntil: "load", timeout: 30_000 });
    const offlineHtml = await offlineResponse?.text().catch(() => "");
    const offlineDetails = await returningPage.evaluate(() => ({
      heading: document.querySelector("h1")?.textContent || "",
      controlled: Boolean(navigator.serviceWorker.controller),
      body: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 180)
    }));
    info(`offline body: ${JSON.stringify(offlineDetails)}`);
    const offlineHeading = await returningPage.getByRole("heading", { name: "You are offline" }).count();
    check(
      "offline: navigation is served the precached offline document",
      offlineResponse?.status() === 200 && offlineHtml.includes("You are offline"),
      `status=${offlineResponse?.status()} htmlCopy=${offlineHtml.includes("You are offline")}`
    );
    check(
      "offline: offline page renders after the fallback",
      offlineHeading > 0,
      `offlineHeading=${offlineHeading} details=${JSON.stringify(offlineDetails)}`
    );
    proxy.state.offline = false;
    const recoveryResponse = await returningPage.goto(`${testBase}/`, { waitUntil: "load", timeout: 30_000 });
    const offlineAfterRecovery = await returningPage.getByRole("heading", { name: "You are offline" }).count();
    check("online recovery: network-first navigation serves the real page again", recoveryResponse?.status() === 200 && offlineAfterRecovery === 0, String(recoveryResponse?.status()));

    // ---- F. Immediate home -> Shop, ten fresh installs -----------------
    proxy.state.swDelayMs = SW_INSTALL_DELAY_MS;
    const trials = [];
    for (let trial = 1; trial <= RACE_TRIALS; trial += 1) {
      const trialContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await trialContext.addInitScript(RACE_INIT_SCRIPT);
      const page = await trialContext.newPage();
      const record = attachFailureRecorder(page);
      let trialError = "";
      let clicked = false;
      let state = null;
      let snapshot = null;
      try {
        const response = await page.goto(`${testBase}/`, { waitUntil: "load", timeout: 60_000 });
        if (response?.status() !== 200) throw new Error(`home responded ${response?.status()}`);
        clicked = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href="/naijashop"]'));
          const link = links.find((candidate) => candidate.getClientRects().length > 0) || links[0];
          if (!link) return false;
          link.click();
          return true;
        });
        if (!clicked) throw new Error("The home page rendered no /naijashop link.");
        await page.waitForURL((url) => url.pathname === "/naijashop" || url.pathname.startsWith("/naijashop/"), {
          timeout: 30_000
        });
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 30_000 });
        await waitForController(page, 30_000);
        await settleFrames(page);
        state = await readRaceState(page);
        snapshot = await registrationSnapshot(page);
      } catch (error) {
        trialError = error instanceof Error ? error.message.split("\n")[0] : String(error);
        try {
          state = await readRaceState(page);
          snapshot = await registrationSnapshot(page);
        } catch {
          /* the document may be gone */
        }
      }

      const aborts = abortedDocumentNavigations(record);
      const rscAborts = abortedRscRequests(record);
      const finalUrl = page.url();
      const sameDocument = state?.docLoads === 1;
      const reloaded = state?.navType === "reload";
      // A full-document navigation before hydration is a legitimate way to reach
      // Shop (docLoads=2, navType "navigate"); a reload triggered by the worker
      // is not (navType "reload"), and more than one extra load is a loop.
      const ok =
        !trialError &&
        clicked &&
        finalUrl.includes("/naijashop") &&
        !reloaded &&
        (state?.docLoads === 1 || state?.docLoads === 2) &&
        snapshot?.controller === true &&
        aborts.length === 0;

      trials.push({
        trial,
        ok,
        finalUrl,
        mode: sameDocument ? "same-document" : "full-document",
        docLoads: state?.docLoads ?? null,
        navType: state?.navType ?? null,
        controllerChanges: state?.controllerChanges ?? null,
        controlled: snapshot?.controller ?? false,
        aborts,
        rscAborts,
        trialError
      });
      console.log(
        `      trial ${trial}/${RACE_TRIALS}: ${ok ? "PASS" : "FAIL"} ` +
          `mode=${sameDocument ? "same-document" : "full-document"} docLoads=${state?.docLoads ?? "?"} ` +
          `navType=${state?.navType ?? "?"} controllerChange=${state?.controllerChanges ?? "?"} ` +
          `aborts=${aborts.length} rscCancels=${rscAborts.length} url=${finalUrl}${trialError ? ` error=${trialError}` : ""}`
      );
      await trialContext.close();
    }
    proxy.state.swDelayMs = 0;
    const passedTrials = trials.filter((trial) => trial.ok).length;
    const sameDocumentTrials = trials.filter((trial) => trial.mode === "same-document").length;
    const anyAbort = trials.flatMap((trial) => trial.aborts);
    const anyRscAbort = trials.flatMap((trial) => trial.rscAborts);
    check(
      `immediate home -> Shop: ${passedTrials}/${RACE_TRIALS} navigations complete without abort or reload`,
      passedTrials === RACE_TRIALS,
      `${passedTrials}/${RACE_TRIALS}`
    );
    check(
      `immediate home -> Shop: ${sameDocumentTrials}/${RACE_TRIALS} stayed in the same document`,
      sameDocumentTrials >= 1,
      `${sameDocumentTrials}/${RACE_TRIALS}`
    );
    check("immediate home -> Shop: zero aborted document navigations", anyAbort.length === 0, JSON.stringify(anyAbort.slice(0, 3)));
    check(
      "immediate home -> Shop: every trial ended with an active controller",
      trials.every((trial) => trial.controlled),
      trials.map((trial) => trial.controlled).join(",")
    );
    check(
      "immediate home -> Shop: first-install claim observed in a surviving document",
      trials.some((trial) => trial.mode === "same-document" && trial.controllerChanges >= 1),
      trials.map((trial) => `${trial.mode}:${trial.controllerChanges}`).join(",")
    );
    info(
      `immediate home -> Shop: ${anyRscAbort.length} cancelled Next RSC prefetch request(s) recorded; ` +
        `non-prefetch=${anyRscAbort.filter((abort) => !abort.nextRouterPrefetch).length}`
    );

    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "sw-race-results.json"),
      JSON.stringify({ database, buildDir: BUILD_DIR, trials, checks: evidence }, null, 2)
    );
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (proxy) await proxy.close().catch(() => {});
    stopProcess(upstream);
  }

  console.log("");
  if (failures.length === 0) {
    console.log(`RESULT: ${passed} checks passed, 0 failed.`);
    process.exitCode = 0;
  } else {
    console.error(`RESULT: ${passed} checks passed, ${failures.length} failed.`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(`FATAL: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
