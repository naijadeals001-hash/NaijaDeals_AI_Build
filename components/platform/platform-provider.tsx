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
  /** Set when the user accepts an update; only that replacement reloads the page. */
  const updateRequestedRef = useRef(false);
  /** In-memory one-shot so a controllerchange can never start a reload loop. */
  const reloadedForUpdateRef = useRef(false);

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

    let disposed = false;
    let registered: ServiceWorkerRegistration | null = null;
    let updateFoundHandler: (() => void) | null = null;
    let controllerChangeHandler: (() => void) | null = null;

    if ("serviceWorker" in navigator && window.isSecureContext && process.env.NODE_ENV === "production") {
      // Whether this page was already controlled *before* we register. A first
      // install claims the page through clients.claim(), which fires
      // controllerchange but replaces nothing the user was already using.
      let controllerWasPresent = Boolean(navigator.serviceWorker.controller);

      const onControllerChange = () => {
        const replacedExistingController = controllerWasPresent;
        controllerWasPresent = Boolean(navigator.serviceWorker.controller);
        setUpdateReady(false);
        // Reload only when the user-applied update replaced a controller this
        // page was already using. A first-install claim must not reload: that
        // aborts an in-flight navigation (for example an immediate home -> Shop
        // click). The in-memory one-shot stops any reload loop.
        if (!replacedExistingController || !updateRequestedRef.current || reloadedForUpdateRef.current) return;
        reloadedForUpdateRef.current = true;
        window.location.reload();
      };
      controllerChangeHandler = onControllerChange;
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          if (disposed) return;
          registered = registration;
          registrationRef.current = registration;
          setServiceWorkerActive(true);
          // A worker installed while this page was closed is already waiting.
          if (registration.waiting) setUpdateReady(true);
          updateFoundHandler = () => {
            const installing = registration.installing;
            installing?.addEventListener("statechange", () => {
              if (disposed) return;
              // Installed while an old worker still controls the page: it waits
              // for the user, who sees the update banner.
              if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
            });
          };
          registration.addEventListener("updatefound", updateFoundHandler);
        })
        .catch(() => setServiceWorkerActive(false));
    }

    return () => {
      disposed = true;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (controllerChangeHandler) navigator.serviceWorker.removeEventListener("controllerchange", controllerChangeHandler);
      if (registered && updateFoundHandler) registered.removeEventListener("updatefound", updateFoundHandler);
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
    const waiting = registrationRef.current?.waiting;
    // Nothing to activate: the worker may already have activated in another tab.
    if (!waiting) return;
    // Mark the replacement as user-requested so controllerchange reloads once.
    updateRequestedRef.current = true;
    waiting.postMessage("SKIP_WAITING");
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
