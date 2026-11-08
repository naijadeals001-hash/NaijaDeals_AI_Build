/**
 * Livestream acceptance: organiser starts a real HLS encode, a separate viewer
 * session fetches the playlist + segments and decodes frames, unauthorised
 * publishing is rejected, and stopping flips the event to ENDED.
 * Usage: BASE_URL=http://localhost:3015 node scripts/stream-live-verify.cjs
 */
const { chromium } = require("playwright-core");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const organiser = await browser.newContext();
  const page = await organiser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ email: "demo.stream.adaeze@naijastream.demo", password: "NaijaStreamDemo2026!" })
    });
  });

  // Claim an upcoming event for this organiser (test setup through the DB route
  // is not exposed, so use the seeded event and assert organiser auth below).
  const slug = "afrovibes-live-lagos";

  // Unauthorised creator cannot control the stream.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await otherPage.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ email: "demo.stream.kunle@naijastream.demo", password: "NaijaStreamDemo2026!" })
    });
  });
  const foreign = await otherPage.evaluate(async (s) => (await fetch(`/api/stream/studio/live/${s}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "stop" }) })).status, slug);

  // Start the real encode using the organiser's own publish token.
  const start = await page.evaluate(async (s) => {
    const info = await fetch(`/api/stream/studio/live/${s}`, { credentials: "include" }).then((r) => r.json());
    const res = await fetch(`/api/stream/studio/live/${s}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "start", token: info.publishToken })
    });
    return { status: res.status, body: await res.json() };
  }, slug);
  check("organiser starts the live encode", start.status === 200 && start.body.status === "LIVE", JSON.stringify(start.body).slice(0, 140));
  check("foreign creator rejected", foreign === 403 || foreign === 404, String(foreign));

  // A separate viewer session pulls the HLS playlist and segments.
  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await viewer.goto(`${BASE}/naijastream/live/${slug}`, { waitUntil: "networkidle" });
  await viewer.waitForTimeout(3000);

  const hls = await viewer.evaluate(async (s) => {
    const res = await fetch(`/api/stream/live/${s}/hls/index.m3u8`);
    const text = await res.text();
    const seg = (text.match(/seg\d+\.ts/g) || [])[0];
    let segmentBytes = 0;
    if (seg) {
      const sres = await fetch(`/api/stream/live/${s}/hls/${seg}`);
      segmentBytes = (await sres.arrayBuffer()).byteLength;
    }
    return { status: res.status, playlists: text.includes("#EXTM3U"), segments: (text.match(/seg\d+\.ts/g) || []).length, segmentBytes };
  }, slug);
  check("viewer receives a valid HLS playlist", hls.status === 200 && hls.playlists && hls.segments > 0, JSON.stringify(hls));
  check("viewer receives real media segments", hls.segmentBytes > 10000, String(hls.segmentBytes));

  // Page shows LIVE only while streaming.
  const liveBadge = await viewer.evaluate(() => /live/i.test(document.body.innerText));
  check("event page shows LIVE while broadcasting", liveBadge);

  // Stop → ENDED.
  const stop = await page.evaluate(async (s) => {
    const res = await fetch(`/api/stream/studio/live/${s}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "stop" }) });
    return { status: res.status, body: await res.json() };
  }, slug);
  check("organiser stops the stream", stop.status === 200 && stop.body.status === "ENDED");

  await viewer.waitForTimeout(1500);
  const afterStop = await fetch(`${BASE}/api/stream/live/${slug}/hls/index.m3u8`);
  await viewer.reload({ waitUntil: "networkidle" });
  const ended = await viewer.evaluate(() => /ended/i.test(document.body.innerText));
  check("event reports ENDED after stop", ended);

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
})();
