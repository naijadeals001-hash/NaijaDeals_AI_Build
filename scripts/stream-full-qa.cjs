// Full NaijaStream functional audit: every route renders, media actually plays.
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "stream-full");
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["/naijastream", "Home"],
  ["/naijastream/discover", "Discover"],
  ["/naijastream/music", "Music"],
  ["/naijastream/music?genre=Afrobeats", "Music filtered"],
  ["/naijastream/podcasts", "Podcasts"],
  ["/naijastream/podcasts/the-african-dream", "Show"],
  ["/naijastream/live", "Live"],
  ["/naijastream/live/afrovibes-live-lagos", "Live event"],
  ["/naijastream/videos", "Videos"],
  ["/naijastream/videos/live-in-lagos-clip", "Video"],
  ["/naijastream/artists", "Artists"],
  ["/naijastream/artists/adaeze-moon", "Artist"],
  ["/naijastream/charts", "Charts"],
  ["/naijastream/playlists", "Playlists"],
  ["/naijastream/playlists/afrobeats-hits", "Playlist"],
  ["/naijastream/search?q=lagos", "Search"],
  ["/naijastream/premium", "Premium"],
  ["/naijastream/notifications", "Notifications"],
  ["/naijastream/aura", "Aura"]
];

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--autoplay-policy=no-user-gesture-required"]
  });
  const results = [];

  for (const [route, name] of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("401")) errors.push(m.text().slice(0, 120));
    });
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => ({
      h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      textLength: document.body.innerText.trim().length,
      notFound: /could not be found|404/i.test(document.body.innerText),
      images: Array.from(document.querySelectorAll("img")).length,
      links: Array.from(document.querySelectorAll("a[href^='/naijastream']")).length,
      media: document.querySelectorAll("video, audio").length
    }));
    await page.screenshot({ path: path.join(OUT, `${name.replace(/\W+/g, "-").toLowerCase()}.png`) });
    results.push({ route, name, status: res?.status() ?? 0, ...info, errors: errors.length, errorSample: errors.slice(0, 2) });
    await page.close();
  }

  // Podcast playback
  const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p1.goto(`${BASE}/naijastream/podcasts/the-african-dream`, { waitUntil: "networkidle" });
  await p1.getByRole("button", { name: /play episode/i }).click();
  await p1.waitForTimeout(4000);
  const podcast = await p1.evaluate(() => {
    const a = document.querySelector("[data-episode-audio]");
    return { currentTime: Number((a?.currentTime || 0).toFixed(2)), duration: Math.round(a?.duration || 0), paused: a?.paused };
  });
  await p1.screenshot({ path: path.join(OUT, "podcast-playing.png") });
  await p1.close();

  // Video playback
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.goto(`${BASE}/naijastream/videos/live-in-lagos-clip`, { waitUntil: "networkidle" });
  await p2.waitForTimeout(1000);
  const video = await p2.evaluate(async () => {
    const v = document.querySelector("video");
    if (!v) return { found: false };
    try {
      await v.play();
    } catch {
      /* ignore autoplay restrictions */
    }
    await new Promise((r) => setTimeout(r, 2500));
    return { found: true, currentTime: Number(v.currentTime.toFixed(2)), duration: Math.round(v.duration || 0), videoWidth: v.videoWidth, paused: v.paused };
  });
  await p2.screenshot({ path: path.join(OUT, "video-page.png") });
  await p2.close();

  await browser.close();
  const failures = results.filter((r) => r.status !== 200 || r.notFound || r.textLength < 80 || r.errors > 0);
  console.log(
    JSON.stringify(
      {
        routes: results.map((r) => ({ route: r.route, status: r.status, h1: r.h1, texts: r.textLength, err: r.errors })),
        podcastPlayback: podcast,
        videoPlayback: video,
        failures
      },
      null,
      1
    )
  );
  const ok = failures.length === 0 && podcast.currentTime > 1 && video.found && video.videoWidth > 0;
  process.exit(ok ? 0 : 1);
})();
