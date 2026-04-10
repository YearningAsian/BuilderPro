import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { StoreProvider } from "@/hooks/useStore";
import { QueryProvider } from "@/providers/QueryProvider";

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
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased bg-gray-50">
        <QueryProvider>
          <StoreProvider>
            <AppShell>{children}</AppShell>
          </StoreProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
