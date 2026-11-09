"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

/**
 * Saves a kitchen or dish to the signed-in account. The server owns the state;
 * the button reflects what came back rather than optimistic UI.
 */
export function FavouriteButton({
  kind,
  targetId,
  label,
  saved = false,
  className = ""
}: {
  kind: "restaurant" | "dish";
  targetId: string;
  label: string;
  saved?: boolean;
  className?: string;
}) {
  const [favourited, setFavourited] = useState(saved);
  const [note, setNote] = useState("");

  return (
    <span className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        aria-label={favourited ? `Remove ${label} from favourites` : `Save ${label} to favourites`}
        aria-pressed={favourited}
        onClick={async (event) => {
          event.preventDefault();
          const response = await fetch("/api/eats/favourites", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, targetId })
          });
          if (response.status === 401) {
            setNote("Sign in to save");
            return;
          }
          const body = await response.json().catch(() => ({}));
          if (response.ok) setFavourited(Boolean(body.favourited));
        }}
        className={`grid h-8 w-8 place-items-center rounded-full border transition ${
          favourited ? "border-[#f26b21] bg-[#fff1e6] text-[#f26b21]" : "border-[#e2e6e3] bg-white text-[#6b7a70] hover:text-[#f26b21]"
        }`}
      >
        <Heart className={`h-4 w-4 ${favourited ? "fill-current" : ""}`} aria-hidden />
      </button>
      {note ? <span className="text-[9.5px] font-semibold text-[#a3480f]">{note}</span> : null}
    </span>
  );
}
