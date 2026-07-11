import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Colora - PDF Annotation Toolkit",
  description: "Design and edit PDFs with Colora, the premium all-in-one PDF annotation toolkit. Inspired by soft pastel colors and organic note-taking.",
  applicationName: "Colora",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Colora",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#E5D4FF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={instrumentSans.variable}>
      <body className={instrumentSans.className}>
        {children}
      </body>
    </html>
  );
}
