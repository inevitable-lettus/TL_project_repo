import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { UserMenu } from "./user-menu";

// TODO(design pass): fonts, tokens, and all visual styling come from the
// TypeUI storytelling+nostalgia prompts refined by the design skills
// (CLAUDE.md hard rule 7). Until then the shell stays deliberately plain.

export const metadata: Metadata = {
  title: "Tinkerer Lab",
  description: "Projects from the university makerspace",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-neutral-200">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold">
              Tinkerer Lab
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/projects">Browse</Link>
              <UserMenu />
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-neutral-200">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-neutral-500">
            University Tinkerer Laboratory
          </div>
        </footer>
      </body>
    </html>
  );
}
