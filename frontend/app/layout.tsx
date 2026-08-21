import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/*
  Three roles, three faces. Space Grotesk carries the bold, upload-and-earn
  energy in headlines; Inter stays out of the way in body copy; JetBrains
  Mono handles anything that is data — balances, counts, step numbers — so
  machine values are visibly machine values.
*/
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Tele Upload — upload files, get paid when people download them",
  description:
    "Upload a file, share a link, get paid every time someone downloads it. No account needed to receive a file — just to earn from one.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-body antialiased">{children}</body>
    </html>
  );
}
