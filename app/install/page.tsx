import type { Metadata } from "next";
import Link from "next/link";
import { CapabilityMatrix } from "@/components/platform/capability-matrix";
import { APP_RELEASE } from "@/lib/platform/release";

export const metadata: Metadata = {
  title: "Install NaijaDeals — web, PWA and Android",
  description: "Install NaijaDeals as an app on Android and iPhone, or download the Android app directly for background driver tracking.",
  alternates: { canonical: "/install" }
};

export default function InstallPage() {
  return (
    <section className="mx-auto max-w-[980px]">
      <h1 className="font-display text-[26px] font-extrabold">Install NaijaDeals</h1>
      <p className="mt-1 max-w-2xl text-[12.5px] leading-6 text-[#5d6d64]">
        You do not need an app store. Use NaijaDeals on the web, install it as an app on your phone, or — for Android drivers who need
        background location — download the app directly.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <section aria-labelledby="web" className="rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
          <h2 id="web" className="font-display text-[15px] font-extrabold">1. Use the website</h2>
          <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">Works in every modern browser on desktop, tablet and phone. Nothing to install.</p>
          <Link href="/" className="mt-2 inline-flex rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Continue on the web</Link>
        </section>
        <section aria-labelledby="pwa" className="rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
          <h2 id="pwa" className="font-display text-[15px] font-extrabold">2. Install the app (PWA)</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-[11.5px] leading-5 text-[#5d6d64]">
            <li><b>Android (Chrome):</b> open the menu and choose “Install app” or “Add to Home screen”.</li>
            <li><b>iPhone/iPad (Safari):</b> tap Share, then “Add to Home Screen”.</li>
            <li><b>Desktop (Chrome/Edge):</b> click the install icon in the address bar.</li>
          </ol>
          <Link href="/" className="mt-2 inline-flex rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Open to install</Link>
        </section>
        <section aria-labelledby="android" className="rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
          <h2 id="android" className="font-display text-[15px] font-extrabold">3. Android app (direct download)</h2>
          <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">
            Needed only if you are a NaijaDrive driver or NaijaSend courier who requires location updates while the screen is locked.
          </p>
          {APP_RELEASE.available ? (
            <a href={APP_RELEASE.downloadPath} className="mt-2 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">
              Download v{APP_RELEASE.version} ({APP_RELEASE.sizeLabel})
            </a>
          ) : (
            <p className="mt-2 rounded-lg bg-[#fff3e8] p-2 text-[11px] leading-5 text-[#a3480f]">
              <b>Not available yet.</b> The Android build is blocked: {APP_RELEASE.blocker}. Until it ships, use the PWA, which tracks
              only while the app is open — see the capability table below.
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="releases" className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
        <h2 id="releases" className="font-display text-[15px] font-extrabold">Android release information</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
          <div><dt className="text-[#6b7a70]">Version</dt><dd className="font-bold">{APP_RELEASE.version}</dd></div>
          <div><dt className="text-[#6b7a70]">Build</dt><dd className="font-bold">{APP_RELEASE.build}</dd></div>
          <div><dt className="text-[#6b7a70]">Size</dt><dd className="font-bold">{APP_RELEASE.sizeLabel}</dd></div>
          <div><dt className="text-[#6b7a70]">Min Android</dt><dd className="font-bold">{APP_RELEASE.minAndroid}</dd></div>
        </dl>
        <h3 className="mt-3 text-[12px] font-extrabold">Release notes</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11.5px] text-[#5d6d64]">
          {APP_RELEASE.releaseNotes.map((note) => <li key={note}>{note}</li>)}
        </ul>
        <h3 className="mt-3 text-[12px] font-extrabold">SHA-256 checksum</h3>
        <p className="mt-0.5 break-all font-mono text-[10.5px] text-[#3f4d45]">{APP_RELEASE.sha256}</p>
        <p className="mt-1 text-[10.5px] leading-4 text-[#6b7a70]">
          Verify before installing: on a computer run <code className="rounded bg-[#f2f9f0] px-1">sha256sum NaijaDeals.apk</code>. A file that does not match must not be installed.
        </p>
        <h3 className="mt-3 text-[12px] font-extrabold">Installing on Android</h3>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11.5px] text-[#5d6d64]">
          <li>Download the APK on the phone (not on a computer, unless you will transfer it deliberately).</li>
          <li>The first time, allow installs from this browser when Android asks.</li>
          <li>Open the downloaded file and tap Install.</li>
          <li>Updates are installed the same way, over the existing app, and keep your data. The app never updates itself silently.</li>
        </ol>
      </section>

      <CapabilityMatrix />

      <p className="mt-5 rounded-xl bg-[#f2f9f0] p-3 text-[11px] leading-5 text-[#3f4d45]">
        <b>Honest limits.</b> On iPhone and iPad, a web app cannot receive location while the screen is locked or Safari is in the background —
        no browser on iOS can, because they all use WebKit. iPhone drivers can still accept jobs, update status and use foreground location.
        Dependable background tracking for iPhone drivers needs a native iOS app, which requires an Apple Developer account and App Store
        distribution today; that is not yet built.
      </p>
    </section>
  );
}
