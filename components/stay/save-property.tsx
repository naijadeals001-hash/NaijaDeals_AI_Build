"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

/** Save button. Optimistic, but reverts if the server refuses (for example, signed out). */
export function SaveProperty({ propertyId, initialSaved }: { propertyId: string; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState("");

  async function toggle() {
    const next = !saved;
    setSaved(next);
    setError("");
    const response = await fetch("/api/stay/save", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId })
    });
    if (!response.ok) {
      setSaved(!next);
      setError(response.status === 401 ? "Sign in to save" : "Could not save");
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => void toggle()} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save this property"} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">
        <Heart className={`h-3.5 w-3.5 ${saved ? "fill-[#f26b21] text-[#f26b21]" : ""}`} aria-hidden /> {saved ? "Saved" : "Save"}
      </button>
      {error ? <span role="alert" className="mt-0.5 text-[9.5px] font-semibold text-[#a3480f]">{error}</span> : null}
    </span>
  );
}
