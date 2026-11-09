"use client";

import { createContext, useContext } from "react";

/**
 * The homepage design chosen for this request, published by the root layout so
 * the client-side AppShell can skip its own chrome. A Server Component cannot
 * read a child's DOM, so the variant is passed down as data instead.
 */
const VariantContext = createContext<string | null>(null);

export function HomeVariantProvider({ variant, children }: { variant: string | null; children: React.ReactNode }) {
  return <VariantContext.Provider value={variant}>{children}</VariantContext.Provider>;
}

export function useHomeVariant() {
  return useContext(VariantContext);
}
