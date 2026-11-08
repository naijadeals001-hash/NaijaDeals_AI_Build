"use client";

import { useEffect, useState } from "react";

/**
 * Renders exactly one home tree: the mobile composition below the lg breakpoint
 * and the desktop composition above it. Rendering both (merely hidden by CSS)
 * duplicated carousel controls and player interactions in the accessibility
 * tree — this keeps a single source of interactive elements.
 */
export function MobileHomeSwitch({
  mobile,
  desktop
}: {
  mobile: React.ReactNode;
  desktop: React.ReactNode;
}) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsMobile(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  if (isMobile === null) {
    return <div className="min-h-[60vh]" aria-hidden />;
  }
  return <>{isMobile ? mobile : desktop}</>;
}
