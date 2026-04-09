"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSignOut } from "@/hooks/useSignOut";
import { getActiveSession, switchActiveWorkspace } from "@/lib/auth";
import { authApi, type SessionWorkspaceSummary } from "@/services/api";

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
  orders: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M9 8h6m-9 12h12a2 2 0 002-2V6a2 2 0 00-2-2h-1.5a1 1 0 01-.8-.4l-.9-1.2A1 1 0 0014 2h-4a1 1 0 00-.8.4l-.9 1.2a1 1 0 01-.8.4H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  customers: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5V4H2v16h5m10 0v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2m12 0H7m8-11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  vendors: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-4 7 4v13M9 10h.01M9 13h.01M9 16h.01M15 10h.01M15 13h.01M15 16h.01" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1110.65 4.65a7.5 7.5 0 016 12" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1 1 0 011.35-.936l.906.363a1 1 0 001.06-.218l.642-.643a1 1 0 011.414 0l1.414 1.414a1 1 0 010 1.414l-.643.643a1 1 0 00-.218 1.06l.363.906a1 1 0 01-.936 1.35H16a1 1 0 00-.949.684l-.31.93a1 1 0 01-.95.684h-2.582a1 1 0 01-.95-.684l-.31-.93A1 1 0 008 10H6.964a1 1 0 01-.936-1.35l.363-.906a1 1 0 00-.218-1.06L5.53 6.04a1 1 0 010-1.414l1.414-1.414a1 1 0 011.414 0l.643.643a1 1 0 001.06.218l.264-.106z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.5A3.5 3.5 0 1012 8.5a3.5 3.5 0 000 7z" />
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
  { label: "Templates", href: "/projects/templates", icon: "projects" },
  { label: "Orders", href: "/orders", icon: "orders" },
  { label: "Customers", href: "/customers", icon: "customers" },
  { label: "Vendors", href: "/vendors", icon: "vendors" },
  { label: "Search", href: "/search", icon: "search" },
];

export default function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getActiveSession>>(null);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<SessionWorkspaceSummary[]>([]);
  const [workspaceError, setWorkspaceError] = useState("");
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const { signOut, isSigningOut } = useSignOut();

  useEffect(() => {
    const syncSession = () => setCurrentUser(getActiveSession());
    const timer = window.setTimeout(syncSession, 0);
    window.addEventListener("focus", syncSession);
    window.addEventListener("storage", syncSession);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.accessToken) {
      return;
    }

    let active = true;

    async function loadWorkspaces() {
      try {
        const workspaces = await authApi.listWorkspaces();
        if (!active) return;
        setAvailableWorkspaces(workspaces);
      } catch (error) {
        if (!active) return;
        setWorkspaceError(error instanceof Error ? error.message : "Unable to load workspaces.");
      }
    }

    void loadWorkspaces();

    return () => {
      active = false;
    };
  }, [currentUser?.accessToken, currentUser?.workspaceId]);

  const navItems = useMemo(
    () =>
      currentUser?.role === "admin"
        ? [...NAV_ITEMS, { label: "Settings", href: "/settings", icon: "settings" as const }]
        : NAV_ITEMS,
    [currentUser?.role],
  );

  const isAdmin = currentUser?.role === "admin";
  const roleLabel = isAdmin ? "Workspace Admin" : "Invited Worker";
  const roleBadgeClasses = isAdmin
    ? "border-orange-400/30 bg-orange-500/20 text-orange-200"
    : "border-blue-400/30 bg-blue-500/20 text-blue-200";
  const visibleWorkspaces = currentUser?.accessToken ? availableWorkspaces : [];
  const canSwitchWorkspaces = visibleWorkspaces.length > 1;

  const handleWorkspaceChange = (workspaceId: string) => {
    const nextWorkspace = visibleWorkspaces.find((workspace) => workspace.workspace_id === workspaceId);
    if (!nextWorkspace || workspaceId === currentUser?.workspaceId) {
      return;
    }

    setWorkspaceError("");
    setIsSwitchingWorkspace(true);

    const nextSession = switchActiveWorkspace(nextWorkspace.workspace_id, nextWorkspace.workspace_name);
    if (!nextSession) {
      setIsSwitchingWorkspace(false);
      setWorkspaceError("Unable to update the active workspace.");
      return;
    }

    setCurrentUser(nextSession);
    setMobileOpen(false);
    window.location.reload();
  };

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
          {navItems.map((item) => {
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
        <div className="px-3 py-4 border-t border-white/10 space-y-2">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Signed in as</p>
            <p className="mt-1 truncate text-sm font-medium text-white">{currentUser?.email ?? "builder@pro"}</p>
            <span className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roleBadgeClasses}`}>
              {roleLabel}
            </span>
            <p className="mt-2 text-xs text-gray-300">{currentUser?.workspaceName ?? "No workspace selected"}</p>
            {canSwitchWorkspaces && (
              <label className="mt-3 block text-[11px] uppercase tracking-wide text-gray-400">
                Active workspace
                <select
                  value={currentUser?.workspaceId ?? ""}
                  onChange={(event) => handleWorkspaceChange(event.target.value)}
                  disabled={isSwitchingWorkspace}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#253041] px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  {visibleWorkspaces.map((workspace) => (
                    <option key={workspace.workspace_id} value={workspace.workspace_id}>
                      {workspace.workspace_name} ({workspace.role})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {currentUser?.accessToken && workspaceError && <p className="mt-2 text-xs text-red-300">{workspaceError}</p>}
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={isSigningOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 17l5-5m0 0l-5-5m5 5H9m4 5v1a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h5a2 2 0 012 2v1" />
            </svg>
            {isSigningOut ? "Signing out..." : "Sign Out"}
          </button>
          <div className="px-2 text-xs text-gray-400">BuilderPro v0.1</div>
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
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Workspace</p>
            <p className="mt-1 text-sm font-medium">{currentUser?.workspaceName ?? "No workspace selected"}</p>
            {canSwitchWorkspaces && (
              <select
                value={currentUser?.workspaceId ?? ""}
                onChange={(event) => handleWorkspaceChange(event.target.value)}
                disabled={isSwitchingWorkspace}
                className="mt-3 w-full rounded-md border border-white/10 bg-[#253041] px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {visibleWorkspaces.map((workspace) => (
                  <option key={workspace.workspace_id} value={workspace.workspace_id}>
                    {workspace.workspace_name} ({workspace.role})
                  </option>
                ))}
              </select>
            )}
            {currentUser?.accessToken && workspaceError && <p className="mt-2 text-xs text-red-300">{workspaceError}</p>}
          </div>
          {navItems.map((item) => {
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
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              void signOut();
            }}
            disabled={isSigningOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 17l5-5m0 0l-5-5m5 5H9m4 5v1a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h5a2 2 0 012 2v1" />
            </svg>
            {isSigningOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      )}
    </>
  );
}
