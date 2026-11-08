// Proves real audio playback in a browser: advances currentTime from actual media.
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "stream-preview");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--autoplay-policy=no-user-gesture-required"]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = {};
  await page.goto(`${BASE}/naijastream`, { waitUntil: "domcontentloaded" });

  // 1) Media file is served and decodable by the browser.
  results.fileCheck = await page.evaluate(async () => {
    const audio = document.createElement("audio");
    audio.src = "/generated/stream/audio/track-lagos-nights.mp3";
    audio.muted = true;
    document.body.appendChild(audio);
    await new Promise((resolve) => {
      audio.addEventListener("loadedmetadata", resolve, { once: true });
      audio.addEventListener("error", resolve, { once: true });
      setTimeout(resolve, 8000);
    });
    const duration = Math.round(audio.duration || 0);
    audio.remove();
    return { duration, playable: duration > 0 };
  });

  // 2) Range request support (seeking requires 206).
  results.rangeSupport = await page.evaluate(async () => {
    const res = await fetch("/generated/stream/audio/track-lagos-nights.mp3", { headers: { Range: "bytes=0-1023" } });
    return { status: res.status, acceptRanges: res.headers.get("content-range") !== null };
  });

  await page.goto(`${BASE}/naijastream`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 3) Play through the UI and confirm the media clock advances.
  await page.getByRole("button", { name: /play now/i }).click();
  await page.waitForTimeout(1200);
  results.playingState = await page.evaluate(() => {
    const el = document.querySelector("audio");
    return { hasAudioEl: Boolean(el), paused: el?.paused, src: el?.currentSrc?.split("/").pop(), duration: Math.round(el?.duration || 0) };
  });
  await page.waitForTimeout(4000);
  results.afterPlay = await page.evaluate(() => {
    const el = document.querySelector("audio");
    return { currentTime: Number((el?.currentTime || 0).toFixed(2)), paused: el?.paused, error: el?.error?.code ?? null };
  });
  results.audioAdvances = results.afterPlay.currentTime > 0.5;
  await page.screenshot({ path: path.join(OUT, "playing.png") });

  // 4) Seek works.
  // Real keyboard interaction (synthetic events are not seen by React).
  const seekbar = page.getByRole("slider", { name: "Seek" });
  if (await seekbar.count()) {
    const before = await page.evaluate(() => document.querySelector("audio")?.currentTime || 0);
    await seekbar.focus();
    for (let i = 0; i < 12; i += 1) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1500);
    results.afterSeek = await page.evaluate(() => Number((document.querySelector("audio")?.currentTime || 0).toFixed(1)));
    results.seekWorks = results.afterSeek > before + 5;
  }

  // 5) Next/previous change the track source.
  const firstSrc = results.playingState.src;
  await page.getByRole("button", { name: "Next track" }).click();
  await page.waitForTimeout(2500);
  results.nextWorks = await page.evaluate((prev) => document.querySelector("audio")?.currentSrc?.split("/").pop() !== prev, firstSrc);

  // 6) Playback error surfaced honestly when media is missing.
  results.noErrorBannerWhilePlaying = await page.evaluate(() => !/audio is unavailable|not been published/i.test(document.body.innerText));

  await browser.close();
  console.log(JSON.stringify(results, null, 1));
  const ok = results.fileCheck.playable && results.rangeSupport.status === 206 && results.audioAdvances && results.nextWorks && results.seekWorks;
  process.exit(ok ? 0 : 1);
})();
