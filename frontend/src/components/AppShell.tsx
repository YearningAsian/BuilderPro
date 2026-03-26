"use client";

import { usePathname } from "next/navigation";
import Navigation from "@/components/Navigation";

const AUTH_ROUTES = ["/signin", "/signup", "/join-invite", "/forgot-password"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  return (
    <>
      {!isAuthRoute && <Navigation />}
      <main className={isAuthRoute ? "min-h-screen" : "md:ml-56 pt-14 md:pt-0 min-h-screen"}>
        {children}
      </main>
    </>
  );
}
