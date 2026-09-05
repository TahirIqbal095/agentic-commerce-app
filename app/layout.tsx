import type { Metadata } from "next";
import { DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import { FALLBACK_METADATA } from "./_components/shopping-assistant/brand-presentation";

/**
 * The typefaces the Brand's theme names. The theme's font tokens point at
 * these families, so loading anything else would leave the tokens unreachable.
 */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

/**
 * What the document says when no page has titled it from the Brand record. It
 * names what is sold rather than how the Storefront is built, so a browser tab
 * or a search result is meaningful before it is opened.
 */
export const metadata: Metadata = FALLBACK_METADATA;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
