import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Bolder display face used on the landing page's major headlines for a more
// premium, tech-forward feel -- everything else (UI, body copy) stays on
// Geist Sans.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    template: `%s · ${BRAND_NAME}`,
  },
  description:
    "Analyse ton annonce de location courte durée en moins d'une minute et découvre ce qui peut freiner tes futurs voyageurs.",
  openGraph: {
    title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    description:
      "Analyse ton annonce en moins d'une minute et découvre ce qui peut freiner tes futurs voyageurs.",
    url: siteUrl,
    siteName: BRAND_NAME,
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    description:
      "Analyse ton annonce en moins d'une minute et découvre ce qui peut freiner tes futurs voyageurs.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
