"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, X } from "lucide-react";
import type { GalleryImage } from "./types";

/**
 * Bounded product gallery with optional thumbnails and an accessible
 * full-screen viewer. Only real stored images are shown: when an image fails to
 * load it is removed from the set, and an honest empty state replaces a broken
 * frame. The viewer is keyboard operable (Tab, Escape, arrows, Home/End) and
 * returns focus to the control that opened it.
 */
export function ProductGallery({
  name,
  images,
  demo = false
}: {
  name: string;
  images: GalleryImage[];
  demo?: boolean;
}) {
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(() => new Set());
  const [activeUrl, setActiveUrl] = useState<string | null>(() => images[0]?.url ?? null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const usable = images.filter((image) => !brokenUrls.has(image.url));
  const selected = usable.find((image) => image.url === activeUrl) ?? usable[0] ?? null;
  const selectedIndex = Math.max(
    0,
    usable.findIndex((image) => image.id === selected?.id)
  );
  const hasMany = usable.length > 1;

  function markBroken(url: string) {
    setBrokenUrls((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }

  function showImage(url: string) {
    setActiveUrl(url);
  }

  function handleThumbKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!hasMany) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % usable.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + usable.length) % usable.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = usable.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = usable[next];
    if (!target) return;
    setActiveUrl(target.url);
    thumbRefs.current[next]?.focus();
  }

  function openViewer() {
    if (!selected) return;
    setZoomIndex(Math.max(0, usable.findIndex((image) => image.id === selected.id)));
    setZoomOpen(true);
  }

  function closeViewer() {
    setZoomOpen(false);
  }

  const viewerImage = usable[zoomIndex] ?? selected;

  // If the last usable image fails while the viewer is open, close it instead
  // of leaving a locked, empty overlay behind. Keep the index inside the
  // remaining set so the counter never reads "Image 3 of 2".
  useEffect(() => {
    if (!zoomOpen) return;
    if (usable.length === 0) {
      setZoomOpen(false);
      return;
    }
    setZoomIndex((current) => Math.min(current, usable.length - 1));
  }, [zoomOpen, usable.length]);

  // Focus, scroll lock and restoration are tied to opening/closing only, so
  // arrow-key navigation inside the viewer never steals focus back to Close.
  useEffect(() => {
    if (!zoomOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      (previous ?? trigger)?.focus();
    };
  }, [zoomOpen]);

  useEffect(() => {
    if (!zoomOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
        return;
      }
      if (event.key === "ArrowRight" && usable.length > 1) {
        event.preventDefault();
        setZoomIndex((current) => (current + 1) % usable.length);
      }
      if (event.key === "ArrowLeft" && usable.length > 1) {
        event.preventDefault();
        setZoomIndex((current) => (current - 1 + usable.length) % usable.length);
      }
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomOpen, usable.length]);

  return (
    <section aria-label="Product images" className="min-w-0">
      <div className={hasMany ? "grid gap-3 sm:grid-cols-[72px_minmax(0,1fr)]" : ""}>
        {hasMany ? (
          <div
            role="group"
            aria-label={`Product images, ${usable.length} available`}
            className="order-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] sm:order-1 sm:max-h-[460px] sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:pb-0 sm:pr-1"
          >
            {usable.map((image, index) => {
              const active = selected?.id === image.id;
              return (
                <button
                  key={image.id}
                  ref={(node) => {
                    thumbRefs.current[index] = node;
                  }}
                  type="button"
                  data-testid="product-thumbnail"
                  onClick={() => showImage(image.url)}
                  onKeyDown={(event) => handleThumbKeyDown(event, index)}
                  aria-label={`Show image ${index + 1} of ${usable.length}`}
                  aria-pressed={active}
                  tabIndex={active ? 0 : -1}
                  className={`grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-canvas transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-[72px] sm:w-[72px] ${
                    active ? "border-primary ring-2 ring-primary/25" : "border-border-soft hover:border-primary/50"
                  }`}
                >
                  {/* Thumbnail button is labelled; the repeated image is decorative. */}
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    onError={() => markBroken(image.url)}
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        ) : null}

        <div
          data-testid="product-image-stage"
          data-image-count={usable.length}
          className="relative order-1 mx-auto grid aspect-square w-full max-h-[460px] max-w-[460px] place-items-center overflow-hidden rounded-2xl border border-border-soft bg-canvas sm:order-2"
        >
          {selected ? (
            <>
              <button
                ref={triggerRef}
                type="button"
                onClick={openViewer}
                aria-haspopup="dialog"
                aria-label={`Open full-screen image viewer: ${selected.alt || name}`}
                className="group grid h-full w-full cursor-zoom-in place-items-center p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
              >
                <img
                  key={selected.url}
                  data-testid="product-main-image"
                  src={selected.url}
                  alt={selected.alt || name}
                  loading="eager"
                  fetchPriority="high"
                  onError={() => markBroken(selected.url)}
                  className="max-h-full max-w-full object-contain"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-ink shadow-sm ring-1 ring-black/10"
                >
                  <Maximize2 className="h-3 w-3" /> Zoom
                </span>
              </button>
              {usable.length > 1 ? (
                <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-muted shadow-sm">
                  Image {selectedIndex + 1} of {usable.length}
                </p>
              ) : null}
            </>
          ) : (
            <div className="max-w-sm px-6 py-10 text-center">
              <ImageOff className="mx-auto h-9 w-9 text-muted" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-muted">
                {images.length > 0
                  ? "This listing's images could not be loaded."
                  : "The seller has not provided an image for this listing."}
              </p>
              {demo ? <p className="mt-1 text-xs text-muted">Demonstration listing.</p> : null}
            </div>
          )}
        </div>
      </div>

      {mounted && zoomOpen && viewerImage
        ? createPortal(
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-image-viewer-title"
              className="fixed inset-0 z-[90] flex flex-col bg-[#07130d]/95 p-3 text-white sm:p-6"
              onClick={(event) => {
                if (event.target === event.currentTarget) closeViewer();
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="product-image-viewer-title" className="text-sm font-bold sm:text-base">
                    {name}
                  </h2>
                  <p className="text-xs text-white/70">
                    Image {zoomIndex + 1} of {usable.length}
                    <span className="hidden sm:inline"> · Use the arrow keys to change image · Esc closes</span>
                  </p>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={closeViewer}
                  aria-label="Close image viewer"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-white/30 px-4 text-sm font-bold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <X className="h-4 w-4" aria-hidden /> Close
                </button>
              </div>

              <div className="relative mt-3 flex min-h-0 flex-1 items-center justify-center">
                {usable.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setZoomIndex((current) => (current - 1 + usable.length) % usable.length)}
                    aria-label="Previous image"
                    className="absolute left-0 top-1/2 z-10 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <ChevronLeft className="h-6 w-6" aria-hidden />
                  </button>
                ) : null}
                <img
                  src={viewerImage.url}
                  alt={viewerImage.alt || name}
                  className="max-h-full max-w-full object-contain"
                  onError={() => markBroken(viewerImage.url)}
                />
                {usable.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setZoomIndex((current) => (current + 1) % usable.length)}
                    aria-label="Next image"
                    className="absolute right-0 top-1/2 z-10 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <ChevronRight className="h-6 w-6" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
