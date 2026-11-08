/**
 * Video publish + podcast publish acceptance: upload → process → publish →
 * an anonymous visitor sees decoded frames / hears the episode.
 * Usage: BASE_URL=http://localhost:3015 node scripts/stream-video-podcast-verify.cjs
 */
const { chromium } = require("playwright-core");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const STAMP = Date.now().toString(36);
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

async function uploadFile(page, file, kind, purpose) {
  return page.evaluate(
    async ({ b64, name, type, kind, purpose }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], name, { type });
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      body.append("purpose", purpose);
      const res = await fetch("/api/stream/media", { method: "POST", body, credentials: "include" });
      return { status: res.status, body: await res.json() };
    },
    {
      b64: require("node:fs").readFileSync(file).toString("base64"),
      name: path.basename(file),
      type: kind === "VIDEO" ? "video/mp4" : "audio/mpeg",
      kind,
      purpose
    }
  );
}

async function waitReady(page, id) {
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(1000);
    const status = await page.evaluate(async (assetId) => {
      const res = await fetch(`/api/stream/media/${assetId}`, { credentials: "include" });
      const body = await res.json();
      return body.status;
    }, id);
    if (status === "READY") return true;
    if (status === "FAILED") return false;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--autoplay-policy=no-user-gesture-required"] });
  const creator = await browser.newContext();
  const page = await creator.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: "adaeze-moon@naijastream.demo", password: "NaijaStreamDemo2026!" })
    });
  });

  // ---- VIDEO -------------------------------------------------------------
  const videoUpload = await uploadFile(page, path.join(process.cwd(), "public", "generated", "stream", "audio", "clip-live-lagos.mp4"), "VIDEO", "VIDEO");
  check("video upload accepted", videoUpload.status === 201, JSON.stringify(videoUpload.body).slice(0, 120));
  check("video processed", await waitReady(page, videoUpload.body.id));
  const videoPub = await page.evaluate(async ({ id, t }) => {
    const res = await fetch("/api/stream/studio/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mediaId: id, title: t })
    });
    return { status: res.status, body: await res.json() };
  }, { id: videoUpload.body.id, t: `Uploaded video ${STAMP}` });
  check("video published", videoPub.status === 201, JSON.stringify(videoPub.body).slice(0, 120));

  // Anonymous viewer decodes real frames.
  const anonCtx = await browser.newContext();
  const viewer = await anonCtx.newPage();
  await viewer.goto(`${BASE}/naijastream/videos/${videoPub.body.slug}`, { waitUntil: "networkidle" });
  const frames = await viewer.evaluate(async () => {
    const v = document.querySelector("video");
    if (!v) return { found: false };
    await v.play().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 3000));
    return { found: true, currentTime: v.currentTime, videoWidth: v.videoWidth, videoHeight: v.videoHeight, readyState: v.readyState, paused: v.paused };
  });
  check("anonymous viewer decodes video frames", frames.found && frames.videoWidth > 0 && frames.currentTime > 0.5, JSON.stringify(frames));
  await viewer.screenshot({ path: path.join(process.cwd(), "qa-artifacts", "stream-features", "video-uploaded.png") });

  // ---- PODCAST -----------------------------------------------------------
  const show = await page.evaluate(async (t) => {
    const res = await fetch("/api/stream/studio/shows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: t, category: "Culture", description: "Created by the acceptance test." })
    });
    return { status: res.status, body: await res.json() };
  }, `Upload Test Show ${STAMP}`);
  check("podcast show created", show.status === 201, JSON.stringify(show.body).slice(0, 120));

  const episodeUpload = await uploadFile(page, path.join(process.cwd(), "public", "generated", "stream", "audio", "episode-founders-lagos.mp3"), "AUDIO", "EPISODE");
  check("episode audio uploaded", episodeUpload.status === 201);
  check("episode processed", await waitReady(page, episodeUpload.body.id));
  const episodePub = await page.evaluate(async ({ slug, id, t }) => {
    const res = await fetch(`/api/stream/studio/shows/${slug}/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mediaId: id, title: t })
    });
    return { status: res.status, body: await res.json() };
  }, { slug: show.body.slug, id: episodeUpload.body.id, t: `Episode ${STAMP}` });
  check("episode published", episodePub.status === 201, JSON.stringify(episodePub.body).slice(0, 120));

  await viewer.goto(`${BASE}/naijastream/podcasts/${show.body.slug}`, { waitUntil: "networkidle" });
  await viewer.getByRole("button", { name: /play episode/i }).click();
  await viewer.waitForTimeout(4000);
  const ep = await viewer.evaluate(() => {
    const a = document.querySelector("[data-episode-audio]");
    return { currentTime: a?.currentTime, duration: a?.duration, paused: a?.paused };
  });
  check("anonymous listener plays the new episode", ep.currentTime > 0.5 && ep.duration > 0, JSON.stringify(ep));
  await viewer.screenshot({ path: path.join(process.cwd(), "qa-artifacts", "stream-features", "podcast-published.png") });

  // Security: a different creator cannot read this media.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await otherPage.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ email: "demo.stream.kunle@naijastream.demo", password: "NaijaStreamDemo2026!" })
    });
  });
  const foreignDelete = await otherPage.evaluate(async (id) => (await fetch(`/api/stream/media/${id}`, { method: "DELETE", credentials: "include" })).status, videoUpload.body.id);
  check("another creator cannot delete this media", foreignDelete === 404 || foreignDelete === 403, String(foreignDelete));

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
})();
