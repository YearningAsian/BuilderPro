import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { StoreProvider } from "@/hooks/useStore";
import { QueryProvider } from "@/providers/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuilderPro - Materials Management",
  description: "Construction materials and cost management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <QueryProvider>
          <StoreProvider>
            <Navigation />
            {/* Main content offset from sidebar on desktop, from header on mobile */}
            <main className="md:ml-56 pt-14 md:pt-0 min-h-screen">
              {children}
            </main>
          </StoreProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
