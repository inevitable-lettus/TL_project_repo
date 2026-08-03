import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { menuLink } from "@/components/ui";
import "./globals.css";
import { MotionProvider } from "./motion-provider";
import { ScrollProgress } from "./scroll-progress";
import { UserMenu } from "./user-menu";

// Self-hosted via next/font (downloaded at build, served same-origin).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Tinkerer Lab",
  description: "Projects from the university makerspace",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${spaceGrotesk.variable} ${dmSans.variable} ${jetBrainsMono.variable}`}
    >
      <head>
        {/* Scroll reveals start at opacity 0, so without JavaScript they would
            never play. Nothing on a public archive may depend on hydration. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="blueprint-grid flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b-2 border-border-default-strong bg-menu-bar">
          {/* Wraps to two rows on narrow phones — the link group alone is
              wider than 375px, and the page must never scroll sideways. */}
          <nav className="mx-auto flex min-h-12 max-w-[1280px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 md:h-12 md:flex-nowrap md:px-6 md:py-0">
            <Link href="/" className="group flex items-center gap-2 py-1">
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center border-2 border-border-default-strong bg-safety-yellow font-display text-2xs font-bold text-ink transition-transform duration-120 ease-out-quart group-hover:-translate-y-px motion-reduce:transition-none"
              >
                TL
              </span>
              <span className="font-mono text-sm font-bold uppercase tracking-[0.12em] text-heading">
                Tinkerer_Lab
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
              <Link href="/projects" className={menuLink}>
                Browse
              </Link>
              <UserMenu />
            </div>
          </nav>
          <ScrollProgress />
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 md:px-6 md:py-14">
          <MotionProvider>{children}</MotionProvider>
        </main>
        <footer className="mt-auto border-t-2 border-border-default-strong bg-ink">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-5 md:px-6">
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-safety-yellow">
              UNIVERSITY_TINKERER_LABORATORY
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-on-ink opacity-60">
              Built by hand. Documented for keeps.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
