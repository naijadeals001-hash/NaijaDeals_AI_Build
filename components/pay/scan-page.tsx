"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Camera, CameraOff, Keyboard, ScanLine, ShieldCheck, Store } from "lucide-react";

type Phase = "camera" | "denied" | "unsupported" | "review";

/**
 * Scan & Pay screen. Uses the browser's BarcodeDetector where available with
 * graceful permission/unsupported fallbacks and manual code entry. Merchant
 * verification + payment confirmation are designed per the approved mockup,
 * but confirming stays disabled until merchant QR issuance is live — the
 * screen says so instead of pretending to pay.
 */
export function NaijaPayScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>("camera");
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    let detector: { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } | null = null;
    let cancelled = false;

    async function start() {
      if (manual || detectedRef.current) return;
      const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        setPhase("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        detector = new Detector({ formats: ["qr_code"] });
        const tick = async () => {
          if (cancelled || detectedRef.current || !videoRef.current || !detector) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              detectedRef.current = true;
              setCode(codes[0].rawValue);
              setPhase("review");
              stopStream();
              return;
            }
          } catch {
            /* transient detect errors are retried on the next frame */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        if (!cancelled) setPhase("denied");
      }
    }

    function stopStream() {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (!manual) void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopStream();
    };
  }, [manual]);

  function useManual() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setManual(true);
    setPhase("unsupported");
  }

  function submitManual() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter the code shown by the merchant.");
      return;
    }
    setError("");
    setCode(trimmed);
    setPhase("review");
  }

  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/wallet" aria-label="Back to wallet" className="rounded-full border border-black/10 bg-white p-2.5 text-pay-ink transition hover:bg-pay-mint">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-pay-ink">Scan &amp; pay</h1>
          <p className="text-xs text-pay-ink-muted">Pay a verified merchant by scanning their NaijaPay QR code.</p>
        </div>
      </header>

      {!manual && (phase === "camera" || phase === "denied" || phase === "unsupported") && (
        <section className="overflow-hidden rounded-3xl border border-black/5 bg-pay-ink shadow-soft">
          <div className="relative aspect-4/3 w-full bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="Camera preview" />
            {phase !== "camera" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-pay-ink/90 p-6 text-center text-white">
                {phase === "denied" ? <CameraOff className="h-10 w-10 text-pay-gold" aria-hidden="true" /> : <Keyboard className="h-10 w-10 text-pay-gold" aria-hidden="true" />}
                <p className="text-sm font-bold">
                  {phase === "denied"
                    ? "Camera permission was refused. You can enter the merchant code manually instead."
                    : "This browser does not support in-page QR scanning. Enter the merchant code manually instead."}
                </p>
              </div>
            )}
            {phase === "camera" && (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                  <div className="h-44 w-44 rounded-3xl border-2 border-pay-gold/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
                <p className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 text-xs font-bold text-white/90">
                  <ScanLine className="h-4 w-4 text-pay-gold" aria-hidden="true" /> Point at the merchant QR code
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={useManual}
            className="flex w-full items-center justify-center gap-2 bg-pay-deep py-3.5 text-sm font-bold text-white transition hover:bg-pay-green"
          >
            <Keyboard className="h-4 w-4" aria-hidden="true" /> Enter code manually
          </button>
        </section>
      )}

      {(manual || phase === "unsupported") && (
        <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-soft">
          <h2 className="font-display text-lg font-extrabold text-pay-ink">Enter merchant code</h2>
          <p className="mt-1 text-xs text-pay-ink-muted">Ask the merchant for their NaijaPay payment code.</p>
          <input
            value={manual ? code : ""}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. ND-MERCHANT-0000"
            className="mt-3 w-full rounded-xl border border-black/10 bg-pay-mint/40 px-4 py-3 text-sm font-semibold text-pay-ink placeholder:text-pay-ink-muted focus:border-pay-green focus:outline-none"
          />
          {error && (
            <p role="alert" className="mt-2 flex items-center gap-2 text-xs font-bold text-red-600">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> {error}
            </p>
          )}
          <button
            type="button"
            onClick={submitManual}
            className="mt-4 w-full rounded-full bg-pay-green px-6 py-3.5 text-sm font-bold text-white shadow-lift transition hover:bg-pay-deep"
          >
            Look up merchant
          </button>
          {!manual && (
            <button type="button" onClick={() => { setManual(false); setPhase("camera"); }} className="mt-3 w-full rounded-full border border-black/10 px-6 py-3 text-sm font-bold text-pay-ink transition hover:bg-pay-mint">
              <Camera className="mr-1 inline h-4 w-4" aria-hidden="true" /> Back to camera
            </button>
          )}
        </section>
      )}

      {phase === "review" && (
        <section className="space-y-4 rounded-3xl border border-black/5 bg-white p-6 shadow-soft">
          <div className="flex items-center gap-3 rounded-2xl bg-pay-mint p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-soft">
              <Store className="h-6 w-6 text-pay-green" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-extrabold text-pay-ink">Merchant verification</p>
              <p className="truncate text-xs text-pay-ink-muted">Code: {code}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-pay-gold/30 bg-pay-gold-soft/40 p-3 text-xs text-pay-ink-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pay-green" aria-hidden="true" />
            Merchant QR issuance is not live on the platform yet, so this code cannot be verified and no payment can be
            confirmed from this screen. Merchant payments switch on together with the transfers rollout — nothing is
            charged and no success is simulated.
          </div>
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-full bg-pay-mint px-6 py-3.5 text-sm font-bold text-pay-ink-muted"
          >
            Confirm &amp; pay — unavailable until merchant QR is live
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("unsupported");
              setCode("");
              detectedRef.current = false;
            }}
            className="w-full rounded-full border border-black/10 px-6 py-3 text-sm font-bold text-pay-ink transition hover:bg-pay-mint"
          >
            Start over
          </button>
        </section>
      )}
    </div>
  );
}
