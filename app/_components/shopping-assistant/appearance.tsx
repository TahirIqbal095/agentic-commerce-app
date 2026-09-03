"use client";

import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";

/**
 * The Customer's Light, Dark, or System appearance choice.
 *
 * The choice defaults to System so the Storefront is already correct on a first
 * visit, and is persisted so it survives a return.
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

export { useTheme };
