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
  themeColor: "#05070d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
