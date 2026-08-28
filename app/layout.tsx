import type { Metadata } from "next";
import { Cinzel, Cormorant, Inter } from "next/font/google";
import Link from "next/link";
import KeyStatusBar from "@/components/KeyStatusBar";
import HexLogo from "@/components/hex/HexLogo";
import MagicDust from "@/components/hex/MagicDust";
import NavLinks from "@/components/hex/NavLinks";
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
  title: "LoL Team Splitter — Hextech Draft",
  description: "Chia team LMHT cân bằng theo rank qua Riot API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${cinzel.variable} ${cormorant.variable} ${inter.variable}`}>
      <body className="min-h-screen antialiased">
        <div className="hex-gridlines" aria-hidden="true" />
        <MagicDust />
        <div className="hex-vignette" aria-hidden="true" />

        <header className="hex-header sticky top-0 z-40">
          <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="group flex items-center gap-3">
              <HexLogo />
              <span className="flex flex-col leading-tight">
                <span className="font-display text-base font-bold tracking-[0.14em] text-gold-100">
                  LOL TEAM SPLITTER
                </span>
                <span className="font-display text-[0.55rem] font-bold tracking-[0.42em] text-magic-300">
                  HEXTECH DRAFT
                </span>
              </span>
            </Link>
            <NavLinks />
          </div>
          <div className="hex-header-edge" aria-hidden="true" />
        </header>

        <KeyStatusBar />

        <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-10">{children}</main>

        <footer className="relative z-10 mx-auto max-w-5xl px-4 pb-8">
          <div className="hex-divider" />
          <p className="text-center font-display text-[0.6rem] uppercase tracking-[0.3em] text-steel-300">
            Forged in the spirit of Hextech
          </p>
        </footer>
      </body>
    </html>
  );
}
