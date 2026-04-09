"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Navigation from "@/components/Navigation";
import { getActiveSession, refreshSessionActivity } from "@/lib/auth";
import { useSignOut } from "@/hooks/useSignOut";

const AUTH_ROUTES = ["/signin", "/signup", "/join-invite", "/forgot-password"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getActiveSession>>(null);
  const { signOut, isSigningOut } = useSignOut();

  useEffect(() => {
    const syncSession = () => setCurrentUser(getActiveSession());
    const timer = window.setTimeout(syncSession, 0);
    window.addEventListener("focus", syncSession);
    window.addEventListener("storage", syncSession);

    const activityHandler = () => refreshSessionActivity();
    window.addEventListener("click", activityHandler);
    window.addEventListener("keydown", activityHandler);
    window.addEventListener("visibilitychange", activityHandler);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", syncSession);
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("click", activityHandler);
      window.removeEventListener("keydown", activityHandler);
      window.removeEventListener("visibilitychange", activityHandler);
    };
  }, []);

  const initials = currentUser?.email ? currentUser.email.slice(0, 2).toUpperCase() : "BP";
  const isAdmin = currentUser?.role === "admin";
  const avatarClasses = isAdmin
    ? "bg-orange-100 text-orange-700"
    : "bg-blue-100 text-blue-700";
  const roleBadgeClasses = isAdmin
    ? "bg-orange-100 text-orange-700 border-orange-200"
    : "bg-blue-100 text-blue-700 border-blue-200";
  const roleLabel = isAdmin ? "Workspace Admin" : "Invited Worker";

  return (
    <>
      {!isAuthRoute && <Navigation />}
      {!isAuthRoute && (
        <header className="hidden md:flex fixed top-0 right-0 left-56 h-14 bg-white border-b border-gray-200 z-20 items-center justify-end px-6">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${avatarClasses}`}>
                {initials}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{currentUser?.email ?? "Builder User"}</p>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roleBadgeClasses}`}>
                  {roleLabel}
                </span>
              </div>
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </button>
                {currentUser?.role === "admin" && (
                  <Link
                    href="/settings"
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                  disabled={isSigningOut}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSigningOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>
            )}
          </div>
        </header>
      )}
      <main className={isAuthRoute ? "min-h-screen" : "md:ml-56 pt-14 md:pt-14 min-h-screen"}>
        {children}
      </main>
    </>
  );
}
