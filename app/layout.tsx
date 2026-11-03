import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "IELTS Speaking Mock Test | 海归湾",
  description: "A realistic three-part IELTS-style speaking practice test with evidence-backed feedback."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16102b"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* TB counter: page views plus taps/hovers/copies on the data-who phone links */}
        <Script src="https://jointuni.turtlebayedu.com/api/count.js?site=tools" strategy="afterInteractive" />
      </body>
    </html>
  );
}
