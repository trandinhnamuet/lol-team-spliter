import type { Metadata } from "next";
import Link from "next/link";
import KeyStatusBar from "@/components/KeyStatusBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoL Team Splitter",
  description: "Chia team LMHT cân bằng theo rank qua Riot API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="border-b border-zinc-800 bg-zinc-900">
          <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold text-blue-400">
              ⚔️ LoL Team Splitter
            </Link>
            <nav className="ml-auto flex gap-4 text-sm">
              <Link href="/" className="text-zinc-300 hover:text-white">
                Chia team
              </Link>
              <Link href="/admin" className="text-zinc-300 hover:text-white">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <KeyStatusBar />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
