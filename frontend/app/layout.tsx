import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { UserMenu } from "./user-menu";

// Self-hosted via next/font (downloaded at build, served same-origin).
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Tinkerer Lab",
  description: "Projects from the university makerspace",
};

const menuLink =
  "rounded-base px-2.5 py-1 text-[13px] font-medium text-heading " +
  "transition-colors duration-[120ms] hover:bg-neutral-secondary-medium";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${newsreader.variable} ${dmSans.variable} ${geistMono.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-border-default bg-menu-bar">
          <nav className="mx-auto flex h-9 max-w-[1100px] items-center justify-between px-4 md:px-6">
            <Link
              href="/"
              className={`${menuLink} font-mono text-[12px] font-semibold uppercase tracking-[0.4px]`}
            >
              Tinkerer_Lab
            </Link>
            <div className="flex items-center gap-1">
              <Link href="/projects" className={menuLink}>
                Browse
              </Link>
              <Link href="/machines" className={menuLink}>
                Machines
              </Link>
              <UserMenu />
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 md:px-6 md:py-12">
          {children}
        </main>
        <footer className="border-t border-border-default bg-menu-bar">
          <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-3 md:px-6">
            <span className="font-mono text-[12px] tracking-[0.4px] text-body-subtle">
              UNIVERSITY_TINKERER_LABORATORY
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
