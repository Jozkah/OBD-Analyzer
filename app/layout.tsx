import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://datalog.help"
const SITE_TITLE = "OBD Analyzer — datalog.help"
const SITE_DESCRIPTION =
  "Fast, fully client-side OBD-II telemetry analyzer. Drop in a CSV and explore your drive with interactive charts, a pannable GPS track map, and gear analysis — no account, nothing leaves your browser."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "OBD Analyzer",
  keywords: ["OBD-II", "OBD2", "telemetry", "car logging", "datalog", "GPS track", "gear ratios", "Car Scanner"],
  authors: [{ name: "Jozkah" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "OBD Analyzer",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og-image.png", alt: "OBD Analyzer dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070d" },
    { media: "(prefers-color-scheme: light)", color: "#f5f8fc" },
  ],
  width: "device-width",
  initialScale: 1,
}

// Applied before first paint so the stored (or system) theme is in place with no flash of
// the wrong palette. Falls back to the system preference when nothing is stored, and to
// dark if anything throws (e.g. localStorage blocked). Key kept in sync with page.tsx.
const themeInitScript = `(function(){try{var t=localStorage.getItem("obd-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}var e=document.documentElement;e.classList.remove("light","dark");e.classList.add(t);e.style.colorScheme=t;}catch(_){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
