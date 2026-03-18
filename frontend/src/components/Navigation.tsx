"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * HubSpot-inspired sidebar navigation.
 * - Dark charcoal left rail on desktop
 * - Collapsible hamburger on mobile (slides down)
 * - Active link highlighted with orange accent
 */

/* ── Icon helpers (inline SVG to avoid external deps) ──────── */
const icons: Record<string, React.ReactNode> = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0v-6a1 1 0 011-1h2a1 1 0 011 1v6m-6 0h6" />
    </svg>
  ),
  materials: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  projects: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6m-3 4v6m-3-3h6" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1110.65 4.65a7.5 7.5 0 016 12" />
    </svg>
  ),
};

interface NavItem {
  label: string;
  href: string;
  icon: keyof typeof icons;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "dashboard" },
  { label: "Materials", href: "/materials", icon: "materials" },
  { label: "Projects", href: "/projects", icon: "projects" },
  { label: "Search", href: "/search", icon: "search" },
];

export default function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-56 bg-[#2d3748] text-white z-30">
        {/* Brand */}
        <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10">
          <span className="text-xl font-bold tracking-tight text-orange-400">
            Builder
          </span>
          <span className="text-xl font-bold tracking-tight">Pro</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-orange-500/20 text-orange-300"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {icons[item.icon]}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 text-xs text-gray-400">
          BuilderPro v0.1
        </div>
      </aside>

      {/* ── Mobile header ────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-[#2d3748] flex items-center justify-between px-4 z-30">
        <span className="text-lg font-bold text-orange-400">
          Builder<span className="text-white">Pro</span>
        </span>
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="p-2 text-gray-300 hover:text-white"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden fixed top-14 inset-x-0 bg-[#2d3748] border-t border-white/10 z-30 py-2 px-3 space-y-1 shadow-lg">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  active
                    ? "bg-orange-500/20 text-orange-300"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {icons[item.icon]}
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
