"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { detectCapabilities, isStandalone, type Capabilities } from "@/lib/platform/capabilities";

/**
 * Platform provider: registers the service worker, reports connectivity, exposes
 * the install prompt and tracks whether a newer worker is waiting.
 *
 * The worker is only registered in a secure context. In development it is
 * skipped so a stale cached shell never confuses local testing.
 */

type BeforeInstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type PlatformContextValue = {
  capabilities: Capabilities;
  online: boolean;
  installed: boolean;
  canPromptInstall: boolean;
  install(): Promise<"accepted" | "dismissed" | "unavailable">;
  updateReady: boolean;
  applyUpdate(): void;
  serviceWorkerActive: boolean;
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<Capabilities>(() => detectCapabilities());
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [canPromptInstall, setCanPromptInstall] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [serviceWorkerActive, setServiceWorkerActive] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    setCapabilities(detectCapabilities());
    setInstalled(isStandalone());
    setOnline(navigator.onLine);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setCanPromptInstall(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanPromptInstall(false);
      promptRef.current = null;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator && window.isSecureContext && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          registrationRef.current = registration;
          setServiceWorkerActive(true);
          if (registration.waiting) setUpdateReady(true);
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            installing?.addEventListener("statechange", () => {
              // A new worker that finished installing while an old one controls the page.
              if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
            });
          });
        })
        .catch(() => setServiceWorkerActive(false));

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        setUpdateReady(false);
        // Reload once the new worker takes control so the user sees the new build.
        const key = "naijadeals:sw-reloaded";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
        }
      });
    }

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const prompt = promptRef.current;
    if (!prompt) return "unavailable" as const;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    promptRef.current = null;
    setCanPromptInstall(false);
    return choice.outcome;
  }, []);

  const applyUpdate = useCallback(() => {
    registrationRef.current?.waiting?.postMessage("SKIP_WAITING");
  }, []);

  const value = useMemo(
    () => ({ capabilities, online, installed, canPromptInstall, install, updateReady, applyUpdate, serviceWorkerActive }),
    [capabilities, online, installed, canPromptInstall, install, updateReady, applyUpdate, serviceWorkerActive]
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) throw new Error("usePlatform must be used inside PlatformProvider");
  return context;
}
