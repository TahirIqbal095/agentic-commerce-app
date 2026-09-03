"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Supplies the Customer's Light, Dark, or System appearance choice.
 *
 * The choice defaults to System so the Storefront is already correct on a first
 * visit, and is persisted so it survives a return. The appearance library calls
 * this a theme; the Storefront calls it an appearance, because the Brand's
 * theme is a different thing entirely.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
