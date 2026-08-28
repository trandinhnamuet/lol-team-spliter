import type { Metadata } from "next";
import { Cinzel, Cormorant, Inter } from "next/font/google";
import Link from "next/link";
import KeyStatusBar from "@/components/KeyStatusBar";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  variable: "--font-cinzel",
  display: "swap",
});

const cormorant = Cormorant({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "variable",
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "variable",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LoL Team Splitter",
  description: "Chia team LMHT cân bằng theo rank qua Riot API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`dark ${cinzel.variable} ${cormorant.variable} ${inter.variable}`}>
      <body className="hex-body min-h-screen antialiased">
        <div className="hex-vignette" aria-hidden="true" />
        <header className="hex-header sticky top-0 z-40">
          <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="hex-brand group flex items-center gap-2">
              <span className="hex-brand-glyph">⬡</span>
              <span className="font-display text-lg tracking-[0.08em] text-hex-gold-100">
                LOL TEAM SPLITTER
              </span>
            </Link>
            <nav className="ml-auto flex gap-1 text-sm">
              <Link href="/" className="hex-nav-link">
                Chia team
              </Link>
              <Link href="/admin" className="hex-nav-link">
                Admin
              </Link>
            </nav>
          </div>
          <div className="hex-header-edge" aria-hidden="true" />
        </header>
        <KeyStatusBar />
        <main className="relative z-10 mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
