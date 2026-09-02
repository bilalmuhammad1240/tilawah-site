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

export const metadata: Metadata = {
  title: "Tilawah — Recitação ao vivo",
  description:
    "Quando tiveres tempo, encontra alguém para ouvir a tua recitação.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body
        className={`${newsreader.variable} ${workSans.variable} ${ibmPlexMono.variable} min-h-screen p-0 sm:p-6`}
      >
        <div id="app" className="w-full flex justify-center">
          {children}
        </div>
        <CallListener />
      </body>
    </html>
  );
}
