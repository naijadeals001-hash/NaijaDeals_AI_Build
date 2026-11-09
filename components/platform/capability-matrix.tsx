"use client";

import { useEffect, useState } from "react";
import { capabilityLabel, detectCapabilities, type Capabilities } from "@/lib/platform/capabilities";

/**
 * Live capability table for the device the visitor is using, so the limits are
 * visible rather than discovered mid-trip. Values come from feature detection,
 * never from user-agent guesses about what "should" work.
 */
const ORDER: Array<keyof Capabilities> = ["serviceWorker", "geolocation", "backgroundLocation", "wakeLock", "push", "camera", "fileUpload", "share", "paymentRequest"];

export function CapabilityMatrix() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => setCaps(detectCapabilities()), []);

  if (!caps) {
    return <p className="mt-5 text-[11.5px] text-[#6b7a70]">Checking what this device supports…</p>;
  }

  return (
    <section aria-labelledby="capabilities" className="mt-5">
      <h2 id="capabilities" className="font-display text-[15px] font-extrabold">What this device supports</h2>
      <p className="mt-0.5 text-[11px] text-[#6b7a70]">
        Detected in your current browser: <b>{caps.platform}</b>{caps.standalone ? " · installed app" : " · browser tab"}.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[11.5px]">
          <caption className="sr-only">Device capability detection for this browser</caption>
          <thead>
            <tr className="bg-[#f2f9f0] text-left">
              <th scope="col" className="px-2 py-1.5 font-extrabold">Feature</th>
              <th scope="col" className="px-2 py-1.5 font-extrabold">Supported</th>
              <th scope="col" className="px-2 py-1.5 font-extrabold">What happens without it</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((cap) => {
              const supported = caps[cap] === true;
              return (
                <tr key={cap} className="border-t border-[#eef1ef]">
                  <th scope="row" className="px-2 py-1.5 text-left font-semibold">{capabilityLabel(cap)}</th>
                  <td className="px-2 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${supported ? "bg-[#e8f3e4] text-[#0b5c33]" : "bg-[#fff3e8] text-[#a3480f]"}`}>
                      {supported ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-[#5d6d64]">{supported ? "—" : caps.notes[cap as string] ?? "Not available on this platform."}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
