import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-oswald" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "League of Dreams", template: "%s · League of Dreams" },
  description: "Live scores, standings and 20 years of history for the League of Dreams fantasy baseball league, est. 2007.",
  openGraph: { siteName: "League of Dreams", type: "website" },
  appleWebApp: { title: "LOD", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#070c1f" };

const NAV = [
  { href: "/", label: "Home" },
  { href: "/standings", label: "Standings" },
  { href: "/schedule", label: "Schedule" },
  { href: "/teams", label: "Teams" },
  { href: "/history", label: "History" },
  { href: "/records", label: "Records" },
  { href: "/news", label: "News" },
  { href: "/rules", label: "Rules" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        <header className="sticky top-0 z-30 border-b-4 border-red bg-navy-900/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
            <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="League of Dreams home">
              <Image src="/league-badge.png" alt="" width={62} height={30} className="rounded-[5px]" priority />
              <span className="font-display text-xl font-bold uppercase leading-none tracking-wide sm:text-2xl">
                League <span className="text-red">of</span> Dreams
              </span>
            </Link>
          </div>
          <nav className="mx-auto max-w-6xl overflow-x-auto px-2" aria-label="Main">
            <ul className="flex gap-1 whitespace-nowrap pb-1.5">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className="block rounded px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-mute hover:bg-navy-700 hover:text-chalk"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
        <footer className="border-t border-line py-6 text-center text-xs text-mute">
          League of Dreams · est. 2007 ·{" "}
          <Link href="/login" className="hover:text-chalk">Commissioner</Link>
        </footer>
      </body>
    </html>
  );
}
