import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
import { QueryProvider } from "@/components/QueryProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Edge Trading",
  applicationName: "Edge Trading",
  description:
    "Premium dark-mode crypto portfolio tracker with DCA engine and institutional-grade insights.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Edge Trading",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Edge Trading",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <QueryProvider>
          <PwaRegister />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
