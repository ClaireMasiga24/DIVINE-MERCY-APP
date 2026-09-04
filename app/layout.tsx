import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SWRegister from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Divine Mercy Seeta|Jesus,I trust in You",
  description:
    "Divine Mercy Seeta Parish — prayer alarms, holy hour, meetings, and community for the parish family.",
  applicationName: "Divine Mercy Seeta",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Divine Mercy",
    statusBarStyle: "default",
    // Startup image isn't required on modern iOS — iOS picks the touch
    // icon and a solid background-color until the page paints.
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // Matches the parish sky background so the status bar blends with the app.
  themeColor: "#c9a24e",
  // Standard PWA viewport — keeps the layout correct on phones and lets iOS
  // treat the page as a real web app (otherwise content jumps under the URL
  // bar when the user scrolls).
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          iOS-specific PWA tags that Next's <Metadata /> API doesn't expose:
          - apple-touch-icon: home-screen icon when installed via "Add to Home Screen"
          - mobile-web-app-capable: full-screen, no Safari chrome
          - apple-mobile-web-app-status-bar-style: matches the theme color
          - viewport-fit=cover handled via the export above
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
