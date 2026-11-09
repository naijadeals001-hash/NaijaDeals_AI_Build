"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw, Share, Smartphone, WifiOff, X } from "lucide-react";
import { usePlatform } from "@/components/platform/platform-provider";

/**
 * Top-of-page status rail: offline, update ready, install available.
 * Each item is dismissible and does not block content; none of them repeat after
 * the user closes them for this session.
 */

const DISMISS_KEY = "naijadeals:platform-banner-dismissed";

export function PlatformBanner() {
  const { online, updateReady, applyUpdate, canPromptInstall, installed, install, capabilities } = usePlatform();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? "[]") as string[]);
    } catch {
      setDismissed([]);
    }
  }, []);

  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  if (!online) {
    return (
      <div role="status" className="flex items-center gap-2 bg-[#7a4a00] px-3 py-1.5 text-[11.5px] font-semibold text-white">
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        You are offline. Pages you have opened before may still work; payments and bookings need a connection.
      </div>
    );
  }

  if (updateReady && !dismissed.includes("update")) {
    return (
      <div role="status" className="flex items-center gap-2 bg-[#0b5c33] px-3 py-1.5 text-[11.5px] font-semibold text-white">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        A new version of NaijaDeals is ready.
        <button type="button" onClick={applyUpdate} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-[#0b5c33]">Update now</button>
        <button type="button" onClick={() => dismiss("update")} aria-label="Dismiss update notice" className="ml-auto grid h-6 w-6 place-items-center rounded hover:bg-white/15"><X className="h-3.5 w-3.5" aria-hidden /></button>
      </div>
    );
  }

  // iOS never fires beforeinstallprompt, so show the manual instructions instead.
  const iosManual = capabilities.platform === "ios" && !installed && !dismissed.includes("ios");
  if ((canPromptInstall || iosManual) && !dismissed.includes("install")) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-2 bg-[#eef4fb] px-3 py-1.5 text-[11.5px] font-semibold text-[#14241b]">
        {iosManual ? <Share className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden /> : <Download className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden />}
        Install NaijaDeals for a full-screen app experience.
        <button
          type="button"
          onClick={() => (iosManual ? setShowIosHint((open) => !open) : void install())}
          className="rounded-full bg-[#0b5c33] px-2.5 py-0.5 text-[11px] font-extrabold text-white"
        >
          {iosManual ? "How to install" : "Install"}
        </button>
        <Link href="/install" className="text-[11px] font-bold text-[#0b5c33] underline">All options</Link>
        <button type="button" onClick={() => dismiss("install")} aria-label="Dismiss install notice" className="ml-auto grid h-6 w-6 place-items-center rounded hover:bg-black/5"><X className="h-3.5 w-3.5" aria-hidden /></button>
        {showIosHint ? (
          <p className="w-full text-[10.5px] leading-4 text-[#3f4d45]">
            <Smartphone className="mr-1 inline h-3 w-3" aria-hidden />
            In Safari, tap the Share button, then choose “Add to Home Screen”. On iPad the Share button is in the top toolbar.
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
