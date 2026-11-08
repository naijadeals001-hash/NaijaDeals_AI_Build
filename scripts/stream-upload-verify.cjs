/**
 * End-to-end creator media test: real upload → processing → draft → publish →
 * another (anonymous) session decodes and plays the audio.
 * Usage: BASE_URL=http://localhost:3015 node scripts/stream-upload-verify.cjs
 */
const { chromium } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const STAMP = Date.now().toString(36);
const STORAGE_STATE = path.join(process.cwd(), "qa-artifacts", ".media-session.json");

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
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--autoplay-policy=no-user-gesture-required"]
  });

  // --- Creator session -----------------------------------------------------
  const creator = await browser.newContext();
  const setup = await creator.newPage();
  await setup.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const email = `streamcreator-${STAMP}@test.local`;

  // The creator needs an artist profile; register + create one through the API.
  const reg = await setup.evaluate(async (mail) => {
    const r1 = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: "Upload Test Creator", email: mail, password: "UploadTestPass123!" })
    });
    const r2 = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: mail, password: "UploadTestPass123!" })
    });
    return { register: r1.status, login: r2.status };
  }, email);
  check("creator account created", reg.register < 300 && reg.login === 200, JSON.stringify(reg));

  // Give the account an artist row directly via the seeded demo artist login is
  // not appropriate; instead upload as the existing demo artist account.
  await setup.evaluate(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: "demo.stream.adaeze@naijastream.demo", password: "NaijaStreamDemo2026!" })
    });
  });

  const page = await creator.newPage();
  await page.goto(`${BASE}/naijastream/studio/upload`, { waitUntil: "networkidle" });
  check("upload page renders a file input", (await page.locator('input[type="file"]').count()) > 0);

  // Real file upload through the UI input.
  const audioFile = path.join(process.cwd(), "public", "generated", "stream", "audio", "track-brighter.mp3");
  await page.locator('input[type="file"]').setInputFiles(audioFile);
  let asset = null;
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(1000);
    asset = await page.evaluate(async () => {
      const res = await fetch("/api/stream/media", { credentials: "include" });
      const body = await res.json();
      return body.assets?.find((a) => a.status === "READY" && a.kind === "AUDIO") ?? body.assets?.[0] ?? null;
    });
    if (asset?.status === "READY") break;
  }
  check("uploaded audio processed to READY", asset?.status === "READY", asset?.status);
  check("duration extracted by FFmpeg", Number(asset?.durationSec) > 0, String(asset?.durationSec));

  // Create the draft through the API (same call the form makes).
  const title = `Upload Test ${STAMP}`;
  const draft = await page.evaluate(async ({ id, t }) => {
    const res = await fetch("/api/stream/studio/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: t, mediaId: id, genre: "Afrobeats", rightsDeclared: true })
    });
    return { status: res.status, body: await res.json() };
  }, { id: asset.id, t: title });
  check("draft track created from uploaded audio", draft.status === 201, JSON.stringify(draft.body).slice(0, 120));

  // Unpublished media must NOT be publicly streamable.
  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  await anon.goto(`${BASE}/naijastream`, { waitUntil: "domcontentloaded" });
  const beforePublish = await anon.evaluate(async (id) => (await fetch(`/api/stream/media/${id}/stream`)).status, asset.id);
  check("draft media blocked for anonymous users", beforePublish === 401 || beforePublish === 403, String(beforePublish));

  // Publish.
  const publish = await page.evaluate(async (slug) => {
    const res = await fetch(`/api/stream/studio/tracks/${slug}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ publish: true }) });
    return { status: res.status, body: await res.json() };
  }, draft.body.slug);
  check("track published", publish.status === 200 && publish.body.status === "PUBLISHED", JSON.stringify(publish.body).slice(0, 120));

  // Anonymous listener now receives the audio and the browser decodes it.
  const playback = await anon.evaluate(async (mediaId) => {
    const audio = document.createElement("audio");
    audio.src = `/api/stream/media/${mediaId}/stream`;
    audio.preload = "auto";
    document.body.appendChild(audio);
    const meta = await new Promise((resolve) => {
      audio.addEventListener("loadedmetadata", () => resolve({ duration: audio.duration }), { once: true });
      audio.addEventListener("error", () => resolve({ duration: 0, error: audio.error?.code }), { once: true });
      setTimeout(() => resolve({ duration: audio.duration || 0 }), 8000);
      audio.load();
    });
    await audio.play().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2500));
    const result = { duration: meta.duration, currentTime: audio.currentTime, paused: audio.paused, error: meta.error ?? null };
    audio.remove();
    return result;
  }, asset.id);
  check("published audio loads for a listener", playback.duration > 0, JSON.stringify(playback));
  check("published audio actually plays", playback.currentTime > 0.5, String(playback.currentTime));

  // Range support for seeking.
  const range = await anon.evaluate(async (id) => {
    const res = await fetch(`/api/stream/media/${id}/stream`, { headers: { Range: "bytes=1000-2000" } });
    return { status: res.status, contentRange: res.headers.get("content-range") };
  }, asset.id);
  check("media supports byte-range seeking", range.status === 206 && Boolean(range.contentRange), JSON.stringify(range));

  // The new track is discoverable in the public catalogue.
  const found = await anon.evaluate(async (t) => {
    const res = await fetch(`/api/stream/tracks?q=${encodeURIComponent(t)}`);
    const body = await res.json();
    return body.items?.some((item) => item.title === t) ?? false;
  }, title);
  check("published track appears in public search", found);

  await creator.storageState({ path: STORAGE_STATE });
  await browser.close();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  fs.writeFileSync(path.join(process.cwd(), "qa-artifacts", "upload-test.json"), JSON.stringify({ title, slug: draft.body.slug, assetId: asset.id, assetStatus: asset.status }, null, 2));
  if (failures.length) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
})();
