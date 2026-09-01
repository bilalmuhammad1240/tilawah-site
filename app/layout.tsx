import type { Metadata } from "next";
import { Newsreader, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import CallListener from "@/components/CallListener";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-work-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata = {
  title: 'Tilawah',
  description: 'App de recitação e chamadas ao vivo',
  manifest: '/manifest.json',
  themeColor: '#0a2e2b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body
        className={`${newsreader.variable} ${workSans.variable} ${ibmPlexMono.variable} flex items-center justify-center p-6`}
      >
        <div id="app" className="w-full flex justify-center">
          {children}
        </div>
        <CallListener />
      </body>
    </html>
  );
}
